import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { app } from "electron";
import { userEnvReady } from "./userEnv";

/**
 * Backend relay lifecycle (the Bun server, run as a sidecar child process).
 *
 * The server is hard-locked to the Bun runtime (bun:sqlite, Bun.* APIs,
 * @effect/platform-bun) so it can't run inside Electron's Node main process.
 * Instead it ships as a single self-contained binary (`bun build --compile`,
 * see apps/server/scripts/build-binary.mjs) packaged under the app's resources,
 * and we run it as a child here so the desktop app is standalone — no separate
 * `bun dev` needed.
 *
 * The hard requirement is NO LEAKS: whether the app exits cleanly, crashes, or
 * is force-quit (`kill -9`, where before-quit never runs), there must be no
 * orphaned server process and no port left occupied. We layer several nets:
 *   1. before-quit → disposeServerSidecar(): SIGTERM→SIGKILL the child's process
 *      GROUP (kills the short-lived git children it spawns too).
 *   2. process 'exit' guard: a synchronous group-kill on any main-process exit
 *      (including an uncaught-exception exit) that slipped past before-quit.
 *   3. server-side self-termination: the child watches SANDCASTLE_PARENT_PID and
 *      exits the instant we vanish (apps/server/src/lib/parentWatch.ts) — the net
 *      for hard-kill/crash where this side runs no code at all.
 *   4. next-launch reclaim: a pidfile lets a fresh instance SIGKILL a verified
 *      stale server a prior run somehow left behind.
 * An ADOPTED server (one we didn't spawn — e.g. `turbo dev`) is never killed.
 *
 * The renderer's RPC WebSocket and the in-process MCP both target the fixed
 * loopback port 7421, so we keep that contract: adopt an already-healthy
 * sandcastle server on 7421 rather than fighting it for the port.
 */

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 7421;
const HEALTH_URL = `http://${SERVER_HOST}:${SERVER_PORT}/health`;

// Keep in sync with BINARY_BASENAME in apps/server/scripts/build-binary.mjs.
const SERVER_BINARY_NAME =
	process.platform === "win32" ? "sandcastle-server.exe" : "sandcastle-server";

// Records the pid of the server WE spawned so a later launch can sweep a stale
// leftover. Lives next to the server's own ~/.sandcastle state.
const PIDFILE = join(homedir(), ".sandcastle", "sidecar.pid");

// Wait for a freshly-spawned server to answer /health before opening the window;
// on timeout we open degraded rather than block forever.
const READY_TIMEOUT_MS = 15_000;
const HEALTH_POLL_INTERVAL_MS = 150;
const PROBE_TIMEOUT_MS = 800;
// Grace between SIGTERM and the SIGKILL escalation on teardown.
const TERM_GRACE_MS = 3_000;
// Let a reclaimed stale server's port free up before we re-check / bind.
const RECLAIM_SETTLE_MS = 300;

// Crash-restart anti-thrash: at most MAX_RESTARTS within RESTART_WINDOW_MS.
const MAX_RESTARTS = 3;
const RESTART_WINDOW_MS = 30_000;
const RESTART_BASE_DELAY_MS = 500;

type Mode = "none" | "spawned" | "adopted";
type PortClass = "ours" | "foreign" | "free";

let child: ChildProcess | null = null;
let mode: Mode = "none";
let quitting = false;
let restartTimer: NodeJS.Timeout | null = null;
let killTimer: NodeJS.Timeout | null = null;
let exitGuardInstalled = false;
const restartStamps: number[] = [];

// ── Port classification ──────────────────────────────────────────────────────

/** HTTP probe: is something on /health, and is it OUR server? */
const probeServer = async (): Promise<PortClass | "down"> => {
	const controller = new AbortController();
	const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
	try {
		const res = await fetch(HEALTH_URL, { signal: controller.signal });
		if (!res.ok) return "foreign";
		// Require OUR identity header. A foreign service answering 200 on 7421
		// (a `"ok"` body is a common health-check convention) must be treated as
		// foreign, never adopted — otherwise the renderer's RPC would connect to a
		// non-sandcastle server and the app would come up permanently broken.
		return res.headers.get("x-sandcastle") ? "ours" : "foreign";
	} catch {
		return "down";
	} finally {
		clearTimeout(t);
	}
};

/** Raw TCP: is anything listening on the port (even if it doesn't speak HTTP)? */
const isPortOccupied = (): Promise<boolean> =>
	new Promise((resolve) => {
		const sock = net.connect({ host: SERVER_HOST, port: SERVER_PORT });
		const done = (occupied: boolean): void => {
			sock.destroy();
			resolve(occupied);
		};
		sock.once("connect", () => done(true));
		sock.once("error", () => done(false));
		sock.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
	});

