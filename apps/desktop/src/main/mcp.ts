import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import { join } from "node:path";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { app, ipcMain, webContents } from "electron";
import { z } from "zod";

import {
	type InjectionAssets,
	sessionEnv,
	shellInjection,
	writeInjectionAssets,
} from "./mcpInjection";
import { userEnvReady } from "./userEnv";

/**
 * In-process MCP server. Lives in the Electron MAIN process because every action
 * it exposes has to mutate renderer state (splits/tabs/teleport) and/or call the
 * Bun relay — both reachable only from main. One loopback HTTP server serves all
 * panes; each call is authenticated by a per-session bearer token that resolves
 * to the exact terminal that issued it, so no other local process can drive the
 * UI and there's never ambiguity about which pane called.
 *
 * Transport: MCP Streamable HTTP (stateful), with JSON responses. A `claude`
 * launched in a pane connects via an injected `--mcp-config` (see mcpInjection).
 */

const SERVER_BASE_URL = process.env.SANDCASTLE_SERVER_URL ?? "http://127.0.0.1:7421";
// How long a tool/hook waits for the renderer to apply a UI mutation before
// giving up — generous enough for hydration, short enough not to hang a tool.
const RENDERER_TIMEOUT_MS = 8000;

// The loopback HTTP port is PINNED (not ephemeral) so the SANDCASTLE_MCP_URL
// baked into a PTY's env (mcpInjection) stays correct across an app restart —
// a reattached shell's `claude` reconnects to the same endpoint (Phase 2).
// Overridable via env for dev/multi-instance setups.
const MCP_PORT = ((): number => {
	const raw = process.env.SANDCASTLE_MCP_PORT;
	const parsed = raw ? Number.parseInt(raw, 10) : NaN;
	return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : 7420;
})();

// Persisted sessionId -> token map. Mirrors claudeHooks.ts: a JSON file under
// ~/.sandcastle, atomic-written on change and reloaded at startup. Restoring it
// means a reattached shell's OLD bearer token still authenticates after a
// restart (the shell's baked-in SANDCASTLE_MCP_TOKEN is unchanged).
const SANDCASTLE_DIR = join(os.homedir(), ".sandcastle");
const TOKENS_FILE = join(SANDCASTLE_DIR, "mcp-tokens.json");

type SessionReg = {
	sessionId: string;
	webContentsId: number;
	workspaceId?: string;
	token: string;
};

type McpConn = {
	transport: StreamableHTTPServerTransport;
	server: McpServer;
	sessionId: string;
};

type RendererResult = { ok: boolean; data?: unknown; reason?: string };

const sessionsById = new Map<string, SessionReg>();
const sessionByToken = new Map<string, string>();
// sessionId -> token restored from disk at startup. A reattached shell carries
// its OLD baked-in token; re-registering its session reuses this so the token
// still resolves. Consumed (deleted) on the first registerSession for that id.
const restoredTokens = new Map<string, string>();
// Keyed by the MCP-level session id (assigned on `initialize`), not our PTY id.
const mcpConnections = new Map<string, McpConn>();
// Pending renderer round-trips. We track the owning sessionId so a session
// teardown can fail its in-flight requests fast instead of waiting the timeout.
const pendingRenderer = new Map<
	string,
	{ sessionId: string; resolve: (res: RendererResult) => void }
>();

let httpServer: Server | null = null;
let baseUrl: string | null = null;
let assets: InjectionAssets | null = null;
let responseListenerBound = false;

// ── Token persistence (mirrors claudeHooks.ts atomic-write pattern) ──────────

const writeFileAtomic = async (file: string, contents: string): Promise<void> => {
	const tmp = `${file}.${process.pid}.tmp`;
	await fs.writeFile(tmp, contents, "utf8");
	await fs.rename(tmp, file);
};

