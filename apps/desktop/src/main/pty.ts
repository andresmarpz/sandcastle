import { execFile } from "node:child_process";
import { promises as fs, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { ipcMain, webContents } from "electron";
import * as nodePty from "node-pty";
import { abducoBin, PERSISTENCE_SUPPORTED, sessionName, socketDir } from "./abduco";
import { registerSession, unregisterSession } from "./mcp";
import { getKeepAliveMinutes, setKeepAliveMinutes } from "./ptySettings";
import { userEnvReady } from "./userEnv";

const execFileAsync = promisify(execFile);

type Session = {
	id: string;
	// Durable terminal identity (survives restarts). Drives the abduco session
	// name / socket path so a relaunched client reattaches to the same server.
	leafId: string;
	pty: nodePty.IPty;
	// With abduco, pty.pid is the throwaway CLIENT. The real shell is a child of
	// the detached abduco SERVER. We resolve both lazily from the ps snapshot and
	// cache them here (stable for the session's life): shellPid drives cwd /
	// foreground-process detection; serverPid is the SIGTERM target for a clean
	// teardown (abduco then kills its command + unlinks its own socket). Both null
	// until resolved (and on the non-persistence path, where pty.pid IS the shell).
	shellPid: number | null;
	serverPid: number | null;
	webContentsId: number;
};

const sessions = new Map<string, Session>();
const watchedRenderers = new Set<number>();

// abduco's detach key. We never rely on key-driven detach (we detach by killing
// the client), so bind it to a rarely-used control char to neutralize an
// accidental user detach that would otherwise freeze a pane (see §10).
const DETACH_KEY = "^g";

const defaultShell = (): string => {
	if (process.platform === "win32") {
		return process.env.COMSPEC || "powershell.exe";
	}
	return process.env.SHELL || "/bin/bash";
};

const shellArgs = (_shell: string): string[] => {
	// PATH and friends are captured once at app startup (see userEnv.ts) and
	// merged into process.env, so we don't need a login shell per pane. This
	// makes new panes open instantly instead of paying .zprofile cost every time.
	return [];
};

const homeDir = (): string => os.homedir();

const buildEnv = (overrides?: Record<string, string>): Record<string, string> => ({
	...(process.env as Record<string, string>),
	...(overrides ?? {}),
	TERM: "xterm-256color",
	COLORTERM: "truecolor",
});

type CreateOptions = {
	id: string;
	// Durable terminal identity, threaded from the renderer. Derives the abduco
	// session name so a relaunched pane reattaches to its surviving shell.
	leafId: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	shell?: string;
	env?: Record<string, string>;
	// Workspace this pane belongs to, threaded from the renderer so the MCP
	// server can teleport/identify the terminal. Injected into the shell env.
	workspaceId?: string;
};

// Grace window we give a shell + its foreground job (e.g. a TUI like Claude)
// to handle SIGHUP and unwind cleanly before we force-kill the whole group.
const KILL_GRACE_MS = 2000;

const killTree = (pty: nodePty.IPty): void => {
	if (process.platform === "win32") {
		try {
			pty.kill();
		} catch {
			// already gone
		}
		return;
	}

	const pid = pty.pid;

	// Watch for the leader exiting so we don't escalate to SIGKILL after the
	// PID has potentially been recycled by the kernel for an unrelated process.
	let exited = false;
	let exitSub: nodePty.IDisposable | null = null;
	try {
		exitSub = pty.onExit(() => {
			exited = true;
			exitSub?.dispose();
		});
	} catch {
		// pty already torn down
		exited = true;
	}

	// Phase 1 — graceful: SIGHUP to the whole process group. node-pty spawns
	// the shell as a session leader, so PGID == pty.pid. Any child the shell
	// launched (Claude TUI, fzf, less, nested shells) inherits that PGID
	// unless it explicitly setsid'd away.
	try {
		process.kill(-pid, "SIGHUP");
	} catch {
		// group already gone
	}
	try {
		pty.kill();
	} catch {
		// already gone
	}

	// Phase 2 — force: anything still alive after the grace window gets
	// SIGKILL'd at the group level. Catches processes that catch/ignore SIGHUP
	// (nohup wrappers, custom signal handlers) and tools that hang during
	// cleanup. Skipped if the leader already exited cleanly to avoid hitting
	// a recycled PID.
	setTimeout(() => {
		if (exited) return;
		try {
			process.kill(-pid, "SIGKILL");
		} catch {
			// group already gone between phase 1 and now
		}
	}, KILL_GRACE_MS);
};

// SIGHUP→SIGKILL a shell process group by pid (the resolved abduco server's
// child). The abduco server exits once its child dies. Mirrors killTree's two
// phases but targets a bare pid we already resolved rather than pty.pid.
const killShellGroup = (shellPid: number): void => {
	try {
		process.kill(-shellPid, "SIGHUP");
	} catch {
		// group already gone
	}
	setTimeout(() => {
		try {
			process.kill(-shellPid, "SIGKILL");
		} catch {
			// group already gone
		}
	}, KILL_GRACE_MS);
};

// SIGTERM the abduco SERVER. abduco's handler exits via atexit, which kills its
// command (the shell, whose pty closes) AND unlinks its own socket — the clean,
// correct teardown. (We can't reliably unlink the socket ourselves: abduco nests
// it at <dir>/<argv0>/<user>/<name>@<host>, not a path we can cheaply compute.)
const killServer = (serverPid: number): void => {
	try {
		process.kill(serverPid, "SIGTERM");
	} catch {
		// already gone
	}
};

// User explicitly destroyed the pane (terminal:dispose) or persistence is off →
// tear the real session down. Prefer SIGTERM to the resolved abduco server (it
// cleans up its command + socket); fall back to killing the shell group if we
// never resolved the server; always drop the client. Non-persistence path is the
// classic killTree.
const killSession = (session: Session): void => {
	if (!PERSISTENCE_SUPPORTED) {
		killTree(session.pty);
		return;
	}
	if (session.serverPid) {
		killServer(session.serverPid);
	} else if (session.shellPid) {
		// Server pid not resolved yet — kill the shell group directly so its pty
		// closes; the orphaned server then exits on its command's death.
		killShellGroup(session.shellPid);
	}
	try {
		session.pty.kill(); // drop the client too
	} catch {
		// already gone
	}
};

// App quitting with persistence on → DETACH ONLY: kill just the abduco client,
// leaving the server + shell + socket alive so the next launch reattaches.
const detachSession = (session: Session): void => {
	try {
		session.pty.kill(); // client dies ⇒ abduco detaches; server lives on
	} catch {
		// already gone
	}
};

const disposeSession = (id: string): void => {
	const session = sessions.get(id);
	if (!session) return;
	sessions.delete(id);
	unregisterSession(id);
	killSession(session);
};

const disposeSessionsForRenderer = (webContentsId: number): void => {
	for (const [id, session] of sessions) {
		if (session.webContentsId === webContentsId) {
			sessions.delete(id);
			unregisterSession(id);
			killSession(session);
		}
	}
};

// Detach (don't kill) every session owned by a renderer, leaving the abduco
// servers + shells alive to reattach. Used when the window goes away but the app
// lives on (macOS window close) or the renderer crashes — NOT a reason to lose
// running processes.
const detachSessionsForRenderer = (webContentsId: number): void => {
	for (const [id, session] of sessions) {
		if (session.webContentsId === webContentsId) {
			sessions.delete(id);
			unregisterSession(id);
			detachSession(session);
		}
	}
};

const watchRenderer = (wc: Electron.WebContents): void => {
	if (watchedRenderers.has(wc.id)) return;
	watchedRenderers.add(wc.id);
	const cleanup = (): void => {
		// A window closing is NOT a reason to kill shells: on macOS the app stays
		// alive and the user reopens; a renderer crash should reload + reattach. So
		// DETACH and let the servers survive (this was the bug that lost sessions on
		// close). App quit detaches up-front in before-quit, leaving this a no-op.
		// Only when persistence is off do we hard-kill here.
		if (PERSISTENCE_SUPPORTED && getKeepAliveMinutes() !== 0) {
			detachSessionsForRenderer(wc.id);
		} else {
			disposeSessionsForRenderer(wc.id);
		}
		watchedRenderers.delete(wc.id);
	};
	wc.once("destroyed", cleanup);
	wc.once("render-process-gone", cleanup);
};

const wireSessionEvents = (session: Session): void => {
	session.pty.onData((data) => {
		const wc = webContents.fromId(session.webContentsId);
		if (wc && !wc.isDestroyed()) {
			wc.send(`terminal:data:${session.id}`, data);
		}
	});

	session.pty.onExit(({ exitCode, signal }) => {
		const wc = webContents.fromId(session.webContentsId);
		if (wc && !wc.isDestroyed()) {
			wc.send(`terminal:exit:${session.id}`, { exitCode, signal });
		}
		sessions.delete(session.id);
		unregisterSession(session.id);
	});
};

const createSession = async (sender: Electron.WebContents, opts: CreateOptions): Promise<void> => {
	const shell = opts.shell ?? defaultShell();
	const cwd = opts.cwd ?? homeDir();

	// Register with the MCP server first so we can inject the per-session env
	// (token, MCP url) + shell args that wrap `claude` (a shell function, so it
	// survives the user's rc) and let it drive the app.
	const { env: mcpEnv, args: mcpArgs } = registerSession(
		opts.id,
		sender.id,
		opts.workspaceId,
		shell,
	);

	// Tag every Sandcastle PTY so the Claude Code activity hook can report which
	// session fired (and no-op in shells we didn't spawn). `mcpEnv` adds the
	// per-session MCP token/url + shell-wrapper vars.
	const env = buildEnv({ ...opts.env, ...mcpEnv, SANDCASTLE_SESSION_ID: opts.id });

	let file: string;
	let args: string[];
	if (PERSISTENCE_SUPPORTED) {
		// Spawn an abduco CLIENT that attach-or-creates a named, detachable
		// session. The first attach forks a daemonized server (its own session via
		// setsid) that owns the PTY and runs the shell; on reattach abduco ignores
		// shell/args and connects to the surviving server. The shell/env therefore
		// only take effect on create — the root of the Phase 2 MCP-staleness issue.
		await fs.mkdir(socketDir(), { recursive: true });
		env.ABDUCO_SOCKET_DIR = socketDir();
		file = abducoBin();
		args = [
			"-e",
			DETACH_KEY,
			"-A",
			sessionName(opts.leafId),
			shell,
			...shellArgs(shell),
			...mcpArgs,
		];
	} else {
		// Windows / unsupported: spawn the shell directly (today's behavior, no
		// persistence). pty.pid is the shell itself.
		file = shell;
		args = [...shellArgs(shell), ...mcpArgs];
	}

	// On the abduco path, spawn the client ONE ROW SHORT. abduco forwards the
	// client's winsize to the server as part of the attach handshake, so on
	// reattach this leaves the server's pty at rows-1; the renderer's first
	// reconcile to the true fitted size is then always a genuine dimension change.
	// That matters because a reattached TUI (e.g. Claude) only fully repaints on a
	// real resize — a same-size SIGWINCH yields an empty differential redraw and a
	// blank pane. The offset makes the repaint deterministic without timing hacks;
	// it's invisible (corrected within a frame) and a no-op for plain shells.
	const baseRows = opts.rows ?? 24;
	const pty = nodePty.spawn(file, args, {
		name: "xterm-256color",
		cols: opts.cols ?? 80,
		rows: PERSISTENCE_SUPPORTED ? Math.max(1, baseRows - 1) : baseRows,
		cwd,
		env,
		useConpty: process.platform === "win32",
	});

	const session: Session = {
		id: opts.id,
		leafId: opts.leafId,
		pty,
		shellPid: null, // resolved lazily from the ps snapshot, see §5
		serverPid: null,
		webContentsId: sender.id,
	};
	sessions.set(opts.id, session);
	watchRenderer(sender);
	wireSessionEvents(session);
	// Best-effort eager resolve so killSession has the shell pid ready at dispose
	// time (the ps walk also lazily fills it for cwd / foreground later).
	if (PERSISTENCE_SUPPORTED) void resolveShellPid(session);
};

const getProcessCwd = async (pid: number): Promise<string | null> => {
	if (process.platform === "linux") {
		try {
			return await fs.readlink(`/proc/${pid}/cwd`);
		} catch {
			return null;
		}
	}
	if (process.platform === "darwin") {
		try {
			const { stdout } = await execFileAsync("/usr/sbin/lsof", [
				"-a",
				"-p",
				String(pid),
				"-d",
				"cwd",
				"-Fn",
			]);
			for (const line of stdout.split("\n")) {
				if (line.startsWith("n")) return line.slice(1);
			}
			return null;
		} catch {
			return null;
		}
	}
	return null;
};

export const registerPtyHandlers = (): void => {
	ipcMain.handle("terminal:create", async (event, opts: CreateOptions) => {
		// Durable ids make create idempotent: a soft reload (or reattach) re-issues
		// the same id, and we keep the live session rather than spawning a dup.
		if (sessions.has(opts.id)) return { ok: true };
		await userEnvReady();
		await createSession(event.sender, opts);
		return { ok: true };
	});

	ipcMain.on("terminal:input", (_event, id: string, data: string) => {
		const session = sessions.get(id);
		if (!session) return;
		session.pty.write(data);
	});

	ipcMain.on("terminal:resize", (_event, id: string, cols: number, rows: number) => {
		const session = sessions.get(id);
		if (!session) return;
		try {
			session.pty.resize(Math.max(1, cols), Math.max(1, rows));
		} catch {
			// pty may have exited
		}
	});

	ipcMain.on("terminal:dispose", (_event, id: string) => {
		disposeSession(id);
	});

	// On a soft reload the WebContents is reused (no 'destroyed' event), so the
	// previous page's PTYs/tokens would leak and its sessionIds go stale. With
	// durable ids the reloaded page re-subscribes to the same id and create()
	// early-returns, so we no longer need to kill here — killing would tear down
	// a perfectly live (and, with abduco, survivable) session. We keep the
	// sessions and rely on id reuse; a SIGWINCH from the renderer repaints them.
	ipcMain.on("terminal:renderer-ready", () => {
		// no-op: durable ids make soft reload non-destructive (see §10).
	});

	ipcMain.handle("terminal:get-cwd", async (_event, id: string) => {
		const session = sessions.get(id);
		if (!session) return null;
		// The abduco client (pty.pid) has no useful cwd; walk the resolved shell.
		return getProcessCwd(session.shellPid ?? session.pty.pid);
	});

	ipcMain.handle("terminal:get-foreground-procs", async (_event, ids: string[]) => {
		return getForegroundProcs(ids);
	});

	// §2.3 background-terminal TTL setting. Mirrors claude:get/set-hooks-enabled.
	ipcMain.handle("terminal:get-keepalive", () => getKeepAliveMinutes());
	ipcMain.handle(
		"terminal:set-keepalive",
		async (_event, value: number | null): Promise<number | null> => setKeepAliveMinutes(value),
	);

	// The renderer reports every leafId currently mounted in a tab. Any of our
	// abduco servers whose session matches none of them is an orphan (a leaf
	// closed in a window that didn't dispose) — reap it so zombies don't pile up.
	ipcMain.on("terminal:active-leaves", (_event, leafIds: string[]) => {
		void reapOrphanServers(leafIds);
	});
};

type ProcRow = { pid: number; ppid: number; stat: string; command: string };
type ForegroundProc = { pid: number; comm: string; args: string };

const parsePsRows = (stdout: string): ProcRow[] => {
	const rows: ProcRow[] = [];
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		// "  pid  ppid stat  command with args..."
		const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
		if (!m) continue;
		rows.push({
			pid: Number(m[1]),
			ppid: Number(m[2]),
			stat: m[3],
			command: m[4],
		});
	}
	return rows;
};