const classifyPort = async (): Promise<PortClass> => {
	const probed = await probeServer();
	if (probed !== "down") return probed; // "ours" | "foreign"
	// Nothing answered HTTP; a raw listener still means the port is taken.
	return (await isPortOccupied()) ? "foreign" : "free";
};

const waitForHealthy = async (timeoutMs: number): Promise<boolean> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if ((await probeServer()) === "ours") return true;
		// No point polling a child that already died — its exit handler logged why.
		if (mode === "spawned" && child && child.exitCode !== null) return false;
		await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
	}
	return false;
};

// ── Stale-server reclaim (pidfile) ───────────────────────────────────────────

const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code === "EPERM"; // exists, not signalable
	}
};

/** Best-effort: does `pid` actually look like a sandcastle server? Guards the
 *  reclaim against a recycled PID now owned by an unrelated process. Matches
 *  must be tight — a false positive group-SIGKILLs an innocent process tree. */
const processLooksLikeOurs = (pid: number): boolean => {
	try {
		if (process.platform === "win32") {
			// Only the packaged binary image (never a bare `bun.exe`, which could be
			// any unrelated Bun process that recycled the pid). Dev-on-Windows reclaim
			// is forgone — parentWatch still frees the port.
			const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
				encoding: "utf8",
				timeout: 2_000,
			}).toLowerCase();
			return out.includes(SERVER_BINARY_NAME.toLowerCase());
		}
		const out = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
			encoding: "utf8",
			timeout: 2_000,
		});
		// Packaged: the binary basename. Dev: the EXACT absolute entry path we spawn
		// (not a bare "server/src/main.ts" substring that an editor/grep could match).
		const devEntry = join(app.getAppPath(), "..", "server", "src", "main.ts");
		return out.includes("sandcastle-server") || out.includes(devEntry);
	} catch {
		return false; // not found / no permission → safest NOT to kill
	}
};

const writePidfile = (pid: number): void => {
	try {
		writeFileSync(PIDFILE, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
	} catch {
		// Non-fatal — we lose only the next-launch reclaim backstop.
	}
};

const clearPidfile = (): void => {
	try {
		rmSync(PIDFILE, { force: true });
	} catch {
		// ignore
	}
};

/**
 * If a previous run left a server alive (every in-process net having somehow
 * failed), SIGKILL it before we touch the port. Only ever kills a still-live PID
 * that we recorded AND that still looks like our server — never a recycled or
 * foreign process. Returns true if it killed something.
 */
const reclaimStalePid = (): boolean => {
	if (!existsSync(PIDFILE)) return false;
	let pid = 0;
	try {
		pid = Number(JSON.parse(readFileSync(PIDFILE, "utf8")).pid);
	} catch {
		clearPidfile();
		return false;
	}
	if (!pid || pid === process.pid || !isProcessAlive(pid) || !processLooksLikeOurs(pid)) {
		clearPidfile();
		return false;
	}
	console.warn(`[sandcastle] reclaiming stale backend server (pid ${pid}) from a previous run`);
	killProcessTree(pid);
	clearPidfile();
	return true;
};

// ── Process-tree kill (POSIX group / Windows taskkill) ───────────────────────

/** Hard-kill a process and the group/tree it leads. Used by reclaimStalePid()
 *  (startup, normal async context — NOT an 'exit' handler). */
const killProcessTree = (pid: number): void => {
	if (process.platform === "win32") {
		try {
			// /T whole tree, /F force.
			execFileSync("taskkill", ["/pid", String(pid), "/T", "/F"], { timeout: 2_000 });
		} catch {
			// already gone / nothing to kill
		}
		return;
	}
	// Negative pid = the whole process group (the child is a group leader because
	// we spawn it detached). Mirrors pty.ts. Fall back to the bare pid.
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// already gone
		}
	}
};

// ── Binary / command resolution ──────────────────────────────────────────────

/** Packaged binary path (extraResources `to: sidecar`), or null if missing. */
const packagedBinaryPath = (): string | null => {
	const p = join(process.resourcesPath, "sidecar", SERVER_BINARY_NAME);
	return existsSync(p) ? p : null;
};

