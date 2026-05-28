import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { ipcMain, webContents } from "electron";

// Claude Code activity integration.
//
// We register a handful of Claude Code lifecycle hooks in the user's global
// ~/.claude/settings.json. Each hook is a tiny shell command that POSTs the
// event + the owning PTY's session id back to a localhost endpoint this process
// listens on. main then broadcasts the event to the renderer, where it drives
// the per-workspace activity dot and notification sounds (see stores/activity).
//
// The hook is a no-op outside Sandcastle (it bails unless SANDCASTLE_SESSION_ID
// is set, which only Sandcastle-spawned PTYs carry — see main/pty.ts), and the
// settings merge is additive, idempotent and reversible.

const SANDCASTLE_DIR = path.join(os.homedir(), ".sandcastle");
const HOOKS_DIR = path.join(SANDCASTLE_DIR, "hooks");
const ENDPOINT_FILE = path.join(SANDCASTLE_DIR, "hook-endpoint");
const SCRIPT_FILE = path.join(HOOKS_DIR, "notify.sh");
const INTEGRATION_FILE = path.join(SANDCASTLE_DIR, "integration.json");
const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), ".claude", "settings.json");

// Claude Code hook event -> the status arg passed to notify.sh. Kept minimal so
// the hooks fire only a few times per turn (no per-tool-call chatter):
//   UserPromptSubmit -> a turn started (working)
//   Notification     -> Claude is blocked waiting on the user (needs-attention)
//   Stop             -> the turn finished (done)
const HOOK_EVENTS: Record<string, "working" | "attention" | "done"> = {
	UserPromptSubmit: "working",
	Notification: "attention",
	Stop: "done",
};

const HOOK_STATUSES = new Set(["working", "attention", "done"]);

const SCRIPT_CONTENT = `#!/bin/sh
# Sandcastle <-> Claude Code activity hook. No-op outside Sandcastle.
# Managed by Sandcastle; safe to delete (it is regenerated on launch).
[ -n "$SANDCASTLE_SESSION_ID" ] || exit 0
ep="$HOME/.sandcastle/hook-endpoint"
[ -f "$ep" ] || exit 0
url=$(cat "$ep" 2>/dev/null)
[ -n "$url" ] || exit 0
curl -sf -m 2 -X POST "$url" \\
  -H 'content-type: application/json' \\
  -d "{\\"sessionId\\":\\"$SANDCASTLE_SESSION_ID\\",\\"event\\":\\"$1\\"}" >/dev/null 2>&1 || true
exit 0
`;

let server: Server | null = null;
let token = "";
let enabled = true;

const isOurHook = (h: unknown): boolean =>
	typeof h === "object" &&
	h !== null &&
	typeof (h as { command?: unknown }).command === "string" &&
	(h as { command: string }).command.includes(SCRIPT_FILE);

const broadcast = (sessionId: string, event: string): void => {
	for (const wc of webContents.getAllWebContents()) {
		if (!wc.isDestroyed()) wc.send("claude:hook", { sessionId, event });
	}
};

const writeFileAtomic = async (file: string, contents: string): Promise<void> => {
	const tmp = `${file}.${process.pid}.tmp`;
	await fs.writeFile(tmp, contents, "utf8");
	await fs.rename(tmp, file);
};

const loadEnabled = async (): Promise<void> => {
	try {
		const raw = await fs.readFile(INTEGRATION_FILE, "utf8");
		const parsed = JSON.parse(raw) as { hooksEnabled?: boolean };
		if (typeof parsed.hooksEnabled === "boolean") enabled = parsed.hooksEnabled;
	} catch {
		// Missing/invalid — keep the default (enabled).
	}
};

const persistEnabled = async (): Promise<void> => {
	try {
		await fs.mkdir(SANDCASTLE_DIR, { recursive: true });
		await writeFileAtomic(
			INTEGRATION_FILE,
			`${JSON.stringify({ hooksEnabled: enabled }, null, 2)}\n`,
		);
	} catch (err) {
		console.warn("[claudeHooks] failed to persist integration flag:", err);
	}
};

const startServer = async (): Promise<void> => {
	if (server) return;
	token = crypto.randomBytes(16).toString("hex");
	const srv = createServer((req, res) => {
		if (req.method !== "POST" || req.url !== `/${token}`) {
			res.statusCode = 404;
			res.end();
			return;
		}
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > 4096) req.destroy();
		});
		req.on("end", () => {
			try {
				const parsed = JSON.parse(body) as { sessionId?: unknown; event?: unknown };
				if (
					typeof parsed.sessionId === "string" &&
					typeof parsed.event === "string" &&
					HOOK_STATUSES.has(parsed.event)
				) {
					broadcast(parsed.sessionId, parsed.event);
				}
			} catch {
				// malformed body — ignore
			}
			res.statusCode = 204;
			res.end();
		});
	});
	await new Promise<void>((resolve, reject) => {
		srv.once("error", reject);
		srv.listen(0, "127.0.0.1", () => {
			srv.removeListener("error", reject);
			resolve();
		});
	});
	server = srv;
	const addr = srv.address();
	const port = typeof addr === "object" && addr ? addr.port : 0;
	await fs.mkdir(SANDCASTLE_DIR, { recursive: true });
	await writeFileAtomic(ENDPOINT_FILE, `http://127.0.0.1:${port}/${token}`);
};