const commFromCommand = (command: string): string => {
	// First whitespace-delimited token, basename only.
	const first = command.split(/\s+/)[0] ?? "";
	const slash = first.lastIndexOf("/");
	return slash >= 0 ? first.slice(slash + 1) : first;
};

// The abduco SERVER for a session is an `abduco` process that is NOT our client
// (pty.pid) and whose argv carries the session name. The real shell is its child.
// Returns both pids (shell may be null if the child isn't visible yet), or null
// if the server itself isn't visible yet.
const resolveAbducoPidsFrom = (
	session: Session,
	rows: ProcRow[],
): { serverPid: number; shellPid: number | null } | null => {
	const name = sessionName(session.leafId);
	const server = rows.find(
		(r) => r.command.includes("abduco") && r.command.includes(name) && r.pid !== session.pty.pid,
	);
	if (!server) return null;
	const child = rows.find((r) => r.ppid === server.pid);
	return { serverPid: server.pid, shellPid: child?.pid ?? null };
};

// Take a one-shot ps snapshot and resolve+cache the server/shell pids for a
// session. Best-effort: a transient miss just leaves them null for this attempt.
const resolveShellPid = async (session: Session): Promise<void> => {
	if (session.serverPid && session.shellPid) return;
	const rows = await psSnapshot();
	if (!rows) return;
	const r = resolveAbducoPidsFrom(session, rows);
	if (r) {
		session.serverPid = r.serverPid;
		session.shellPid = r.shellPid;
	}
};