// Persist only the durable sessionId -> token mapping. webContentsId is NOT
// persisted: it's the id of a window from a previous run and is meaningless
// after restart. A restored entry resolves a reattached shell's old token to
// its sessionId; the live SessionReg.webContentsId is then re-populated when
// pty.ts re-registers the reattached session (registerSession early-keeps the
// restored token — see below).
const persistTokens = async (): Promise<void> => {
	try {
		const map: Record<string, string> = {};
		for (const [sessionId, reg] of sessionsById) map[sessionId] = reg.token;
		await fs.mkdir(SANDCASTLE_DIR, { recursive: true });
		await writeFileAtomic(TOKENS_FILE, `${JSON.stringify(map, null, 2)}\n`);
	} catch (err) {
		console.warn("[sandcastle] failed to persist MCP tokens:", err);
	}
};

// Restore sessionId -> token from disk. The window these sessions belonged to is
// gone, so we seed sessionByToken (token resolution) and a "restored token"
// lookup that registerSession consults to re-mint the SAME token for a
// reattached session, keeping the shell's baked-in bearer valid.
const restoreTokens = async (): Promise<void> => {
	restoredTokens.clear();
	try {
		const raw = await fs.readFile(TOKENS_FILE, "utf8");
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		for (const [sessionId, token] of Object.entries(parsed)) {
			if (typeof token !== "string" || !token) continue;
			restoredTokens.set(sessionId, token);
			sessionByToken.set(token, sessionId);
		}
	} catch {
		// Missing/invalid — start with an empty map.
	}
};

const bearerToken = (req: IncomingMessage): string | null => {
	const header = req.headers.authorization;
	if (!header) return null;
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	return m ? (m[1] ?? null) : null;
};

const readJsonBody = (req: IncomingMessage): Promise<unknown> =>
	new Promise((resolve) => {
		let raw = "";
		let settled = false;
		const done = (value: unknown): void => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		req.on("data", (chunk) => {
			raw += chunk;
			// Guard against absurd bodies; MCP payloads are tiny.
			if (raw.length > 4 * 1024 * 1024) req.destroy();
		});
		req.on("end", () => {
			if (!raw) return done(undefined);
			try {
				done(JSON.parse(raw));
			} catch {
				done(undefined);
			}
		});
		// `error`/`aborted`/`close` cover req.destroy() (oversized body) and client
		// aborts, which never emit `end` — without these the await would hang.
		req.on("error", () => done(undefined));
		req.on("aborted", () => done(undefined));
		req.on("close", () => done(undefined));
	});

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
	if (res.headersSent) return;
	res.writeHead(status, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
};

// ── Renderer round-trip ──────────────────────────────────────────────────────

const requestRenderer = (
	sessionId: string,
	payload: Record<string, unknown>,
): Promise<RendererResult> => {
	const reg = sessionsById.get(sessionId);
	if (!reg) return Promise.resolve({ ok: false, reason: "unknown session" });
	const wc = webContents.fromId(reg.webContentsId);
	if (!wc || wc.isDestroyed()) return Promise.resolve({ ok: false, reason: "window gone" });

	const requestId = randomUUID();
	return new Promise<RendererResult>((resolve) => {
		const timer = setTimeout(() => {
			pendingRenderer.delete(requestId);
			resolve({ ok: false, reason: "renderer timeout" });
		}, RENDERER_TIMEOUT_MS);
		pendingRenderer.set(requestId, {
			sessionId,
			resolve: (r) => {
				clearTimeout(timer);
				resolve(r);
			},
		});
		wc.send("mcp:command", { requestId, sessionId, ...payload });
	});
};

// ── Teleport (shared by the MCP tool and the worktree hook) ──────────────────

type TeleportResult =
	| { ok: true; workspaceId: string; path: string; moved: boolean }
	| { ok: false; reason: string };

