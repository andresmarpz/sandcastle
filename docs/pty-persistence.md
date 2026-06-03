# PTY persistence across app restarts

**Status:** proposal / plan for review
**Goal:** running shells (and the processes inside them — `claude`, dev servers, builds) survive a full quit + relaunch of the desktop app, then re-attach to their original panes.
**Chosen mechanism:** wrap every shell in a detachable [`abduco`](https://www.brain-dump.org/projects/abduco/) session (ISC-licensed, bundled).

This doc is the implementation plan. No code has been written yet.

---

## 1. Why PTYs die today

Two independent reasons, both in the main process:

1. **The PTY master fd is owned by the Electron main process.** Shells are spawned with `nodePty.spawn()` directly inside main (`apps/desktop/src/main/pty.ts:178`) and tracked in an in-memory `Map<id, Session>` (`pty.ts:19`). When main exits, the master fd closes, the shell gets `SIGHUP`, and the whole process tree goes down with it.
2. **The app also kills them on purpose.** `before-quit` calls `disposeAllSessions()` (`pty.ts:379`, wired in `index.ts:300`), which `killTree`s every shell — `SIGHUP` to the process group then `SIGKILL` after a 2s grace (`pty.ts:61-115`). It even tears them down on a *renderer reload* via `terminal:renderer-ready` (`pty.ts:257-259`).

So nothing outlives the app to hold the master fd open. Persisting the tab tree (which `tabs.ts` already does) only gives back empty shells.

The fix is to make a **separate process own the PTY master and the shell**, one that is *not* a child of Electron's process tree, so quitting the app merely detaches.

---

## 2. Approach: `abduco` wrapper

Instead of spawning the shell directly, spawn an `abduco` **client** that attaches to a named session. The first attach forks a daemonized **server** (its own session via `setsid`) that owns the PTY and runs the shell. Killing the client detaches; the server + shell keep running.

```
Today:
  Electron main ──spawn──▶ zsh ──▶ claude            (one tree; quit ⇒ SIGHUP ⇒ dead)

Proposed:
  Electron main ──spawn──▶ abduco client ──socket──▶ abduco server (daemon, setsid) ──▶ zsh ──▶ claude
                                  ▲
                  quit kills only the client; server + zsh + claude keep running
```

On relaunch, the renderer rebuilds tabs from the persisted pane tree (leafIds survive — see §3), and each pane spawns a fresh `abduco` client that **re-attaches** to its still-alive server. Running processes are intact.

### Why `abduco` over `tmux`/`dtach`

- **vs tmux:** tmux renders its own status bar, copy-mode, and prefix-key UI that fights xterm.js for the terminal surface. `abduco` is a transparent attach/detach layer — it just pipes the PTY through, which is exactly what we want under xterm.js.
- **vs dtach:** functionally near-identical for our use, but `dtach` is GPLv2 and `abduco` is ISC — friendlier to bundle inside a distributed app. (Either ships fine as a separately-exec'd binary; this is a conservative licensing choice.)

### Scope of "survives"

- Survives **app quit/relaunch** and **renderer reload**. ✅
- Does **not** survive a **machine reboot** — the kernel restart kills all processes regardless. (This is why the socket dir lives in `$TMPDIR`; see §6. Tmp is cleared on reboot, which correctly matches process lifetime.)
- **Unix only.** `abduco` doesn't exist on Windows / ConPTY can't be detached this way. Windows keeps today's kill-on-quit behavior behind a platform guard (§11).

### 2.1 How detachment works (keeping a process independent of Electron)

Today's node-pty child dies with the app for two reasons: it lives in Electron's process tree / session / controlling-terminal lineage, and Electron holds the **PTY master fd** — when Electron exits the master closes, the slave delivers `SIGHUP` to the foreground group, and the shell dies (plus we SIGHUP the group ourselves on quit, `pty.ts:92`).

`abduco` breaks both via the classic daemonization dance:

1. `fork()` a server, then `setsid()` so it leads a **new session** — detached from Electron's controlling terminal and process group, so signals to Electron's group never reach it.
2. A second `fork()` so it can't reacquire a controlling tty and gets **reparented to `init`/pid 1** once the short-lived invocation (Electron's direct child) exits.
3. The **server owns the PTY master** and runs the shell on the slave, so the PTY's lifetime is bound to the *server*, not Electron.
4. The app talks to the shell over a **unix-domain socket**, not the master fd. The thing Electron spawns is a disposable **client** that relays bytes between the socket and xterm.

Mental model: **decouple "who owns the PTY master" (the surviving daemon) from "who streams it to the UI" (the throwaway client), joined by a socket.** Quitting kills only the client; a new client reconnects to the same socket later.

### 2.2 Process lifetime, cleanup & TTL

A detached server runs **indefinitely** — through a 30-minute closure or a 3-day one — until the shell exits, the pane is closed while the app is open (`killSession`), the machine reboots, or we reap it. With no time-based reap, this is an unbounded resource leak: a dev server keeps eating CPU/RAM and holding its port for hours after the app is "closed," invisibly. So we need a **TTL on detached sessions**.

The subtlety: the natural enforcer (Electron) is exactly what isn't running during downtime, so an Electron-side timer can't fire while closed. Two strategies:

| | **Lazy reap on launch** (recommended default) | **Active watchdog** (optional follow-up) |
|---|---|---|
| Mechanism | App touches a heartbeat file every ~30s. On launch, `downtime = now − mtime(heartbeat)`; past TTL ⇒ kill all our servers + sweep sockets and restore tabs with fresh shells; under TTL ⇒ reattach. | One detached watchdog process reads the same heartbeat and reaps sessions *while the app is closed* once the TTL elapses, then exits. |
| Reclaims resources during downtime? | ❌ (they run until reopen, then get reaped) | ✅ |
| Cost | A heartbeat file; **no extra process** | One always-running tiny daemon to manage |
| Answers the worry | "don't reattach stale junk / accumulate zombies forever" | "stop wasting battery/CPU while it's closed" |

Heartbeat-based downtime is robust across crashes/force-quits (it doesn't rely on `before-quit` running — the mtime is ≈ last-alive time, under-counting downtime by at most one heartbeat interval).

**Recommendation:** lazy reap, **TTL default 30 min, configurable** (incl. "never" for users who want a long build to survive a long closure). Add the watchdog only if reclaiming-while-closed proves necessary.

**Activity-aware refinement:** reuse the foreground-process detection from §5 to vary the TTL — reap idle shells (no foreground job) aggressively, but keep (or warn before killing) sessions with a live job like a build or dev server.

**Reaping survivors at launch** (lazy path): the persisted tabs give us every current `leafId`, hence the set of `sessionName` hashes we own. Scan `ps` for our `abduco` servers, kill those past the TTL (SIGHUP→SIGKILL their shell group; the server exits when its child dies) and `rm` their sockets — done before the renderer reattaches.

### 2.3 User-facing setting (`/settings`)

The TTL is exposed as a setting on the existing settings route (`SettingsRoute.tsx`). Presets:

**Off · 5 min · 30 min (default) · 1 hour · Forever**

- **Off** disables persistence entirely — `before-quit` kills as today (escape hatch for users who don't want background processes lingering).
- **Forever** never time-reaps (still reaped on pane-close / shell-exit / reboot / orphan sweep).

Storage must be **main-readable at startup**, because the lazy reap (§2.2) runs before the renderer loads — so it follows the established `claudeHooks.ts` pattern (`claudeHooks.ts:70-96`), **not** renderer localStorage (which main can't read at boot):

- A JSON file under `~/.sandcastle/`, loaded once at startup into a module var, atomic-written on change.
- Shape: `{ ptyKeepAliveMinutes: number | null }` — `0` = off, `N` = minutes, `null` = forever. Default `30`.

Both the reap logic (§2.2) and the detach-vs-kill gate (§4.3) read this value: when it's `0`/off, `detachAllSessions` falls back to `killTree` (no persistence at all). Changing it mid-session takes effect at the next quit.

---

## 3. Durable identity = `leafId`

The socket name must be stable across restarts. `leafId` is already the durable terminal identity:

- The pane tree (with leafIds) is persisted to `localStorage` under `sandcastle.tabs.v1` (`tabs.ts:264-265`).
- The code already treats leafId as the stable handle: *"Leaf ids are global UUIDs and terminals are tracked by leafId in the registry, so the running PTYs survive untouched"* (`tabs.ts:52-57`).

Today the PTY `sessionId` is `term-${leafId}-${Date.now()}` (`terminalRegistry.ts:306`) — the timestamp makes it **non-durable**, which is the one thing we must change. Two options:

- **(A) Drop the timestamp:** `sessionId = term-${leafId}`. Makes sessionId itself durable, which also makes the MCP token mapping (Phase 2) durable for free. Requires `terminal:create` to be safe when an id already exists — it already early-returns (`pty.ts:227`).
- **(B) Keep sessionId ephemeral, thread `leafId` separately** into `CreateOptions` and derive only the socket name from it.

**Recommendation: (A).** Simpler, and it sets up Phase 2. The only reason `Date.now()` exists is to avoid colliding with a not-yet-disposed session of the same leaf on soft reload; §10 handles that interaction directly, so the timestamp is no longer needed.

Either way, `leafId` must reach `createSession`. Add it to the `CreateOptions` type in three places: `preload/index.ts:4-12`, `pty.ts:45-55`, and the `create()` call in `terminalRegistry.ts:442-450`.

---

## 4. File-by-file changes (Phase 1)

### 4.1 `apps/desktop/src/main/abduco.ts` (new) — binary + session helpers

```ts
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import { app } from "electron";

// abduco is unix-only. Windows falls back to a plain shell (no persistence).
export const PERSISTENCE_SUPPORTED = process.platform !== "win32";

// Resolve the bundled binary. resources/** is asarUnpack'd (electron-builder.yml),
// so in prod it lives under process.resourcesPath; in dev, under the repo resources/.
export const abducoBin = (): string => {
  const arch = process.arch; // "arm64" | "x64"
  const name = `abduco-${process.platform}-${arch}`;
  return app.isPackaged
    ? join(process.resourcesPath, "bin", name)
    : join(app.getAppPath(), "resources", "bin", name);
};

// abduco nests sockets as <ABDUCO_SOCKET_DIR>/<argv0-basename>/<user>/<name>@<host>
// and sun_path caps at ~104 bytes on macOS. os.tmpdir() looks short but on macOS
// is /var/folders/<hash>/T (~48 bytes), which overflowed once abduco appended its
// own nesting → "create-session: File name too long". Anchor at a short fixed root.
export const socketDir = (): string => "/tmp/sandcastle";

// abduco addresses sessions by NAME inside ABDUCO_SOCKET_DIR. Hash leafId to a
// short, filesystem-safe name so the socket path stays well under the limit.
export const sessionName = (leafId: string): string =>
  createHash("sha256").update(leafId).digest("hex").slice(0, 16);

export const socketPath = (leafId: string): string =>
  join(socketDir(), sessionName(leafId));
```

> ⚠️ **Confirm against the bundled `abduco` man page:** exact flags below (`-A`, `-e`, redraw behavior) and whether it honors `ABDUCO_SOCKET_DIR` vs requiring `-` socket conventions. `abduco` versions vary; pin one (see §7) and verify before finalizing flags.

### 4.2 `pty.ts` — `createSession` (currently `:164-194`)

Wrap the spawn. The shell/env/args only take effect on **create**; on **reattach** `abduco` ignores them and connects to the existing server (whose shell keeps its original env — the root of the MCP-staleness issue, Phase 2).

```ts
const DETACH_KEY = "^g"; // neutralize accidental user-detach; we detach by killing the client
const KEEPALIVE_ON_QUIT = PERSISTENCE_SUPPORTED;

const createSession = async (sender, opts: CreateOptions) => {
  const shell = opts.shell ?? defaultShell();
  const cwd = opts.cwd ?? homeDir();
  const { env: mcpEnv, args: mcpArgs } = registerSession(opts.id, sender.id, opts.workspaceId, shell);
  const env = buildEnv({ ...opts.env, ...mcpEnv, SANDCASTLE_SESSION_ID: opts.id });

  let file: string, args: string[];
  if (PERSISTENCE_SUPPORTED) {
    await fs.mkdir(socketDir(), { recursive: true });
    env.ABDUCO_SOCKET_DIR = socketDir();
    file = abducoBin();
    // attach-or-create; neutralize detach key; run the shell as the session command
    args = ["-e", DETACH_KEY, "-A", sessionName(opts.leafId), shell, ...shellArgs(shell), ...mcpArgs];
  } else {
    file = shell;
    args = [...shellArgs(shell), ...mcpArgs];
  }

  const pty = nodePty.spawn(file, args, {
    name: "xterm-256color",
    cols: opts.cols ?? 80, rows: opts.rows ?? 24, cwd, env,
    useConpty: process.platform === "win32",
  });

  const session: Session = {
    id: opts.id, leafId: opts.leafId, pty, webContentsId: sender.id,
    shellPid: null, // resolved lazily, see §5
  };
  sessions.set(opts.id, session);
  watchRenderer(sender);
  wireSessionEvents(session);
  void resolveShellPid(session); // best-effort eager resolve for cwd/foreground/kill
};
```

`Session` (`pty.ts:13-17`) gains `leafId: string` and `shellPid: number | null`.

### 4.3 `pty.ts` — split **detach** vs **kill** (the core change)

Two distinct teardown paths, replacing the single `killTree` everywhere:

```ts
// User closed the pane → destroy the real session: kill the shell (under the
// abduco server, NOT pty.pid which is the client) + its group, then the client.
const killSession = (session: Session): void => {
  if (PERSISTENCE_SUPPORTED) {
    const shellPid = session.shellPid; // resolved server-child pid (§5)
    if (shellPid) {
      try { process.kill(-shellPid, "SIGHUP"); } catch {}
      setTimeout(() => { try { process.kill(-shellPid, "SIGKILL"); } catch {} }, KILL_GRACE_MS);
    }
    try { session.pty.kill(); } catch {}          // detach/kill the client
    void fs.rm(socketPath(session.leafId)).catch(() => {}); // drop stale socket
  } else {
    killTree(session.pty); // existing behavior (Windows / persistence off)
  }
};

// App quitting → DETACH ONLY: kill just the client, leave server+shell+socket.
const detachSession = (session: Session): void => {
  try { session.pty.kill(); } catch {} // client dies ⇒ abduco detaches; server lives
};

export const disposeSession = (id: string): void => {     // terminal:dispose (pane close)
  const s = sessions.get(id); if (!s) return;
  sessions.delete(id); unregisterSession(id); killSession(s);
};

export const detachAllSessions = (): void => {            // before-quit
  if (!PERSISTENCE_SUPPORTED) { disposeAllSessions(); return; }
  for (const s of sessions.values()) detachSession(s);
  sessions.clear();
};
```

- `index.ts:300` `before-quit`: call `detachAllSessions()` instead of `disposeAllSessions()`.
- `disposeSessionsForRenderer` (`pty.ts:125-133`, fired on window/`render-process-gone`): keep as **kill** — a window genuinely closing should reap its shells (otherwise every closed window orphans servers). Only the *app-level* quit detaches.

> Note: `killTree` SIGHUPs the group `-pid` (`pty.ts:92`). With abduco, `pty.pid` is the *client* in its own session, so the old `killTree` would no longer reach the shell anyway — hence `killSession` targets the resolved `shellPid`.

### 4.4 `pty.ts` — startup stale-socket sweep + reaper

On `registerPtyHandlers()`, sweep `socketDir()` for sockets whose server is dead (the shell exited while the app was down). `abduco -A` tolerates a stale socket, but sweeping keeps the dir clean and lets us know which leaves can actually reattach. A periodic reaper also removes sockets for leaves no longer present in any tab (orphans from closed-without-dispose paths).

### 4.5 Renderer + preload plumbing

- `preload/index.ts:4-12`: add `leafId: string` to `CreateOptions`.
- `terminalRegistry.ts:306`: `const sessionId = `term-${leafId}`;` (drop `Date.now()` — option A).
- `terminalRegistry.ts:442-450`: pass `leafId` in the `create({...})` call.
- **Repaint on (re)attach:** after create resolves, force one `scheduleResize(inst)` / a tiny dimension nudge so the shell receives a `SIGWINCH`. abduco (unlike `dtach -r winch`) doesn't auto-redraw on attach, so a running TUI (`claude`, `htop`, `lazygit`) is blank until it repaints — the SIGWINCH triggers that repaint. Plain-shell scrollback is still gone until Phase 3.

### 4.6 Settings plumbing (the §2.3 setting)

- **main** `src/main/ptySettings.ts` (new), mirroring `claudeHooks.ts`: owns `~/.sandcastle/settings.json` (`{ ptyKeepAliveMinutes: number | null }`, default `30`); `loadPtySettings()` awaited in `app.whenReady` *before* the startup reap; `getKeepAlive()` (sync, from cache) for the reap + detach gate; `setKeepAlive(v)` with the atomic `writeFileAtomic` helper.
- **IPC** (`pty.ts` `registerPtyHandlers`): `terminal:get-keepalive` → `number | null`; `terminal:set-keepalive` → persist + echo back. (Mirrors `claude:get/set-hooks-enabled`.)
- **preload** (`index.ts`, `terminal` API): `getKeepAliveMinutes()` / `setKeepAliveMinutes(v)`.
- **renderer** (`SettingsRoute.tsx`): a new `Section` ("Background terminals") with a preset selector. No `Select` primitive exists — build it from the existing `DropdownMenu` + `DropdownMenuRadioGroup`, or inline radio buttons styled like the local `Toggle`. State via `useState` + `useEffect` + IPC (like the hooks toggle, since it's main-owned config — not the Zustand+localStorage path the sound settings use). Copy: *"When you quit Sandcastle, terminals and their running processes stay alive in the background and reattach next launch. Choose how long to keep them before cleanup."*

---

## 5. Keeping cwd + foreground-process detection working

With abduco, `pty.pid` is the **client**, not the shell. Two recently-built features walk `pty.pid`'s descendants and would break:

- `getProcessCwd(pty.pid)` (`pty.ts:196`) — pane cwd / teleport-source.
- `collectForeground(shellPid, …)` (`pty.ts:299`) — the per-pane process icons.

**Fix:** resolve the real shell pid (the abduco server's child) and use it instead of `pty.pid`. We already take a full `ps -A` snapshot in `getForegroundProcs` (`pty.ts:357`) — reuse it:

```ts
// The abduco SERVER is an `abduco` process that is NOT our client (pty.pid) and
// whose argv carries our session name. The shell is its child.
const resolveShellPidFrom = (session, rows: ProcRow[]): number | null => {
  const name = sessionName(session.leafId);
  const server = rows.find(r =>
    r.command.includes("abduco") && r.command.includes(name) && r.pid !== session.pty.pid);
  if (!server) return null;
  const child = rows.find(r => r.ppid === server.pid);
  return child?.pid ?? null;
};
```

Cache the result on `session.shellPid` (stable for the session's life). `getProcessCwd` and `collectForeground` switch to `session.shellPid ?? session.pty.pid` (fallback covers the non-persistence path). Eager-resolve once shortly after spawn (`resolveShellPid` in §4.2) so `killSession` has the pid ready at dispose time.

---

## 6. Socket path & the `sun_path` limit

Unix domain socket paths are capped at ~104 bytes (`sun_path`) on macOS. `userData` (`~/Library/Application Support/com.sandcastle.desktop/…`) plus a UUID-named socket can blow that. Mitigations (both applied):

- **Short dir:** a fixed `/tmp/sandcastle` (set via `ABDUCO_SOCKET_DIR`), not `userData` and **not** `os.tmpdir()` — on macOS the latter is `/var/folders/<hash>/T` (~48 bytes), which overflowed `sun_path` once abduco appended its own `/<argv0-basename>/<user>/<name>@<host>` nesting and produced `create-session: File name too long`.
- **Short name:** 16 hex chars of `sha256(leafId)`, not the raw 36-char UUID.

We don't depend on tmp's reboot-clearing for correctness: abduco unlinks dead sockets on the next connect, and the startup reaper kills stale servers.

---

## 7. Bundling the `abduco` binary

`resources/**` is already `asarUnpack`'d (`electron-builder.yml`), so a prebuilt binary under `resources/bin/` is unpacked and executable in prod. abduco is a tiny single-file C program (trivial `make`).

- **Build script** `apps/desktop/scripts/build-abduco.sh`: fetch a pinned abduco release tarball, `make`, output `resources/bin/abduco-<platform>-<arch>` for each target (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`). Run in CI before `electron-builder`. (Vendoring the prebuilt binaries in-repo is the alternative — simpler CI, larger repo.)
- **macOS signing/notarization:** currently `notarize: false`, so unsigned helpers run. When notarization is turned on, the binary needs `codesign` with hardened-runtime + inherited entitlements (`build/entitlements.mac.plist`). Flag for whoever enables notarization; not blocking now.
- **Linux:** bundle per-arch as above (AppImage carries it). Could alternatively depend on a system `abduco` package, but bundling is more robust.

---

## 8. The MCP-staleness caveat (motivates Phase 2)

`registerSession` (`mcp.ts:506`) bakes three values into the shell's env at spawn, and the MCP config expands them **at `claude` launch** (`mcpInjection.ts:48-50`):

- `SANDCASTLE_MCP_URL` — an **ephemeral port** (`server.listen(0)`, `mcp.ts:476`)
- `SANDCASTLE_MCP_TOKEN` — a fresh random token (`mcp.ts:513`)
- `SANDCASTLE_SESSION_ID`

A reattached shell keeps its **old** env. After restart the server binds a new port and the token map is empty, so a `claude` launched in (or still running inside) a reattached shell gets `401`'d — losing `whoami`/`split`/`teleport`/worktree auto-grouping until relaunched.

**The terminal itself is fully alive and usable** — Phase 1 delivers the actual ask. This caveat only affects Sandcastle's MCP superpowers on reattached sessions, and is fixed in Phase 2.

---

## 9. Phase 2 — MCP continuity

Make the baked-in env still valid after restart:

1. **Pin the MCP port.** Replace `server.listen(0)` (`mcp.ts:476`) with a fixed/persisted port so `SANDCASTLE_MCP_URL` stays correct across restarts. Handle "port in use" (another instance / stale) gracefully — the single-instance lock (`index.ts:89`) already prevents two of our own.
2. **Persist & restore the token map.** Write `sessionId → token` (`mcp.ts:514-515`) to disk (in `userData`) and reload on `registerMcpServer()`. On restart, a reattached shell's old token resolves again. With durable `sessionId` (§3, option A) the mapping is stable.

Result: a `claude` launched in a reattached shell reconnects transparently (same URL + token). A long-running `claude` re-initializes its MCP transport against the same endpoint.

---

## 10. Edge cases & interactions

- **Soft reload (renderer reload, same main process).** `sessions` still holds the live client. Currently `terminal:renderer-ready` *kills* sessions to avoid stale-id leaks (`pty.ts:257-259`). With **durable ids** that staleness goes away — change this handler to **not** kill; the reloaded page re-subscribes to `terminal:data:${id}` by reusing the same id, and `create()` early-returns (`pty.ts:227`). Force a SIGWINCH repaint (§4.5). This also means soft reloads stop losing terminals — a side benefit.
- **Shell exited while app was down.** Its server ends and the socket is removed. `abduco -A` then *creates* a fresh shell. We should also surface the prior exit if desired, but default behavior (fresh shell) is fine. The startup sweep (§4.4) removes the dead socket.
- **Orphan servers/sockets.** A leaf removed while the app was down (tab closed in a window that didn't dispose) leaves a server running. The reaper (§4.4) kills servers/sockets whose `sessionName` matches no current leaf. Important so long-lived users don't accumulate zombie shells.
- **`onExit` semantics.** `wireSessionEvents` (`pty.ts:154`) fires when the *client* sees EOF. On intentional detach (quit) the renderer is tearing down anyway. On pane-close we delete the session first, so the "[process exited]" line (`terminalRegistry.ts:432`) won't wrongly show. Verify a user typing `exit` in the shell (real session end) still shows the exit line — it should, because the client gets EOF from a genuinely-ended session.
- **Accidental user detach.** abduco's detach key could freeze a pane if hit. Set `-e` to a rarely-used control char and document it; we never rely on key-driven detach.
- **Resize after reattach.** The server's PTY keeps its last dimensions; the new client/xterm may differ. The existing `scheduleResize` reconciles on attach (`terminalRegistry.ts:286-302`).

---

## 11. Platform guard

All of the above is gated on `PERSISTENCE_SUPPORTED` (`process.platform !== "win32"`). Windows keeps today's spawn + `killTree` + `disposeAllSessions`-on-quit path unchanged. A future Windows story could use the cosmetic serialize-and-respawn fallback (Phase 3), but no process survival.

---

## 12. Phasing

1. **Phase 1 — process survival.** Bundle abduco; wrap spawn; detach-vs-kill split; durable leafId socket key; shell-pid resolution for cwd/foreground; startup sweep + reaper; repaint-on-attach. **Delivers the ask.**
2. **Phase 2 — MCP continuity.** Pin port + persist tokens so reattached `claude` keeps Sandcastle integration without relaunch.
3. **Phase 3 — scrollback fidelity (optional).** xterm `SerializeAddon`: save each pane's buffer on quit, write it back on attach so *history* (not just the live screen) looks continuous. Also the basis for a Windows fallback.

---

## 13. Test plan

- **Survival:** start `claude` (or `sleep 9999 & jobs`) in a pane, quit the app, relaunch → same pane reattaches, process still running (verify pid).
- **Multiple panes / splits / multiple workspaces** all reattach to the right leaves.
- **Pane close still kills** (no orphan server): close a pane, confirm `abduco -l` shows no leftover and the socket is gone.
- **Window close kills** its shells (distinct from app quit).
- **cwd + foreground icons** still correct (cd around, run a dev server) — exercises §5.
- **Soft reload** (dev `Cmd+R`) keeps terminals + repaints.
- **Shell-exited-during-downtime** → fresh shell on relaunch, stale socket swept.
- **Reboot** → clean slate (no zombie sockets in tmp).
- **Phase 2:** launch `claude` in a reattached pane → `sandcastle_whoami` works.

---

## 14. Open questions

1. **Durable sessionId (option A) vs separate leafId thread (option B)?** A is recommended (sets up Phase 2) — confirm no other consumer assumes sessionId uniqueness-per-spawn.
2. **Vendor prebuilt abduco binaries in-repo, or build in CI?** Affects repo size vs CI complexity.
3. **Ship Phase 1 alone first** (terminals survive; reattached `claude` loses MCP until relaunch), or hold for Phase 2 so the `claude` experience is seamless?
4. **Confirm exact abduco flags / `ABDUCO_SOCKET_DIR` behavior** against the pinned version before coding §4.2.
5. **TTL policy (§2.2 / §2.3):** the TTL is now a user setting (Off/5m/30m/1h/Forever, default 30m). Remaining calls: ship **lazy-reap-on-launch only** (simple, no daemon — note "Forever" then means processes truly run until you reopen), or also the **active watchdog** so the chosen TTL is enforced *during* downtime? And confirm the preset list.

---

## 15. Fixes from first dev test (supersede earlier guidance)

First in-app test (spawn terminal → open claude → close window → reopen) failed with `session terminated with exit status 1`. Two bugs, both root-caused empirically against the bundled binary and fixed in `pty.ts` / `abduco.ts`:

**Bug A — window-close killed the shell.** §4.3 said to *keep* `disposeSessionsForRenderer` as a kill on `webContents 'destroyed'` / `'render-process-gone'`. **That was wrong.** On macOS, closing the window does not quit the app (`window-all-closed` only quits off-darwin), so that handler fired and `killSession`'d the live shells. Empirically, SIGHUP'ing the shell's process group makes zsh exit with status **1** (not a signal-coded 0 as assumed), and abduco then reports the terminated session on reattach — exactly the symptom.
**Fix:** when persistence is on, the renderer-gone handler **detaches** (`detachSessionsForRenderer`, client-only kill, servers survive) instead of killing. App quit still detaches via `before-quit`; only `keepalive === 0` hard-kills here. (Verified: detach keeps the shell alive and reattach shows it live.)

**Bug B — `socketPath()` was wrong, so teardown never removed the real socket.** abduco does **not** name its socket `<dir>/<name>`. It nests it at `<ABDUCO_SOCKET_DIR>/<argv0-basename>/<user>/<name>@<host>` (`abduco.c:270-367`), so `killSession`'s `fs.rm(socketPath(...))` and the reaper sweeps all targeted nonexistent paths, leaving dead sockets that make a later reattach report "session terminated."
**Fix:** don't compute/unlink abduco's socket at all. Tear sessions down by **SIGTERM-ing the abduco server pid** — its `atexit` handler kills the command *and* unlinks its own socket (`server.c:156-170`). `Session` now caches `serverPid` (resolved from the same `ps` snapshot as `shellPid`); `killSession` and `killAbducoServer` SIGTERM it; `reapExpiredOnStartup`'s manual socket sweep is dropped (abduco also auto-unlinks stale sockets on the next connect). `socketPath()` is removed from `abduco.ts`. (Verified: SIGTERM-server teardown → clean fresh reattach, no "session terminated".)

**Also corrected from the plan:** the §10 / §4.4 "startup sweep removes the dead socket" and "fresh shell on shell-exit-during-downtime" notes assumed our own socket removal — they now rely on abduco's own unlink-on-exit instead.

**Bug C — reattached TUIs rendered blank ("all white" until a manual redraw).** The §4.5 repaint plan assumed abduco needed us to deliver a SIGWINCH on attach. It doesn't: abduco's server already `kill(-pid, SIGWINCH)`s the program on every attach (`server.c:222-229`, via the client's `need_resize` MSG_RESIZE, `client.c:62`). The real problem is that a TUI like Claude (Ink) does a **differential** redraw — a *same-size* SIGWINCH produces an empty diff, so the fresh xterm stays blank; it only emits a full frame on a real **dimension change**. The reattached xterm fits the same pane, so the size was unchanged → blank.
**Fix (no timing hacks):** `createSession` spawns the abduco client **one row short** (`rows-1`) on the persistence path. abduco forwards the client's winsize on attach, so the server's pty lands at `rows-1`; the renderer's normal reconcile to the true fitted size is then *always* a genuine resize (`rows-1 → rows`) → SIGWINCH → full repaint, deterministically and via the existing resizeObserver (no `setTimeout`). Verified against the binary: a reattach at an offset size makes the program observe the new size on attach. *Scrollback history above the current frame is still not restored — that remains Phase 3 (SerializeAddon).*