const collectForeground = (
	shellPid: number,
	childrenOf: Map<number, ProcRow[]>,
): ForegroundProc[] => {
	// Every process in the terminal's foreground process group carries '+' in
	// STAT — and that group is the launched job PLUS all the helpers it spawns
	// (claude's shell/ripgrep calls, a Vite dev server's esbuild, lazygit's git).
	// We return ALL of them, deepest-first, and let the renderer pick the most
	// meaningful one by priority. The old code picked a single *deepest* '+'
	// descendant here, which is what made the icon unreliable: it surfaced
	// whatever transient helper happened to be running at poll time (esbuild, rg,
	// a bash subshell) instead of the actual job, so the icon flickered as those
	// children came and went, and dev servers showed "esbuild"/nothing instead
	// of Vite/Next. An idle shell has no '+' children → empty array → no icon.
	const found: Array<{ row: ProcRow; depth: number }> = [];
	const stack: Array<{ pid: number; depth: number }> = [{ pid: shellPid, depth: 0 }];
	while (stack.length > 0) {
		const { pid, depth } = stack.pop()!;
		for (const child of childrenOf.get(pid) ?? []) {
			if (child.stat.includes("+")) {
				found.push({ row: child, depth: depth + 1 });
			}
			stack.push({ pid: child.pid, depth: depth + 1 });
		}
	}
	// Deepest-first so the renderer's priority pick resolves same-tier ties to
	// the innermost process (e.g. the real server below its npm/turbo wrappers).
	found.sort((a, b) => b.depth - a.depth);
	return found.map(({ row }) => ({
		pid: row.pid,
		comm: commFromCommand(row.command),
		args: row.command,
	}));
};