const teleportToCwd = async (sessionId: string, newCwd: string): Promise<TeleportResult> => {
	if (!newCwd) return { ok: false, reason: "no cwd" };
	if (!sessionsById.has(sessionId)) return { ok: false, reason: "unknown session" };

	// Resolve (find-or-create) the workspace owning this path on the relay.
	let workspace: { id: string; path: string; projectId: string } | null = null;
	try {
		const resp = await fetch(`${SERVER_BASE_URL}/workspaces/upsert-for-path`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: newCwd }),
		});
		const json = (await resp.json()) as {
			workspace: { id: string; path: string; projectId: string } | null;
			reason?: string | null;
		};
		workspace = json.workspace;
		if (!workspace) return { ok: false, reason: json.reason ?? "path not in a known project" };
	} catch (err) {
		return { ok: false, reason: `relay unavailable: ${String(err)}` };
	}

	// Ask the renderer to reparent the calling terminal's tab into that workspace.
	// `targetProjectId` lets the renderer refresh the sidebar's per-project
	// workspace list — the upsert above is a bare relay POST that never bumps the
	// RPC client's reactivity key, so a freshly-created workspace is otherwise
	// invisible until reload.
	const r = await requestRenderer(sessionId, {
		kind: "teleport",
		targetWorkspaceId: workspace.id,
		targetProjectId: workspace.projectId,
		targetPath: workspace.path,
	});
	if (!r.ok) return { ok: false, reason: r.reason ?? "renderer refused" };
	const moved = Boolean((r.data as { moved?: boolean } | undefined)?.moved);
	return { ok: true, workspaceId: workspace.id, path: workspace.path, moved };
};

// ── Workspace removal (ExitWorktree action:"remove") ─────────────────────────

/**
 * Delete the Sandcastle workspace that tracked a now-removed git worktree, then
 * tell the renderer to drop it from its tab state + sidebar. Best-effort: a path
 * we don't track (or that resolves to a non-worktree workspace) is a quiet no-op.
 */
const removeWorkspaceForPath = async (sessionId: string, worktreePath: string): Promise<void> => {
	if (!worktreePath) return;
	let workspace: { id: string; projectId: string } | null = null;
	try {
		const resp = await fetch(`${SERVER_BASE_URL}/workspaces/delete-for-path`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ path: worktreePath }),
		});
		const json = (await resp.json()) as {
			workspace: { id: string; projectId: string } | null;
			reason?: string | null;
		};
		workspace = json.workspace;
		if (!workspace) {
			console.warn(
				`[sandcastle] worktree hook: no workspace deleted for "${worktreePath}": ${json.reason ?? "unknown"}`,
			);
			return;
		}
	} catch (err) {
		console.warn(`[sandcastle] worktree hook: delete relay unavailable: ${String(err)}`);
		return;
	}

	// UI cleanup is best-effort — the row is already soft-deleted server-side, so
	// a missing/closed renderer just means a stale entry until the next refresh.
	await requestRenderer(sessionId, {
		kind: "workspace-removed",
		targetWorkspaceId: workspace.id,
		targetProjectId: workspace.projectId,
	});
	console.log(`[sandcastle] worktree hook: removed workspace ${workspace.id} for ${worktreePath}`);
};

// ── MCP tools ────────────────────────────────────────────────────────────────

const textResult = (text: string, isError = false) => ({
	content: [{ type: "text" as const, text }],
	...(isError ? { isError: true } : {}),
});

const rendererText = (r: RendererResult): ReturnType<typeof textResult> =>
	r.ok
		? textResult(
				typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? { ok: true }, null, 2),
			)
		: textResult(`Failed: ${r.reason ?? "unknown error"}`, true);

