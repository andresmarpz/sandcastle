import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import process from "node:process";
import { promisify } from "node:util";
import { ipcMain, webContents } from "electron";
import * as nodePty from "node-pty";
import { userEnvReady } from "./userEnv";

const execFileAsync = promisify(execFile);

type Session = {
	id: string;
	pty: nodePty.IPty;
	webContentsId: number;
};

const sessions = new Map<string, Session>();
const watchedRenderers = new Set<number>();

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
	cols?: number;
	rows?: number;
	cwd?: string;
	shell?: string;
	env?: Record<string, string>;
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

const disposeSession = (id: string): void => {
	const session = sessions.get(id);
	if (!session) return;
	sessions.delete(id);
	killTree(session.pty);
};

const disposeSessionsForRenderer = (webContentsId: number): void => {
	for (const [id, session] of sessions) {
		if (session.webContentsId === webContentsId) {
			sessions.delete(id);
			killTree(session.pty);
		}
	}
};

const watchRenderer = (wc: Electron.WebContents): void => {
	if (watchedRenderers.has(wc.id)) return;
	watchedRenderers.add(wc.id);
	const cleanup = (): void => {
		disposeSessionsForRenderer(wc.id);
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
	});
};

const createSession = (sender: Electron.WebContents, opts: CreateOptions): void => {
	const shell = opts.shell ?? defaultShell();
	const cwd = opts.cwd ?? homeDir();

	const pty = nodePty.spawn(shell, shellArgs(shell), {
		name: "xterm-256color",
		cols: opts.cols ?? 80,
		rows: opts.rows ?? 24,
		cwd,
		env: buildEnv(opts.env),
		useConpty: process.platform === "win32",
	});

	const session: Session = { id: opts.id, pty, webContentsId: sender.id };
	sessions.set(opts.id, session);
	watchRenderer(sender);
	wireSessionEvents(session);
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
		if (sessions.has(opts.id)) return { ok: true };
		await userEnvReady();
		createSession(event.sender, opts);
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

	ipcMain.handle("terminal:get-cwd", async (_event, id: string) => {
		const session = sessions.get(id);
		if (!session) return null;
		return getProcessCwd(session.pty.pid);
	});
};

export const disposeAllSessions = (): void => {
	for (const id of [...sessions.keys()]) disposeSession(id);
};