/** Dev candidates: a locally-built binary, else run the source with `bun`. */
const devCommand = (): { cmd: string; args: string[]; cwd?: string } | null => {
	const appPath = app.getAppPath(); // apps/desktop in unpackaged runs
	const serverDir = join(appPath, "..", "server");
	const builtBinary = join(serverDir, "dist", SERVER_BINARY_NAME);
	if (existsSync(builtBinary)) return { cmd: builtBinary, args: [] };
	const entry = join(serverDir, "src", "main.ts");
	if (existsSync(entry)) return { cmd: "bun", args: [entry], cwd: serverDir };
	return null;
};

const resolveCommand = (): { cmd: string; args: string[]; cwd?: string } | null => {
	if (app.isPackaged) {
		const bin = packagedBinaryPath();
		return bin ? { cmd: bin, args: [] } : null;
	}
	return devCommand();
};

// ── Child lifecycle ──────────────────────────────────────────────────────────

const prefixLog = (stream: "out" | "err", chunk: Buffer): void => {
	const text = chunk.toString("utf8");
	for (const line of text.split(/\r?\n/)) {
		if (line.length === 0) continue;
		if (stream === "err") console.error(`[server] ${line}`);
		else console.log(`[server] ${line}`);
	}
};

const buildEnv = (): NodeJS.ProcessEnv => ({
	...process.env,
	HOST: SERVER_HOST,
	PORT: String(SERVER_PORT),
	// The server exits if we (its parent) disappear — last line of defense
	// against a leaked process on force-quit/crash. See parentWatch.ts.
	SANDCASTLE_PARENT_PID: String(process.pid),
});

// Synchronous last-ditch kill on ANY main-process exit that bypassed before-quit
// (e.g. an uncaught-exception teardown). Must stay sync: 'exit' handlers can't
// spawn, so on Windows we can only signal the single pid here (the child's own
// parentWatch + the OS closing its stdin pipe fell the rest).
const syncKillOnExit = (): void => {
	if (mode !== "spawned" || !child || child.pid == null) return;
	if (child.exitCode !== null || child.signalCode !== null) return;
	if (process.platform === "win32") {
		try {
			child.kill();
		} catch {
			/* gone */
		}
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		try {
			child.kill("SIGKILL");
		} catch {
			/* gone */
		}
	}
};

const installExitGuard = (): void => {
	if (exitGuardInstalled) return;
	exitGuardInstalled = true;
	process.on("exit", syncKillOnExit);
};

const spawnChild = (command: { cmd: string; args: string[]; cwd?: string }): void => {
	const proc = spawn(command.cmd, command.args, {
		// stdin is a pipe we hold open but never write to: the server treats its
		// EOF (which the OS triggers when WE die) as "parent gone, exit now".
		// stdout/stderr piped so server logs surface in the app's logs.
		stdio: ["pipe", "pipe", "pipe"],
		// Own process group (setsid) so teardown can group-kill the server AND the
		// short-lived git processes it spawns, mirroring pty.ts. The child outliving
		// us is then prevented by the teardown nets above, not by group membership.
		detached: true,
		windowsHide: true,
		cwd: command.cwd,
		env: buildEnv(),
	});

	child = proc;
	mode = "spawned";
	installExitGuard();

	if (proc.pid != null) writePidfile(proc.pid);

	// Never let an EPIPE on the liveness pipe (child closed its stdin / died)
	// bubble up as an uncaught error.
	proc.stdin?.on("error", () => {});
	proc.stdout?.on("data", (c: Buffer) => prefixLog("out", c));
	proc.stderr?.on("data", (c: Buffer) => prefixLog("err", c));

	proc.on("error", (err) => {
		console.error("[sandcastle] failed to spawn backend server:", err);
	});

	proc.on("exit", (code, signal) => {
		if (proc === child) child = null;
		if (quitting) return; // expected — we asked it to stop
		console.error(
			`[sandcastle] backend server exited unexpectedly (code=${code} signal=${signal})`,
		);
		clearPidfile();
		scheduleRestart(command);
	});
};