const registerTools = (server: McpServer, sessionId: string): void => {
	server.registerTool(
		"sandcastle_whoami",
		{
			description:
				"Return the calling terminal's Sandcastle context: workspaceId, workspace path, project, tabId, paneId (leafId) and current working directory.",
			inputSchema: {},
		},
		async () => rendererText(await requestRenderer(sessionId, { kind: "whoami" })),
	);

	server.registerTool(
		"sandcastle_split_pane",
		{
			description:
				"Split the calling terminal's pane in its current tab. 'horizontal' opens the new pane to the right, 'vertical' below. Defaults to the pane's current working directory.",
			inputSchema: {
				orientation: z
					.enum(["horizontal", "vertical"])
					.optional()
					.describe("Split direction; default 'horizontal' (new pane to the right)."),
				cwd: z.string().optional().describe("Working directory for the new pane."),
			},
		},
		async (args) =>
			rendererText(
				await requestRenderer(sessionId, {
					kind: "split",
					orientation: args.orientation ?? "horizontal",
					cwd: args.cwd,
				}),
			),
	);

	server.registerTool(
		"sandcastle_new_tab",
		{
			description:
				"Open a new terminal tab in the caller's workspace and focus it. Defaults to the workspace's path.",
			inputSchema: {
				cwd: z.string().optional().describe("Working directory for the new tab."),
				focus: z.boolean().optional().describe("Focus the new tab (default true)."),
			},
		},
		async (args) =>
			rendererText(
				await requestRenderer(sessionId, {
					kind: "new-tab",
					cwd: args.cwd,
					focus: args.focus ?? true,
				}),
			),
	);

	server.registerTool(
		"sandcastle_teleport_worktree",
		{
			description:
				"Re-group the calling terminal under the Sandcastle workspace for a git worktree, creating the workspace from the existing worktree if needed. Defaults to the terminal's current working directory. This usually happens automatically when you enter a worktree; call it to force re-grouping.",
			inputSchema: {
				worktreePath: z
					.string()
					.optional()
					.describe(
						"Absolute path inside the target git worktree. Defaults to the terminal's current cwd.",
					),
			},
		},
		async (args) => {
			let path = args.worktreePath;
			if (!path) {
				const who = await requestRenderer(sessionId, { kind: "whoami" });
				path = (who.data as { cwd?: string } | undefined)?.cwd;
			}
			if (!path) return textResult("Could not determine a worktree path to teleport to.", true);
			const out = await teleportToCwd(sessionId, path);
			return out.ok
				? textResult(
						out.moved
							? `Teleported terminal into workspace ${out.workspaceId} (${out.path}).`
							: `Already in workspace ${out.workspaceId} (${out.path}); nothing to move.`,
					)
				: textResult(`Teleport failed: ${out.reason}`, true);
		},
	);
};

// ── HTTP handling ────────────────────────────────────────────────────────────

const isInitialize = (body: unknown): boolean => {
	const check = (m: unknown): boolean =>
		typeof m === "object" && m !== null && (m as { method?: string }).method === "initialize";
	return Array.isArray(body) ? body.some(check) : check(body);
};

const handleMcp = async (
	req: IncomingMessage,
	res: ServerResponse,
	sessionId: string,
	body: unknown,
): Promise<void> => {
	const mcpSessionId = req.headers["mcp-session-id"] as string | undefined;
	const existing = mcpSessionId ? mcpConnections.get(mcpSessionId) : undefined;

	if (existing) {
		// A live MCP session must keep belonging to the bearer that opened it.
		if (existing.sessionId !== sessionId) {
			sendJson(res, 403, { error: "session/token mismatch" });
			return;
		}
		await existing.transport.handleRequest(req, res, body);
		return;
	}

	if (req.method !== "POST" || !isInitialize(body)) {
		sendJson(res, 400, {
			jsonrpc: "2.0",
			error: { code: -32000, message: "No valid MCP session; expected initialize." },
			id: null,
		});
		return;
	}

	// A pane holds one stable bearer token but re-`initialize`s on every claude
	// (re)launch, each minting a fresh mcp-session-id. Close any prior connection
	// for this PTY before opening the new one so old transports don't accumulate.
	closeMcpConnectionsForSession(sessionId);

	const server = new McpServer({ name: "sandcastle", version: app.getVersion() });
	registerTools(server, sessionId);
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: () => randomUUID(),
		enableJsonResponse: true,
		onsessioninitialized: (sid) => {
			mcpConnections.set(sid, { transport, server, sessionId });
		},
	});
	transport.onclose = () => {
		const sid = transport.sessionId;
		if (sid) mcpConnections.delete(sid);
	};
	await server.connect(transport);
	await transport.handleRequest(req, res, body);
};