// One ps call covering every process. -A: all processes, -o with trailing `=`
// suppresses headers and lets `command` consume the rest of the line. Returns
// null if ps fails (callers degrade to empty/unresolved).
const psSnapshot = async (): Promise<ProcRow[] | null> => {
	if (process.platform === "win32") return null;
	try {
		const r = await execFileAsync("/bin/ps", ["-Ao", "pid=,ppid=,stat=,command="], {
			maxBuffer: 8 * 1024 * 1024,
		});
		return parsePsRows(r.stdout);
	} catch {
		return null;
	}
};

const getForegroundProcs = async (ids: string[]): Promise<Record<string, ForegroundProc[]>> => {
	const result: Record<string, ForegroundProc[]> = {};
	const targets: Array<{ id: string; session: Session }> = [];
	for (const id of ids) {
		const session = sessions.get(id);
		if (!session) {
			result[id] = [];
			continue;
		}
		targets.push({ id, session });
	}
	if (targets.length === 0) return result;

	if (process.platform === "win32") {
		// node-pty on Windows uses ConPTY; no foreground-pgrp concept. Skip for now.
		for (const t of targets) result[t.id] = [];
		return result;
	}

	const rows = await psSnapshot();
	if (!rows) {
		for (const t of targets) result[t.id] = [];
		return result;
	}

	const childrenOf = new Map<number, ProcRow[]>();
	for (const row of rows) {
		const arr = childrenOf.get(row.ppid);
		if (arr) arr.push(row);
		else childrenOf.set(row.ppid, [row]);
	}
	for (const t of targets) {
		// Resolve the server/shell pids from the same snapshot and cache them; fall
		// back to pty.pid on the non-persistence path / before the server is visible.
		if (PERSISTENCE_SUPPORTED && (!t.session.shellPid || !t.session.serverPid)) {
			const r = resolveAbducoPidsFrom(t.session, rows);
			if (r) {
				t.session.serverPid = r.serverPid;
				if (r.shellPid) t.session.shellPid = r.shellPid;
			}
		}
		result[t.id] = collectForeground(t.session.shellPid ?? t.session.pty.pid, childrenOf);
	}
	return result;
};

