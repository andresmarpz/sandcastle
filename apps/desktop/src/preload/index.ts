import { electronAPI } from "@electron-toolkit/preload";
import { contextBridge, ipcRenderer } from "electron";

type CreateOptions = {
	id: string;
	cols?: number;
	rows?: number;
	cwd?: string;
	shell?: string;
	env?: Record<string, string>;
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

const api = { terminal, menu, caffeinate, dialog: fileDialog, window: browserWindow };

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
