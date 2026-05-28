import { type ChildProcess, spawn } from "node:child_process";
import { ipcMain, webContents } from "electron";

const CHANNEL_GET = "caffeinate:get";
const CHANNEL_SET = "caffeinate:set";
const CHANNEL_STATE = "caffeinate:state";

const SIGKILL_GRACE_MS = 2000;

let child: ChildProcess | null = null;
let pendingKillTimer: NodeJS.Timeout | null = null;

const isSupported = (): boolean => process.platform === "darwin";

const broadcast = (enabled: boolean): void => {
	for (const wc of webContents.getAllWebContents()) {
		if (!wc.isDestroyed()) wc.send(CHANNEL_STATE, enabled);
	}
};

const clearKillTimer = (): void => {
	if (pendingKillTimer) {
		clearTimeout(pendingKillTimer);
		pendingKillTimer = null;
	}
};

const enable = (): boolean => {
	if (!isSupported()) return false;
	if (child && !child.killed) return true;

	// -d  prevent display sleep
	// -i  prevent idle sleep
	// -m  prevent disk idle sleep
	// -s  prevent system sleep (only honored on AC, but harmless otherwise)
	const proc = spawn("caffeinate", ["-dims"], {
		stdio: "ignore",
		detached: false,
		windowsHide: true,
	});

	let started = false;

	proc.once("spawn", () => {
		started = true;
		broadcast(true);
	});

	proc.once("error", (err) => {
		console.error("[caffeinate] spawn error:", err);
		if (child === proc) {
			child = null;
			clearKillTimer();
		}
		if (started) broadcast(false);
	});

	proc.once("exit", () => {
		if (child === proc) {
			child = null;
			clearKillTimer();
			broadcast(false);
		}
	});

	child = proc;
	return true;
};

const disable = (): void => {
	const proc = child;
	if (!proc) return;
	if (proc.exitCode !== null || proc.signalCode !== null) {
		child = null;
		return;
	}

	try {
		proc.kill("SIGTERM");
	} catch (err) {
		console.error("[caffeinate] SIGTERM failed:", err);
	}

	clearKillTimer();
	pendingKillTimer = setTimeout(() => {
		pendingKillTimer = null;
		if (child === proc && proc.exitCode === null && proc.signalCode === null) {
			try {
				proc.kill("SIGKILL");
			} catch (err) {
				console.error("[caffeinate] SIGKILL failed:", err);
			}
		}
	}, SIGKILL_GRACE_MS);
	pendingKillTimer.unref?.();
};

const isEnabled = (): boolean => {
	return !!child && child.exitCode === null && child.signalCode === null;
};

export const disposeCaffeinate = (): void => {
	clearKillTimer();
	const proc = child;
	child = null;
	if (!proc) return;
	if (proc.exitCode !== null || proc.signalCode !== null) return;
	try {
		proc.kill("SIGTERM");
	} catch {
		// ignore
	}
	// Best-effort synchronous follow-up; we cannot await in before-quit
	// without delaying shutdown. caffeinate exits promptly on SIGTERM.
};

export const registerCaffeinateHandlers = (): void => {
	ipcMain.handle(CHANNEL_GET, () => ({
		enabled: isEnabled(),
		supported: isSupported(),
	}));

	ipcMain.handle(CHANNEL_SET, (_event, next: boolean) => {
		if (next) enable();
		else disable();
		return { enabled: isEnabled(), supported: isSupported() };
	});
};
