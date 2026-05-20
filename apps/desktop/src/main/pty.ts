import { execFile } from "child_process";
import { ipcMain, webContents } from "electron";
import { promises as fs } from "fs";
import * as nodePty from "node-pty";
import os from "os";
import process from "process";
import { promisify } from "util";
import { userEnvReady } from "./userEnv";

const execFileAsync = promisify(execFile);

type Session = {
	id: string;
	pty: nodePty.IPty;
	webContentsId: number;
};

type WarmPty = {
	pty: nodePty.IPty;
	buffer: string;
	dataListener: nodePty.IDisposable;
	exitListener: nodePty.IDisposable;
	alive: boolean;
};

const sessions = new Map<string, Session>();
const watchedRenderers = new Set<number>();
const warmPool: WarmPty[] = [];
const POOL_SIZE = 1;
const WARM_COLS = 100;
const WARM_ROWS = 30;
let replenishScheduled = false;

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

const killTree = (pty: nodePty.IPty): void => {
	try {
		if (process.platform !== "win32") {
			try {
				process.kill(-pty.pid, "SIGHUP");
			} catch {
				// fall through to direct kill
			}
		}
		pty.kill();
	} catch {
		// already gone
	}
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

const isPoolable = (opts: CreateOptions): boolean => {
	// A non-default cwd is handled at adoption time by writing `cd` into the
	// warm shell, so it doesn't disqualify pooling. Only a non-default shell
	// or renderer-supplied env force a fresh spawn (warm shell's binary + env
	// are fixed at spawn time).
	if (opts.shell && opts.shell !== defaultShell()) return false;
	if (opts.env && Object.keys(opts.env).length > 0) return false;
	return true;
};

const shellQuote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

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

const createWarmPty = (): WarmPty => {
	const shell = defaultShell();
	const pty = nodePty.spawn(shell, shellArgs(shell), {
		name: "xterm-256color",
		cols: WARM_COLS,
		rows: WARM_ROWS,
		cwd: homeDir(),
		env: buildEnv(),
		useConpty: process.platform === "win32",
	});
	const warm: WarmPty = {
		pty,
		buffer: "",
		alive: true,
		dataListener: pty.onData((d) => {
			warm.buffer += d;
		}),
		exitListener: pty.onExit(() => {
			warm.alive = false;
			const idx = warmPool.indexOf(warm);
			if (idx >= 0) warmPool.splice(idx, 1);
			scheduleReplenish();
		}),
	};
	return warm;
};

const scheduleReplenish = (): void => {
	if (replenishScheduled) return;
	replenishScheduled = true;
	setImmediate(() => {
		replenishScheduled = false;
		while (warmPool.length < POOL_SIZE) {
			warmPool.push(createWarmPty());
		}
	});
};

const adoptWarmPty = (
	warm: WarmPty,
	sender: Electron.WebContents,
	opts: CreateOptions,
): void => {
	// Detach buffer-capturing listeners. The buffered prompt was rendered at
	// the warm size (WARM_COLS × WARM_ROWS) and would corrupt the visual at the
	// renderer's actual size, so we discard it and force the shell to redraw.
	warm.dataListener.dispose();
	warm.exitListener.dispose();
	warm.buffer = "";

	const pty = warm.pty;
	const cols = Math.max(1, opts.cols ?? WARM_COLS);
	const rows = Math.max(1, opts.rows ?? WARM_ROWS);

	// Wire the session BEFORE resizing/redrawing so we capture every byte the
	// shell emits in response (WINCH, then the Ctrl-L redraw).
	const session: Session = { id: opts.id, pty, webContentsId: sender.id };
	sessions.set(opts.id, session);
	watchRenderer(sender);
	wireSessionEvents(session);

	try {
		pty.resize(cols, rows);
	} catch {
		// pty exited between pool check and adoption — fall back to fresh
		sessions.delete(opts.id);
		createSession(sender, opts);
		return;
	}

	// Defer by a tick so terminal:create resolves first and the renderer is
	// fully subscribed to terminal:data:<id> before output flies past.
	const wantsCd = opts.cwd && opts.cwd !== homeDir();
	setImmediate(() => {
		try {
			if (wantsCd) {
				// `cd` to the inherited cwd. The resulting prompt repaint also
				// covers the resize redraw, so no Ctrl-L is needed.
				pty.write(`cd ${shellQuote(opts.cwd!)}\r`);
			} else {
				// Ctrl-L → ZLE clear-screen / readline clear-screen in bash →
				// the shell repaints prompt at the new cols/rows.
				pty.write("\x0c");
			}
		} catch {
			// pty already gone
		}
	});
};

const initWarmPool = (): void => {
	scheduleReplenish();
};

export const primeWarmPool = (): void => {
	void userEnvReady().then(initWarmPool);
};

export const registerPtyHandlers = (): void => {
	ipcMain.handle("terminal:create", async (event, opts: CreateOptions) => {
		if (sessions.has(opts.id)) return { ok: true };
		await userEnvReady();
		initWarmPool();

		if (isPoolable(opts) && warmPool.length > 0) {
			const warm = warmPool.shift();
			if (warm && warm.alive) {
				adoptWarmPty(warm, event.sender, opts);
				scheduleReplenish();
				return { ok: true };
			}
		}

		createSession(event.sender, opts);
		scheduleReplenish();
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
	for (const warm of warmPool.splice(0)) {
		try {
			warm.dataListener.dispose();
			warm.exitListener.dispose();
			killTree(warm.pty);
		} catch {
			// already gone
		}
	}
};
