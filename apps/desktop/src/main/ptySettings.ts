import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// PTY persistence (background terminals) setting.
//
// Owns ~/.sandcastle/settings.json, which holds how long detached terminal
// sessions are kept alive after the app quits before being reaped (see
// docs/pty-persistence.md §2.2/§2.3).
//
// This config MUST be readable by main at startup: the lazy reap on launch
// (§2.2) runs before the renderer loads, so it can't live in renderer
// localStorage. We follow the same load-at-startup + atomic-write pattern as
// claudeHooks.ts: read once into a module cache var, expose a synchronous
// getter for the reap / detach-vs-kill gate, and atomic-write on change.
//
// Shape: { ptyKeepAliveMinutes: number | null }
//   0    = off (no persistence; quit kills as today)
//   N    = keep detached sessions for N minutes, then reap on next launch
//   null = forever (never time-reaped)
// Default: 30.

const SANDCASTLE_DIR = path.join(os.homedir(), ".sandcastle");
const SETTINGS_FILE = path.join(SANDCASTLE_DIR, "settings.json");

const DEFAULT_KEEP_ALIVE_MINUTES = 30;

// Module cache, populated by loadPtySettings() at startup and updated by
// setKeepAliveMinutes(). Read synchronously via getKeepAliveMinutes().
let keepAliveMinutes: number | null = DEFAULT_KEEP_ALIVE_MINUTES;

const writeFileAtomic = async (file: string, contents: string): Promise<void> => {
	const tmp = `${file}.${process.pid}.tmp`;
	await fs.writeFile(tmp, contents, "utf8");
	await fs.rename(tmp, file);
};

// Accept only valid shapes: null (forever) or a finite, non-negative number of
// minutes. Anything else falls back to the default.
const normalize = (value: unknown): number | null => {
	if (value === null) return null;
	if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
		return value;
	}
	return DEFAULT_KEEP_ALIVE_MINUTES;
};

export const loadPtySettings = async (): Promise<void> => {
	try {
		const raw = await fs.readFile(SETTINGS_FILE, "utf8");
		const parsed = JSON.parse(raw) as { ptyKeepAliveMinutes?: unknown };
		if ("ptyKeepAliveMinutes" in parsed) {
			keepAliveMinutes = normalize(parsed.ptyKeepAliveMinutes);
		}
	} catch {
		// Missing/invalid — keep the default (30 minutes).
	}
};

export const getKeepAliveMinutes = (): number | null => keepAliveMinutes;

export const setKeepAliveMinutes = async (value: number | null): Promise<number | null> => {
	keepAliveMinutes = normalize(value);
	try {
		await fs.mkdir(SANDCASTLE_DIR, { recursive: true });
		await writeFileAtomic(
			SETTINGS_FILE,
			`${JSON.stringify({ ptyKeepAliveMinutes: keepAliveMinutes }, null, 2)}\n`,
		);
	} catch (err) {
		console.warn("[ptySettings] failed to persist keepalive setting:", err);
	}
	return keepAliveMinutes;
};
