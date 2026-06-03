import { fstatSync } from "node:fs";
import process from "node:process";

/**
 * Sidecar self-termination.
 *
 * When this server runs as a child of the Electron app, the parent can vanish
 * WITHOUT a chance to kill us: a `kill -9`, a crash, an OOM, or a hard power of
 * the renderer. In those cases Electron's `before-quit` never runs, so the
 * parent-side teardown can't fire. Left alone we'd keep holding port 7421 and
 * leak a process. This watcher is the last line of defense: the instant we
 * notice the parent is gone, we exit — which the OS turns into the port being
 * released.
 *
 * The parent passes its pid as `SANDCASTLE_PARENT_PID`. With no such env var
 * (standalone `bun src/main.ts`, an adopted dev server, tests) this is a no-op.
 *
 * Two independent detectors, because no single one is reliable on every OS:
 *   1. stdin EOF — the parent spawns us with our stdin as a pipe it holds open
 *      but never writes to. When the parent dies the OS closes the write end and
 *      our stdin emits `end`/`close`. Fast (no poll lag) and works on Windows,
 *      where ppid reparenting does not happen.
 *   2. ppid poll — on POSIX an orphan is reparented to init, so `process.ppid`
 *      drops to 1; we also probe the recorded parent pid with `kill(pid, 0)`.
 *      Backs up stdin detection if the parent was spawned with `detached` or
 *      otherwise keeps a stray pipe handle alive.
 */

const POLL_INTERVAL_MS = 1500;
// If a graceful SIGTERM hasn't taken the process down by now, something is
// wedged in shutdown — exit hard so we never linger holding the port.
const HARD_EXIT_GRACE_MS = 3000;

let shuttingDown = false;

const beginShutdown = (reason: string): void => {
	if (shuttingDown) return;
	shuttingDown = true;
	// Prefer a graceful stop: SIGTERM lets the Effect runtime run its finalizers
	// (close the HTTP listener, checkpoint + close SQLite). The OS frees the port
	// on exit regardless, but this avoids a dirty WAL.
	console.error(`[sandcastle-server] parent gone (${reason}); shutting down`);
	try {
		process.kill(process.pid, "SIGTERM");
	} catch {
		process.exit(0);
	}
	// Hard fallback if the graceful unwind hangs.
	const hard = setTimeout(() => process.exit(0), HARD_EXIT_GRACE_MS);
	hard.unref?.();
};

export const watchParent = (): void => {
	const raw = process.env.SANDCASTLE_PARENT_PID;
	const parentPid = raw ? Number(raw) : Number.NaN;
	if (!raw || Number.isNaN(parentPid) || parentPid <= 0) return;

	// 1) stdin EOF detector — ONLY when stdin is a real pipe to the parent.
	// A /dev/null stdin (`stdio: ['ignore', …]`) or a closed/redirected stdin is
	// at EOF immediately, which would fire a bogus "parent gone" at boot. Pipes
	// are FIFOs on POSIX and named pipes/sockets on Windows; anything else (char
	// device = TTY or /dev/null, regular file) means "no parent pipe here" and we
	// fall back to the poll.
	let stdinIsPipe = false;
	try {
		const st = fstatSync(0);
		stdinIsPipe = st.isFIFO() || st.isSocket();
	} catch {
		// fd 0 not statable — leave the poll as the sole detector.
	}
	if (stdinIsPipe) {
		try {
			const stdin = process.stdin;
			stdin.on("end", () => beginShutdown("stdin end"));
			stdin.on("close", () => beginShutdown("stdin close"));
			// An error reading stdin is not itself proof the parent died; let the
			// poll decide. Swallow so an unhandled 'error' doesn't crash us.
			stdin.on("error", () => {});
			stdin.resume();
		} catch {
			// Fall through to the poll.
		}
	}

	// 2) ppid / liveness poll.
	const timer = setInterval(() => {
		const orphanedToInit = process.ppid <= 1; // POSIX reparent-to-init
		let parentMissing = false;
		try {
			// Signal 0 performs existence/permission checks without delivering a
			// signal; ESRCH => the pid is gone.
			process.kill(parentPid, 0);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === "ESRCH") parentMissing = true;
			// EPERM means it exists but we can't signal it — treat as alive.
		}
		if (orphanedToInit || parentMissing) {
			clearInterval(timer);
			beginShutdown(orphanedToInit ? "reparented to init" : "parent pid missing");
		}
	}, POLL_INTERVAL_MS);
	// Don't let the watcher itself keep the event loop alive.
	timer.unref?.();
};