// ── abduco server discovery + reaping ──────────────────────────────────────
// Our detached servers live on past the app, so the reaper has to find them by
// scanning ps for `abduco` processes whose session name is one we own. We pair
// each server with its session name (derived from the socket file basename) and
// its shell child so we can kill the shell group (the server exits with it).

type AbducoServer = { serverPid: number; name: string; shellPid: number | null };

// Our session names are the first 16 hex chars of sha256(leafId) — see
// abduco.ts. Match that exact shape so reaping never touches an unrelated
// abduco session the user happens to be running in their own terminal.
const OUR_SESSION_NAME = /^[0-9a-f]{16}$/;

// Scan ps for every abduco SERVER process WE own. A server's argv carries the
// session name passed to `-A`; the shell it runs is its child. We don't have
// the leafId here, only the hashed name, so we key by name. (A live, attached
// session also surfaces its CLIENT with the same `-A <name>`; the client has no
// child, so its shellPid is null and killing it is a no-op beyond the socket
// rm — and callers only reap names that are NOT in the live set anyway.)
const discoverAbducoServers = (rows: ProcRow[]): AbducoServer[] => {
	const servers: AbducoServer[] = [];
	for (const row of rows) {
		if (!row.command.includes("abduco")) continue;
		// The invocation includes `-A <name>`; pull the name token after it.
		const parts = row.command.split(/\s+/);
		const idx = parts.indexOf("-A");
		const name = idx >= 0 ? parts[idx + 1] : undefined;
		if (!name || !OUR_SESSION_NAME.test(name)) continue;
		const child = rows.find((r) => r.ppid === row.pid);
		servers.push({ serverPid: row.pid, name, shellPid: child?.pid ?? null });
	}
	return servers;
};

