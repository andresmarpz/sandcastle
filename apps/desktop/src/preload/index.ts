import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";
import type { PrStatus, PrStatusInput } from "../main/github";

type CreateOptions = {
	id: string;
	leafId: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	shell?: string;
	env?: Record<string, string>;
	workspaceId?: string;
};

const terminal = {
	create: (opts: CreateOptions): Promise<{ ok: true }> =>
		ipcRenderer.invoke("terminal:create", opts),
	write: (id: string, data: string): void => {
		ipcRenderer.send("terminal:input", id, data);
	},
	resize: (id: string, cols: number, rows: number): void => {
		ipcRenderer.send("terminal:resize", id, cols, rows);
	},
	dispose: (id: string): void => {
		ipcRenderer.send("terminal:dispose", id);
	},
	getCwd: (id: string): Promise<string | null> => ipcRenderer.invoke("terminal:get-cwd", id),
	// Background-terminal TTL setting (~/.sandcastle/settings.json, main-owned).
	// null = forever, 0 = off (kill on quit), N = minutes. See ptySettings.ts.
	getKeepAliveMinutes: (): Promise<number | null> => ipcRenderer.invoke("terminal:get-keepalive"),
	setKeepAliveMinutes: (minutes: number | null): Promise<number | null> =>
		ipcRenderer.invoke("terminal:set-keepalive", minutes),
	// Report the leafIds still present in the pane tree so main can reap orphaned
	// abduco servers (leaves closed while the app was down).
	reportActiveLeaves: (leafIds: string[]): void => {
		ipcRenderer.send("terminal:active-leaves", leafIds);
	},
	// Startup reattach: of the given leafIds, return those whose abduco server is
	// still alive so the renderer can headlessly reattach their surviving shells.
	// Pure filter — does NOT kill anything (unlike reportActiveLeaves).
	reattachable: (leafIds: string[]): Promise<string[]> =>
		ipcRenderer.invoke("terminal:reattachable", leafIds),
	// Signal sent once on every page load. Lets main reclaim terminal sessions
	// orphaned by a soft reload (the WebContents is reused, so 'destroyed' never
	// fires) before the reloaded page registers fresh ones.
	rendererReady: (): void => {
		ipcRenderer.send("terminal:renderer-ready");
	},
	getForegroundProcs: (
		ids: string[],
	): Promise<Record<string, Array<{ pid: number; comm: string; args: string }>>> =>
		ipcRenderer.invoke("terminal:get-foreground-procs", ids),
	onData: (id: string, listener: (data: string) => void): (() => void) => {
		const channel = `terminal:data:${id}`;
		const handler = (_: unknown, data: string): void => listener(data);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},
	onExit: (
		id: string,
		listener: (info: { exitCode: number; signal?: number }) => void,
	): (() => void) => {
		const channel = `terminal:exit:${id}`;
		const handler = (_: unknown, info: { exitCode: number; signal?: number }): void =>
			listener(info);
		ipcRenderer.on(channel, handler);
		return () => ipcRenderer.removeListener(channel, handler);
	},
};

export type MenuPopupItem =
	| { type: "separator" }
	| {
			type?: "normal";
			id: string;
			label: string;
			enabled?: boolean;
			accelerator?: string;
	  };

const menu = {
	popup: (items: MenuPopupItem[]): Promise<string | null> =>
		ipcRenderer.invoke("menu:popup", items),
};

const fileDialog = {
	pickDirectory: (): Promise<string | null> => ipcRenderer.invoke("dialog:pick-directory"),
};

const browserWindow = {
	close: (): void => {
		ipcRenderer.send("window:close");
	},
};

type CaffeinateStatus = { enabled: boolean; supported: boolean };

const caffeinate = {
	get: (): Promise<CaffeinateStatus> => ipcRenderer.invoke("caffeinate:get"),
	set: (enabled: boolean): Promise<CaffeinateStatus> =>
		ipcRenderer.invoke("caffeinate:set", enabled),
	onChange: (listener: (enabled: boolean) => void): (() => void) => {
		const handler = (_: unknown, enabled: boolean): void => listener(enabled);
		ipcRenderer.on("caffeinate:state", handler);
		return () => ipcRenderer.removeListener("caffeinate:state", handler);
	},
};

type ClaudeHookEvent = {
	sessionId: string;
	event: "working" | "attention" | "done" | "cron-start" | "cron-stop" | "session-end";
};

const claude = {
	// Claude Code lifecycle events, relayed from main's hook receiver. Drives the
	// workspace activity dot + notification sounds (see stores/activity).
	onHookEvent: (listener: (event: ClaudeHookEvent) => void): (() => void) => {
		const handler = (_: unknown, event: ClaudeHookEvent): void => listener(event);
		ipcRenderer.on("claude:hook", handler);
		return () => ipcRenderer.removeListener("claude:hook", handler);
	},
	getHooksEnabled: (): Promise<boolean> => ipcRenderer.invoke("claude:get-hooks-enabled"),
	setHooksEnabled: (enabled: boolean): Promise<boolean> =>
		ipcRenderer.invoke("claude:set-hooks-enabled", enabled),
};

// Command dispatched by the in-process MCP server (main) to the renderer that
// owns the calling terminal. The renderer applies the UI mutation and replies
// via `mcp.respond(requestId, ...)`.
export type McpCommand = {
	requestId: string;
	sessionId: string;
	kind: "whoami" | "split" | "new-tab" | "teleport" | "workspace-removed";
	orientation?: "horizontal" | "vertical";
	cwd?: string;
	focus?: boolean;
	targetWorkspaceId?: string;
	targetProjectId?: string;
	targetPath?: string;
};

const mcp = {
	onCommand: (listener: (cmd: McpCommand) => void): (() => void) => {
		const handler = (_: unknown, cmd: McpCommand): void => listener(cmd);
		ipcRenderer.on("mcp:command", handler);
		return () => ipcRenderer.removeListener("mcp:command", handler);
	},
	respond: (requestId: string, ok: boolean, data?: unknown, reason?: string): void => {
		ipcRenderer.send("mcp:response", { requestId, ok, data, reason });
	},
};

const github = {
	// Resolve the open/draft/merged PR for a worktree. Main owns the `gh` call
	// plus its cache; the renderer just paints whatever comes back (or nothing).
	prStatus: (input: PrStatusInput): Promise<PrStatus | null> =>
		ipcRenderer.invoke("github:pr-status", input),
};

const api = {
	terminal,
	menu,
	caffeinate,
	dialog: fileDialog,
	window: browserWindow,
	claude,
	mcp,
	github,
};

if (process.contextIsolated) {
	try {
		contextBridge.exposeInMainWorld("electron", electronAPI);
		contextBridge.exposeInMainWorld("api", api);
	} catch (error) {
		console.error(error);
	}
} else {
	(globalThis as unknown as { electron: typeof electronAPI; api: Api }).electron = electronAPI;
	(globalThis as unknown as { electron: typeof electronAPI; api: Api }).api = api;
}

export type Api = typeof api;