const installScript = async (): Promise<void> => {
	await fs.mkdir(HOOKS_DIR, { recursive: true });
	await fs.writeFile(SCRIPT_FILE, SCRIPT_CONTENT, { mode: 0o755 });
	await fs.chmod(SCRIPT_FILE, 0o755);
};

// Read ~/.claude/settings.json, returning { settings, present }. Throws only on
// a present-but-unparseable file so callers can refuse to clobber it.
const readClaudeSettings = async (): Promise<{
	settings: Record<string, unknown>;
	present: boolean;
}> => {
	let raw: string;
	try {
		raw = await fs.readFile(CLAUDE_SETTINGS_FILE, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return { settings: {}, present: false };
		throw err;
	}
	if (raw.trim() === "") return { settings: {}, present: true };
	return { settings: JSON.parse(raw) as Record<string, unknown>, present: true };
};

type HookGroup = { matcher?: string; hooks?: Array<{ type?: string; command?: string }> };

// Strip every hook entry that points at our script across all events, leaving
// the user's own hooks untouched. Returns whether anything changed.
const stripOurHooks = (hooks: Record<string, unknown>): boolean => {
	let changed = false;
	for (const event of Object.keys(hooks)) {
		const groups = hooks[event];
		if (!Array.isArray(groups)) continue;
		const kept = (groups as HookGroup[]).filter((group) => {
			const inner = Array.isArray(group?.hooks) ? group.hooks : [];
			const ours = inner.some(isOurHook);
			if (ours) changed = true;
			return !ours;
		});
		if (kept.length === 0) {
			delete hooks[event];
		} else {
			hooks[event] = kept;
		}
	}
	return changed;
};

const mergeHooks = async (): Promise<void> => {
	const { settings, present } = await readClaudeSettings();
	const hooks = (settings.hooks as Record<string, unknown> | undefined) ?? {};
	// Re-install cleanly: drop any prior Sandcastle entries first (idempotent).
	stripOurHooks(hooks);
	for (const [event, arg] of Object.entries(HOOK_EVENTS)) {
		const groups = Array.isArray(hooks[event]) ? (hooks[event] as HookGroup[]) : [];
		groups.push({ hooks: [{ type: "command", command: `sh "${SCRIPT_FILE}" ${arg}` }] });
		hooks[event] = groups;
	}
	settings.hooks = hooks;
	if (!present) await fs.mkdir(path.dirname(CLAUDE_SETTINGS_FILE), { recursive: true });
	await writeFileAtomic(CLAUDE_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
};

const removeHooks = async (): Promise<void> => {
	let settings: Record<string, unknown>;
	try {
		const read = await readClaudeSettings();
		if (!read.present) return;
		settings = read.settings;
	} catch {
		return; // unparseable — leave it alone
	}
	const hooks = settings.hooks as Record<string, unknown> | undefined;
	if (!hooks) return;
	if (!stripOurHooks(hooks)) return;
	if (Object.keys(hooks).length === 0) delete settings.hooks;
	await writeFileAtomic(CLAUDE_SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
};

const apply = async (): Promise<void> => {
	if (!enabled) return;
	await installScript();
	try {
		await mergeHooks();
	} catch (err) {
		console.warn("[claudeHooks] could not merge ~/.claude/settings.json (left untouched):", err);
	}
};

export const registerClaudeHookHandlers = async (): Promise<void> => {
	await loadEnabled();
	try {
		await startServer();
	} catch (err) {
		console.warn("[claudeHooks] failed to start hook server:", err);
	}
	await apply();

	ipcMain.handle("claude:get-hooks-enabled", () => enabled);
	ipcMain.handle("claude:set-hooks-enabled", async (_event, value: boolean): Promise<boolean> => {
		enabled = Boolean(value);
		await persistEnabled();
		if (enabled) {
			await apply();
		} else {
			await removeHooks().catch((err) =>
				console.warn("[claudeHooks] failed to remove hooks:", err),
			);
		}
		return enabled;
	});
};

export const disposeClaudeHooks = (): void => {
	server?.close();
	server = null;
	// Drop the endpoint so the hook script bails instantly while the app is down
	// (rather than attempting a doomed localhost POST). Rewritten on next launch.
	void fs.rm(ENDPOINT_FILE, { force: true }).catch(() => {});
};