const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
	try {
		const url = new URL(req.url ?? "/", "http://127.0.0.1");
		const token = bearerToken(req);
		const sessionId = token ? sessionByToken.get(token) : undefined;
		if (!sessionId) {
			sendJson(res, 401, { error: "unauthorized" });
			return;
		}

		if (url.pathname === "/mcp") {
			const body = req.method === "POST" ? await readJsonBody(req) : undefined;
			await handleMcp(req, res, sessionId, body);
			return;
		}

		if (url.pathname === "/hook/teleport" && req.method === "POST") {
			// The hook posts Claude Code's raw hook JSON. PostToolUse (EnterWorktree/
			// ExitWorktree) carries `cwd` plus `tool_response`; CwdChanged carries
			// `new_cwd`. For EnterWorktree `cwd` is the new worktree path; for
			// ExitWorktree `cwd` is the restored originalCwd and `tool_response`
			// is `{ action, worktreePath, ... }`.
			const body = (await readJsonBody(req)) as
				| {
						cwd?: string;
						new_cwd?: string;
						newCwd?: string;
						tool_response?: { worktreePath?: string; action?: "keep" | "remove" };
				  }
				| undefined;
			const toolResponse = body?.tool_response;
			const cwd = body?.cwd ?? body?.new_cwd ?? body?.newCwd ?? toolResponse?.worktreePath ?? "";
			// Re-group the calling terminal to its current cwd. On ExitWorktree this is
			// the restored originalCwd, so the tab moves back out of the worktree first.
			const out = await teleportToCwd(sessionId, String(cwd));
			// Surface the outcome — the hook discards our response, so without this a
			// failed teleport (relay down, path not in a project, etc.) is invisible.
			if (!out.ok) {
				console.warn(`[sandcastle] worktree hook: no teleport for "${cwd}": ${out.reason}`);
			} else {
				console.log(
					`[sandcastle] worktree hook: teleported to workspace ${out.workspaceId} (moved=${out.moved})`,
				);
			}
			// ExitWorktree({action:"remove"}) deleted the worktree on disk; mirror that
			// by deleting its Sandcastle workspace (after the teleport above moved the
			// tab out of it). Note: this only covers the mid-session ExitWorktree TOOL.
			// The session-exit "Keep/Remove worktree" dialog fires no PostToolUse hook,
			// so that removal path is not caught here.
			if (toolResponse?.action === "remove" && toolResponse.worktreePath) {
				await removeWorkspaceForPath(sessionId, toolResponse.worktreePath);
			}
			sendJson(res, 200, out);
			return;
		}

		sendJson(res, 404, { error: "not found" });
	} catch (err) {
		sendJson(res, 500, { error: String(err) });
	}
};

// ── Lifecycle + session registry (called from pty.ts / index.ts) ─────────────

