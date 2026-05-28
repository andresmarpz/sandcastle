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

	ipcMain.handle("terminal:get-foreground-procs", async (_event, ids: string[]) => {
		return getForegroundProcs(ids);
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

const getForegroundProcs = async (
	ids: string[],
): Promise<Record<string, ForegroundProc[]>> => {
	const result: Record<string, ForegroundProc[]> = {};
	const targets: Array<{ id: string; shellPid: number }> = [];
	for (const id of ids) {
		const session = sessions.get(id);
		if (!session) {
			result[id] = [];
			continue;
		}
		targets.push({ id, shellPid: session.pty.pid });
	}
	if (targets.length === 0) return result;

	if (process.platform === "win32") {
		// node-pty on Windows uses ConPTY; no foreground-pgrp concept. Skip for now.
		for (const t of targets) result[t.id] = [];
		return result;
	}

	let stdout = "";
	try {
		// One ps call covers every session. -A: all processes, -o with trailing `=`
		// suppresses headers and lets `command` consume the rest of the line.
		const r = await execFileAsync("/bin/ps", ["-Ao", "pid=,ppid=,stat=,command="], {
			maxBuffer: 8 * 1024 * 1024,
		});
		stdout = r.stdout;
	} catch {
		for (const t of targets) result[t.id] = [];
		return result;
	}

	const rows = parsePsRows(stdout);
	const childrenOf = new Map<number, ProcRow[]>();
	for (const row of rows) {
		const arr = childrenOf.get(row.ppid);
		if (arr) arr.push(row);
		else childrenOf.set(row.ppid, [row]);
	}
	for (const t of targets) {
		result[t.id] = collectForeground(t.shellPid, childrenOf);
	}
	return result;
};

export const disposeAllSessions = (): void => {
	for (const id of [...sessions.keys()]) disposeSession(id);
};