// Kill an abduco server cleanly: SIGTERM it so it kills its command and unlinks
// its own socket (atexit). Belt-and-suspenders: also kill the shell group if we
// have it, in case the server is wedged.
const killAbducoServer = (server: AbducoServer): void => {
	killServer(server.serverPid);
	if (server.shellPid) killShellGroup(server.shellPid);
};

// terminal:active-leaves handler: kill our servers whose session name matches
// none of the leafIds the renderer reports as currently mounted (orphans from a
// window/tab that closed without disposing while the app stayed open).
const reapOrphanServers = async (leafIds: string[]): Promise<void> => {
	if (!PERSISTENCE_SUPPORTED) return;
	const rows = await psSnapshot();
	if (!rows) return;
	const live = new Set(leafIds.map(sessionName));
	for (const server of discoverAbducoServers(rows)) {
		if (!live.has(server.name)) killAbducoServer(server);
	}
};

// App quitting with persistence on → DETACH ONLY: kill just the abduco clients,
// leaving every server + shell + socket alive for the next launch to reattach.
// Falls back to a full kill on the non-persistence path.
export const detachAllSessions = (): void => {
	if (!PERSISTENCE_SUPPORTED) {
		disposeAllSessions();
		return;
	}
	for (const session of sessions.values()) detachSession(session);
	sessions.clear();
};