export const registerMcpServer = async (): Promise<void> => {
	if (httpServer) return;
	await userEnvReady();
	assets = await writeInjectionAssets(join(app.getPath("userData"), "mcp"));
	// Restore the persisted sessionId -> token map BEFORE serving, so a reattached
	// shell's old bearer token resolves on its very first request after restart.
	await restoreTokens();

	if (!responseListenerBound) {
		responseListenerBound = true;
		ipcMain.on(
			"mcp:response",
			(_event, msg: { requestId: string; ok: boolean; data?: unknown; reason?: string }) => {
				const entry = pendingRenderer.get(msg.requestId);
				if (entry) {
					pendingRenderer.delete(msg.requestId);
					entry.resolve({ ok: msg.ok, data: msg.data, reason: msg.reason });
				}
			},
		);
	}

	await new Promise<void>((resolve) => {
		const server = createServer((req, res) => {
			void handleRequest(req, res);
		});
		// A bind failure must not hang startup (we `await` this before creating the
		// window). Resolve degraded — baseUrl stays null so registerSession() returns
		// {} and terminals still work, just without MCP integration. EADDRINUSE
		// (a stale instance, or the fixed port taken by something else) degrades the
		// same way rather than crashing; the single-instance lock already prevents
		// two of our own racing for the port.
		server.once("error", (err) => {
			console.error("[sandcastle] MCP server failed to start; integration disabled:", err);
			resolve();
		});
		// Loopback + PINNED port so the baked-in SANDCASTLE_MCP_URL survives restarts
		// (Phase 2). Bearer token is the real authorization guard.
		server.listen(MCP_PORT, "127.0.0.1", () => {
			baseUrl = `http://127.0.0.1:${MCP_PORT}`;
			httpServer = server;
			resolve();
		});
	});
};

export const disposeMcp = (): void => {
	for (const conn of mcpConnections.values()) {
		void conn.transport.close().catch(() => {});
		void conn.server.close().catch(() => {});
	}
	mcpConnections.clear();
	sessionsById.clear();
	sessionByToken.clear();
	pendingRenderer.clear();
	httpServer?.close();
	httpServer = null;
	baseUrl = null;
};

/**
 * Register a freshly-spawned PTY session and return the env + spawn args to
 * inject so a `claude` launched in it is wrapped (shell function) and connects
 * to this server. Returns empty env/args when the server isn't ready — the
 * terminal still works, just without MCP integration.
 */
export const registerSession = (
	sessionId: string,
	webContentsId: number,
	workspaceId: string | undefined,
	shell: string,
): { env: Record<string, string>; args: string[] } => {
	if (!baseUrl || !assets) return { env: {}, args: [] };
	// Reuse the token restored from disk for this (durable) sessionId if present,
	// so a reattached shell — whose env still carries the OLD baked-in token —
	// keeps authenticating. Otherwise mint a fresh one. Consume the restored entry
	// so a later genuine re-create of the same leaf gets a new token.
	const restored = restoredTokens.get(sessionId);
	const token = restored ?? randomBytes(24).toString("base64url");
	restoredTokens.delete(sessionId);
	sessionsById.set(sessionId, { sessionId, webContentsId, workspaceId, token });
	sessionByToken.set(token, sessionId);
	void persistTokens();
	const env = sessionEnv({ assets, sessionId, workspaceId, token, mcpBaseUrl: baseUrl });
	const shellInj = shellInjection(shell, assets);
	return { env: { ...env, ...shellInj.env }, args: shellInj.args };
};

const closeMcpConnectionsForSession = (sessionId: string): void => {
	for (const [sid, conn] of mcpConnections) {
		if (conn.sessionId === sessionId) {
			void conn.transport.close().catch(() => {});
			void conn.server.close().catch(() => {});
			mcpConnections.delete(sid);
		}
	}
};

export const unregisterSession = (sessionId: string): void => {
	const reg = sessionsById.get(sessionId);
	if (!reg) return;
	sessionsById.delete(sessionId);
	sessionByToken.delete(reg.token);
	// The pane was genuinely closed (killSession), so drop its now-defunct token
	// from the persisted map to avoid a stale entry lingering across restarts.
	restoredTokens.delete(sessionId);
	void persistTokens();
	closeMcpConnectionsForSession(sessionId);
	// Fail any in-flight renderer round-trips for this PTY immediately instead of
	// letting the tool call block until the timeout.
	for (const [requestId, entry] of pendingRenderer) {
		if (entry.sessionId === sessionId) {
			pendingRenderer.delete(requestId);
			entry.resolve({ ok: false, reason: "session ended" });
		}
	}
};