const scheduleRestart = (command: { cmd: string; args: string[]; cwd?: string }): void => {
	const now = Date.now();
	// Drop stamps outside the sliding window.
	while (restartStamps.length > 0 && now - restartStamps[0]! > RESTART_WINDOW_MS) {
		restartStamps.shift();
	}
	if (restartStamps.length >= MAX_RESTARTS) {
		console.error(
			`[sandcastle] backend server crashed ${MAX_RESTARTS}x within ${RESTART_WINDOW_MS / 1000}s; not restarting. The app will run without the relay until relaunch.`,
		);
		return;
	}
	restartStamps.push(now);
	const delay = RESTART_BASE_DELAY_MS * restartStamps.length;
	if (restartTimer) clearTimeout(restartTimer);
	restartTimer = setTimeout(() => {
		restartTimer = null;
		if (quitting) return;
		console.log("[sandcastle] restarting backend server…");
		spawnChild(command);
	}, delay);
	restartTimer.unref?.();
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the backend relay is reachable on 7421 before the window loads.
 * Adopts an already-healthy sandcastle server; otherwise spawns the sidecar and
 * waits for /health. Resolves true when the relay is reachable, false if it
 * never came up (the caller should still open the window — degraded, not blocked
 * forever).
 */
export const startServerSidecar = async (): Promise<boolean> => {
	// Sweep a server a previous run left behind (no-op unless one is verifiably
	// alive). Done first so a wedged leftover holding 7421 can't block our spawn.
	if (reclaimStalePid()) await new Promise((r) => setTimeout(r, RECLAIM_SETTLE_MS));

	let klass = await classifyPort();

	if (klass === "ours") {
		mode = "adopted";
		console.log(`[sandcastle] adopting existing backend server on ${HEALTH_URL}`);
		return true;
	}
	if (klass === "foreign") {
		console.error(
			`[sandcastle] port ${SERVER_PORT} is held by a non-sandcastle process; cannot start the relay. Continuing degraded.`,
		);
		return false;
	}

	// Port is free → spawn our own. Dev source spawns need the user's PATH (for
	// `bun`), which captureUserEnv() merges into process.env asynchronously.
	if (!app.isPackaged) await userEnvReady().catch(() => {});

	const command = resolveCommand();
	if (!command) {
		console.error(
			app.isPackaged
				? `[sandcastle] backend binary not found at resources/sidecar/${SERVER_BINARY_NAME}; relay unavailable.`
				: "[sandcastle] no backend found to run in dev (build it with `bun --filter @sandcastle/server run build:binary`, or run `turbo dev`).",
		);
		return false;
	}

	spawnChild(command);

	if (await waitForHealthy(READY_TIMEOUT_MS)) {
		console.log("[sandcastle] backend server is ready");
		return true;
	}

	// Didn't go healthy within the window. If OUR spawned child is still alive it
	// just bound late (cold disk / slow migration) — keep ownership so teardown
	// still kills it; do NOT relabel it "adopted" (that would make dispose skip it
	// and leak it on quit, relying on parentWatch alone).
	if (mode === "spawned" && child && child.exitCode === null) {
		console.warn("[sandcastle] backend server slow to bind; keeping ownership and continuing");
		return (await probeServer()) === "ours";
	}
	// Our child is gone but the port is a healthy relay → something else owns it
	// (e.g. a racing dev server); adopt it.
	klass = await classifyPort();
	if (klass === "ours") {
		console.warn("[sandcastle] our server didn't bind, but 7421 is a healthy relay; adopting it");
		mode = "adopted";
		return true;
	}
	console.error("[sandcastle] backend server did not become healthy in time; continuing degraded");
	return false;
};

/**
 * Stop the sidecar on app teardown. Synchronous-friendly for `before-quit`:
 * group-SIGTERM now and schedule an unref'd group-SIGKILL. Never touches an
 * adopted server (we didn't start it — e.g. the standalone `turbo dev` relay).
 */
export const disposeServerSidecar = (): void => {
	quitting = true;
	if (restartTimer) {
		clearTimeout(restartTimer);
		restartTimer = null;
	}
	if (mode !== "spawned") return;
	const proc = child;
	clearPidfile();
	// NB: we deliberately do NOT null `child` here. If the child ignores SIGTERM
	// and Electron exits before the unref'd SIGKILL timer fires, the process
	// 'exit' guard (syncKillOnExit) still sees the live `child` and group-SIGKILLs
	// it. The child's own 'exit' handler nulls `child` once it actually dies.
	if (!proc || proc.pid == null || proc.exitCode !== null || proc.signalCode !== null) return;
	const pid = proc.pid;

	if (process.platform === "win32") {
		try {
			spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
		} catch {
			try {
				proc.kill();
			} catch {
				/* gone */
			}
		}
		return;
	}

	// Graceful: SIGTERM the whole group (server + its git children).
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		try {
			proc.kill("SIGTERM");
		} catch {
			/* gone */
		}
	}
	if (killTimer) clearTimeout(killTimer);
	killTimer = setTimeout(() => {
		killTimer = null;
		if (proc.exitCode === null && proc.signalCode === null) {
			try {
				process.kill(-pid, "SIGKILL");
			} catch {
				try {
					proc.kill("SIGKILL");
				} catch {
					/* gone */
				}
			}
		}
	}, TERM_GRACE_MS);
	killTimer.unref?.();
};