export const disposeAllSessions = (): void => {
	for (const id of [...sessions.keys()]) disposeSession(id);
};

// ── startup reap + heartbeat ────────────────────────────────────────────────

const HEARTBEAT_FILE = path.join(os.homedir(), ".sandcastle", "pty-heartbeat");
const HEARTBEAT_INTERVAL_MS = 30_000;
let heartbeatTimer: NodeJS.Timeout | null = null;

// Touch the heartbeat file. Its mtime is the app's ~last-alive time; on launch
// we read it to estimate how long the app was down (see lastHeartbeatAgeMs).
const touchHeartbeat = async (): Promise<void> => {
	try {
		await fs.mkdir(path.dirname(HEARTBEAT_FILE), { recursive: true });
		await fs.writeFile(HEARTBEAT_FILE, String(Date.now()), "utf8");
	} catch {
		// best-effort; a missed beat just under-counts downtime by one interval
	}
};

export const startHeartbeat = (): void => {
	if (heartbeatTimer) return;
	void touchHeartbeat();
	heartbeatTimer = setInterval(() => void touchHeartbeat(), HEARTBEAT_INTERVAL_MS);
	// Don't keep the event loop (and thus the app) alive solely for the beat.
	heartbeatTimer.unref?.();
};

export const stopHeartbeat = (): void => {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = null;
	}
};

// Downtime estimate: now − mtime(heartbeat). Robust across crashes/force-quits
// (it doesn't depend on before-quit running), under-counting by at most one
// heartbeat interval. Returns Infinity when there's no prior heartbeat (treat a
// first-ever / wiped launch as "infinitely down" so any non-forever TTL reaps).
export const lastHeartbeatAgeMs = (): number => {
	try {
		const { mtimeMs } = statSync(HEARTBEAT_FILE);
		return Math.max(0, Date.now() - mtimeMs);
	} catch {
		return Number.POSITIVE_INFINITY;
	}
};

// Lazy reap on launch (§2.2). Runs BEFORE the renderer reattaches. If
// persistence is off (keepalive=0) or the app was down longer than the TTL,
// SIGTERM ALL our abduco servers — each unlinks its own socket on exit — so we
// start from a clean slate instead of reattaching stale junk. Under the TTL (or
// "forever"), leave servers alive to reattach. (abduco also auto-unlinks any
// truly-dead socket on the next connect attempt, so no manual sweep is needed.)
export const reapExpiredOnStartup = async (downtimeMs: number): Promise<void> => {
	if (!PERSISTENCE_SUPPORTED) return;
	const minutes = getKeepAliveMinutes();

	// forever → never time-reap on launch (servers still die on pane-close /
	// shell-exit / reboot / orphan sweep).
	if (minutes === null) return;

	// off (0) → no persistence: reap everything. Otherwise reap only if the
	// downtime exceeded the TTL.
	const expired = minutes === 0 || downtimeMs > minutes * 60_000;
	if (!expired) return;

	const rows = await psSnapshot();
	if (rows) {
		for (const server of discoverAbducoServers(rows)) killAbducoServer(server);
	}
};
