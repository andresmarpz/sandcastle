# Sandcastle Architecture

> **Status:** v1 design. Frontend state-management layer is TBD (§16). Everything else is locked.

## §0. Summary

Sandcastle is a relay server between coding-agent subprocesses (Claude, Gemini, Codex, …) and one or more frontend clients (Electron, browser, mobile). Every supported agent speaks the **Agent Client Protocol (ACP)** over stdio. The Node.js server owns those subprocesses, hosts the workspace files, persists session history, and exposes a typed **Effect RPC API over WebSocket** to its frontends.

It is single-user by design (one person using their agent from multiple personal devices). Network access is gated by Tailscale, so we ship no app-level auth.

```
┌─────────────────┐    WebSocket (Effect RPC, our schema)        ┌──────────────────┐   stdio (ndJSON ACP)   ┌─────────────────┐
│   Frontend(s)   │ ◀── ACP types reused as payload types ──────▶│   Sandcastle     │ ◀────── pure ACP ────▶ │  Agent process  │
│ Electron / web  │     Server-owned envelopes (ServerEvent)      │   (Bun server)   │                        │ claude-agent-acp│
│ multiple per    │     Multi-client fan-out                      │                  │                        │ gemini-acp, …   │
│ user, same time │                                               │                  │                        │                 │
└─────────────────┘                                               └──────────────────┘                        └─────────────────┘
        │                                                                  │                                          │
        │ Knows: our WS RPC API. Never imports ACP packages.               │ Owns: SQLite, blobs, worktrees, fan-out,  │ Knows: ACP only.
        │ Renders: ACP-shaped content blocks, tool calls, plans,           │ normalization, agent process lifecycle.   │ Sees stdio as
        │ thinking traces.                                                 │ Files live here.                          │ its world.
```

The architectural inversion vs. tools that forward raw ACP frames (Zed, t3code's Cursor adapter): **the WebSocket speaks our RPC; ACP is server-internal.** ACP types are imported as payload types where they already model the right thing — content blocks, tool calls, plans, mode/model selections — but the wire vocabulary belongs to us.

---

## §1. Goals, non-goals, and v1 scope

### §1.1 Goals

- **Agent-agnostic UI.** Renderer is the same regardless of which ACP-speaking agent is behind a session.
- **Multi-client (single-user).** The same human, on multiple devices, sees the same state. Each client subscribes; events fan out from the server.
- **Reconnect & replay.** A frontend that drops its WebSocket can reconnect and resume the stream without losing events.
- **Persistence.** Sessions survive process restarts; history is durable in SQLite.
- **Server-owned features.** Files, agents, credentials, MCP config, tool execution all live on the server. Frontends are pure presentation.
- **Reuse, don't reinvent.** ACP already models content blocks, tool calls, plans, thinking traces, and mode/model selections. We import those types directly into the renderer.
- **Tailscale as transport.** No app-level auth. Tailnet membership is the access boundary.

### §1.2 Non-goals (explicit)

- Multi-user or multi-tenant. One human, one server, possibly multiple devices.
- App-level authentication or authorization. Tailscale handles network access.
- Encryption at rest. SQLite and blobs are plaintext on disk.
- Sandboxing the agent. The server runs the agent's tool calls with full server-machine privileges.
- Forwarding raw ACP frames over the WebSocket. The frontend never sees ACP method names, ACP session IDs, or `_meta`.
- Extending ACP discriminated unions (`SessionUpdate`, `ContentBlock`, etc.) with custom variants. Extensions ride in the server envelope.
- Promising feature uniformity across agents that don't all support the same ACP capabilities. Gaps surface to the UI.
- Concurrent in-flight prompts on one session. Sequential per session; if an agent supports prompt queueing we may use it transparently.

### §1.3 v1 scope (everything must work)

- **Workspaces:** add by absolute server-side path; `is_git` flag; soft-delete cascades sessions.
- **Sessions:** lazy creation on first prompt, with a per-session choice between "use the workspace path directly" or "create a worktree off an optional base branch." Soft delete tears down the worktree.
- **Chat:** send prompt, see streamed response, render text/thinking/tool-call/plan blocks in real time.
- **Tool-call renderer:** including nested (sub-agent) tool calls.
- **Server-handled `fs/*` and `terminal/*`:** the agent's filesystem and terminal calls execute on the server-machine; frontend sees only the resulting tool-call activity.
- **Cancellation:** cancel a turn; spawned subprocesses are killed.
- **Agent crash recovery:** server respawns and rebinds; UI sees a `ServerEvent`.
- **Long tool output:** tail in UI; full output retrievable via separate fetch.
- **Multi-client subscribe:** all connected devices see the same stream.
- **Reconnect & replay:** `sinceSeq` resumes without loss.
- **Blobs:** content-addressed storage at `~/.sandcastle/blobs/`, served over HTTP for inline rendering.
- **Configuration:** `~/.sandcastle/config.json` for global MCP servers and similar; SQLite for per-workspace MCP overrides.
- **Observability:** OpenTelemetry traces and structured JSON logs.

### §1.4 Deferred (not v1, but architecture leaves seams)

| Feature | Where it plugs in |
|---|---|
| App-level auth | WS upgrade middleware; `userId` column on tables |
| Encryption at rest | SQLCipher swap; blob encryption layer |
| Checkpoints | `git tag`/hidden refs at turn boundaries; `ServerEvent` for restore |
| Image attachments (compose UI) | Storage already in v1; add `POST /blobs/upload` and compose-UI |
| Plan editing | `ServerEvent` types + new RPCs (`plans.editItem`, etc.) |
| Diff RPCs | New `git.*` RPC group; worktree model already supports per-session branches |
| Permission/elicitation UI | `ServerEvent` types and `respondPermission`/`respondElicitation` RPCs ship in v1 architecture; UI deferred |
| Title generation via helper Claude | Hook on `turn-completed` for the first turn; updates via `ServerEvent` |
| Sandboxing tool execution | `WorkspacePolicy` interface in v1 (permissive); restrictive impl later |
| List-subscribe (live workspaces / sessions list across clients) | New stream RPCs alongside existing `*.list` |
| Server-side file picker | New RPC `workspaces.browseDir` |

---

## §2. Architectural commitments

Five rules. When in doubt, default to them.

1. **Frontend speaks our RPC, not ACP.** ACP is a server-internal implementation detail of the agent subprocesses.
2. **ACP types are imported as payload types where they fit.** `ContentBlock`, `ToolCall`, `ToolCallUpdate`, `Plan`, `SessionUpdate`, `PermissionOption`, `StopReason`, `SessionMode`, `ModelInfo`. Method names and lifecycle are ours.
3. **Never extend an ACP discriminated union** with custom variants. New events ride the server envelope (`{ kind: "server", event: ServerEvent }`).
4. **The server normalizes per-agent quirks** before frames leave. `_meta` heterogeneity, capability differences, vendor-specific tool annotations — none reaches the frontend in raw form.
5. **The subscribe stream is the spine.** Most state reaches the UI through one mechanism: a per-session subscribe stream that delivers a snapshot followed by live events, with monotonic sequence numbers and replay-since-seq semantics. Action RPCs trigger; the stream observes.

---

## §3. Actors

### §3.1 Frontend

- Initially Electron. The same code runs in a browser later (no `node:*` imports in shared code).
- Holds an Effect RPC client over WebSocket and a small HTTP client (for `GET /blobs/{hash}` and future blob uploads).
- Renders ACP types directly: `ContentBlock`, `ToolCall`, `Plan`, agent-thinking blocks. Imports them from `@sandcastle/acp` (which re-exports upstream ACP types with `_meta` stripped). The renderer never imports `@agentclientprotocol/sdk` or any other ACP SDK package directly.
- Holds local UI state: server picker, workspace selection, session-compose draft, scroll position.
- Knows nothing about ACP. The string "ACP" should not appear in frontend code.
- A **server picker** lets the user save multiple servers as `{ label, url }` and connect to one at a time. Connection state is per-client.

### §3.2 Server (Bun)

- One process per machine. Listens on a configurable host:port (default `127.0.0.1` if local; `0.0.0.0` for tailnet exposure).
- Owns ACP agent subprocesses (lazy spawn per session).
- Owns SQLite at `~/.sandcastle/sandcastle.db`.
- Owns blobs at `~/.sandcastle/blobs/{hash}`.
- Owns worktrees at `~/.sandcastle/worktrees/{workspaceId}/{sessionId}`.
- Owns global config at `~/.sandcastle/config.json`.
- Hosts a single HTTP+WebSocket server with these surfaces:
  - `WS  /rpc` — Effect RPC, the only application-control surface.
  - `GET /blobs/{hash}` — serves stored blobs.
  - `POST /blobs/upload` — multipart blob upload (deferred; storage layer is v1).

### §3.3 Agent subprocess

- An external ACP-speaking binary spawned by the server: `claude-agent-acp`, `gemini-acp`, future others.
- Speaks ndJSON ACP over stdio.
- Owns its own session IDs (`acp_*`), capabilities, authentication state.
- May die at any time; the server treats this as recoverable.

---

## §4. Wire formats

| Hop | Protocol | Encoding | Vocabulary |
|---|---|---|---|
| Frontend ↔ Server | Effect RPC over WebSocket | JSON | Our RPC schema (this document) |
| Server ↔ Agent | JSON-RPC 2.0 over stdio | newline-delimited JSON | ACP (https://agentclientprotocol.com) |
| Frontend ↔ Server (blobs) | HTTP | bytes | content-addressed |

Both Effect-RPC hops are independent transports with independent vocabularies. The server is a translator, not a passthrough.

WebSocket frames are JSON. Hard cap: 5 MB per frame. Anything larger (typically images) goes through the blob storage path and is referenced by URI in ACP `ImageContent.uri` form.

---

## §5. Domain model

### §5.1 Workspace

```
Workspace = {
  id:        WorkspaceId         // uuid
  label:    string                // user-facing name
  path:      AbsolutePath         // absolute path on the server filesystem
  isGit:    boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt: IsoDateTime | null   // soft delete
}
```

- The `path` is canonical and immutable. If the directory disappears, the server periodically detects the mismatch and emits a relocation prompt to clients.
- `isGit` is set when the workspace is added (we run `git rev-parse --is-inside-work-tree`). Diff/checkpoint features are gated on it. v1 does not auto-init or repair.
- Workspaces have many sessions (1:N). Workspace soft delete cascades to all child sessions.

### §5.2 Session

```
Session = {
  id:                 SessionId       // uuid
  workspaceId:        WorkspaceId
  agentKind:          AgentKind        // "claude" | "gemini" | …
  modelSelection:     ModelSelection   // ACP-typed
  worktreeMode:       WorktreeMode
  workdir:            AbsolutePath     // resolved at creation; never changes
  branch:             string | null    // current branch in the workdir
  title:              string
  capabilities:       NormalizedCapabilities | null   // null until first agent bind
  createdAt:          IsoDateTime
  updatedAt:          IsoDateTime
  deletedAt:          IsoDateTime | null
  lastServerSeq:      SequenceNumber
  // Internal, not exposed to frontend:
  currentAcpSessionId:    AcpSessionId | null
  currentAgentProcessId:  AgentProcessId | null
}

WorktreeMode =
  | { kind: "local" }
  | { kind: "worktree"; baseBranch: string | null; worktreeBranch: string }
```

- Sessions are created **lazily on first prompt** (§9). No DB row exists during the compose UI state.
- `workdir` is computed at creation:
  - `local` → `workspace.path`
  - `worktree` → `~/.sandcastle/worktrees/{workspaceId}/{sessionId}`
- `worktreeBranch` for worktree mode defaults to `sandcastle/{sessionIdShort}`; `baseBranch` defaults to the workspace's current `HEAD`.
- The session's workspace and worktree mode are **immutable** after creation.
- Sessions own their history via the `events` table (§6.2).

### §5.3 Turn

```
Turn = {
  id:        TurnId       // uuid
  sessionId: SessionId
  startedAt: IsoDateTime
  endedAt:   IsoDateTime | null
  status:    "running" | "completed" | "cancelled" | "failed"
  stopReason: StopReason | null   // ACP-typed when completed
}
```

- A turn = one user prompt + the agent's full response cycle (text, tool calls, plans, thinking, completion).
- Turns are sequential within a session.
- Turn boundaries are emitted as `ServerEvent`s in the subscribe stream (`turn-started`, `turn-completed`, `turn-cancelled`, `turn-failed`).

### §5.4 Worktree

A v1 worktree is a `git worktree add`-managed directory at `~/.sandcastle/worktrees/{workspaceId}/{sessionId}`. Its lifecycle:

- **Create:** during the first-prompt transaction (§10.1). `git worktree add -b sandcastle/{sessionIdShort} {worktreePath} {baseBranch}`.
- **Live:** session's agent process operates here as `cwd`.
- **Delete (on session soft-delete):** `git worktree remove --force {worktreePath}`. Branch `sandcastle/{sessionIdShort}` is left in place (cheap; could be reused on undelete; pruning is a future concern).
- Uncommitted changes in the worktree at delete time are lost. This is documented behavior.

### §5.5 Blob

```
Blob = {
  hash:      Sha256          // content address
  mime:      string
  size:      number
  createdAt: IsoDateTime
}
```

Stored on disk at `~/.sandcastle/blobs/{first2ofhash}/{hash}`. Referenced from session events when an inline content block exceeds an inline-size threshold (default 256 KB). Served at `GET /blobs/{hash}`.

---

## §6. Storage

### §6.1 Layout on disk

```
~/.sandcastle/
├── config.json               # global config (MCP, server token-or-not, etc.)
├── sandcastle.db             # SQLite
├── blobs/
│   └── ab/cdef1234…          # blob-store (sharded by first 2 chars)
└── worktrees/
    └── {workspaceId}/
        └── {sessionId}/      # `git worktree add` lives here
```

### §6.2 SQLite schema (sketch)

```sql
-- Workspaces ----------------------------------------------------------------
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  is_git      INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

-- Per-workspace MCP overrides ----------------------------------------------
CREATE TABLE workspace_mcp_overrides (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  config_json  TEXT NOT NULL,           -- normalized MCP server set for this workspace
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (workspace_id)
);

-- Sessions ------------------------------------------------------------------
CREATE TABLE sessions (
  id                       TEXT PRIMARY KEY,
  workspace_id             TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_kind               TEXT NOT NULL,
  model_selection_json     TEXT NOT NULL,
  worktree_mode_json       TEXT NOT NULL,           -- {"kind":"local"} | {"kind":"worktree","baseBranch":...}
  workdir                  TEXT NOT NULL,
  branch                   TEXT,
  title                    TEXT NOT NULL,
  capabilities_json        TEXT,                    -- last seen NormalizedCapabilities
  current_acp_session_id   TEXT,                    -- nullable; debug only
  last_server_seq          INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT
);
CREATE INDEX sessions_by_workspace ON sessions(workspace_id);
CREATE INDEX sessions_active        ON sessions(deleted_at) WHERE deleted_at IS NULL;

-- Turns ---------------------------------------------------------------------
CREATE TABLE turns (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  status      TEXT NOT NULL,                        -- running|completed|cancelled|failed
  stop_reason TEXT
);
CREATE INDEX turns_by_session ON turns(session_id, started_at);

-- Events: the per-session append-only log (the spine) -----------------------
CREATE TABLE events (
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  server_seq  INTEGER NOT NULL,
  kind        TEXT NOT NULL,                        -- 'agent' | 'server'
  payload     TEXT NOT NULL,                        -- JSON; SessionUpdate (normalized) | ServerEvent
  received_at TEXT NOT NULL,
  PRIMARY KEY (session_id, server_seq)
);

-- Blobs ---------------------------------------------------------------------
CREATE TABLE blobs (
  hash       TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Pending agent-issued requests awaiting human answer (UI deferred to v2,
-- but the table exists in v1 so the routing infrastructure persists state) -
CREATE TABLE pending_requests (
  request_id  TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                         -- 'permission' | 'elicitation'
  payload     TEXT NOT NULL,                         -- ACP request payload
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  resolved_at TEXT,
  outcome     TEXT
);
```

### §6.3 Migration policy

Raw SQL files in `apps/server/migrations/NNN_description.sql`, applied in order by a tiny in-house runner that records applied versions in a `_migrations` table. No ORM. Bun's native SQLite is the driver.

### §6.4 Transactional invariant

Inserting an event row and bumping `sessions.last_server_seq` happen in **one** SQLite transaction. Subscribers do not see `serverSeq = K` until that transaction commits. This is the basis for replay-after-reconnect.

### §6.5 In-memory hot path

Per active session, an in-memory ring buffer (default 1024 events) caches the tail. Subscribe reads:

- Live tail subscribers read from the ring as events are published.
- Reconnects with `sinceSeq` are served from the ring if recent enough; otherwise from SQLite.
- A snapshot subscribe (no `sinceSeq`) reads from SQLite, then attaches as a live tail subscriber.

The ring is rebuilt from SQLite when a session is rebound (new agent process).

### §6.6 Idle eviction

A session with no live subscribers and no in-flight turn after T minutes (default 10) tears down its agent subprocess and drops its ring buffer. SQLite is untouched. The next subscribe or prompt re-spawns the agent (ACP `session/load` if supported, otherwise `session/new` with replayed history).

### §6.7 Config file (`~/.sandcastle/config.json`)

```jsonc
{
  "listen": { "host": "0.0.0.0", "port": 7421 },
  "mcp":    { "global": [ /* MCP server entries */ ] },
  "agents": {
    "claude": { "binary": "claude-agent-acp", "defaultModel": "claude-sonnet-4-6" },
    "gemini": { "binary": "gemini-acp",       "defaultModel": "gemini-2.5-pro" }
  },
  "telemetry": { "otelEndpoint": null, "logs": "stderr-json" }
}
```

The file is read at startup and on SIGHUP. Writes from the UI happen via dedicated RPCs (deferred); for v1, edit by hand and restart.

---

## §7. Agent integration

### §7.1 Spawn lifecycle

```
                                       [first prompt arrives for sessionId]
                                                 │
                                                 ▼
                              +----------------- AgentRegistry.bind(sessionId) -----------------+
                              | 1. fork agent binary as child process                           |
                              |    • cwd = session.workdir                                       |
                              |    • env = curated (no host shell vars by default)               |
                              |    • shell: false on Unix; true on Windows                       |
                              | 2. wrap stdio with effect-acp client (ndJsonRpc serializer)      |
                              | 3. ACP `initialize` → store negotiated protocolVersion           |
                              | 4. ACP `authenticate` if required (§10.6)                        |
                              | 5. if session has stored ACP id and agent advertises             |
                              |    `loadSession`: ACP `session/load`                             |
                              |    else: ACP `session/new` + replay history into prompt context  |
                              | 6. capture and normalize agentCapabilities → store on session    |
                              | 7. emit ServerEvent `capabilities-changed` if changed             |
                              +-----------------------------------------------------------------+
```

### §7.2 ACP groups

Two `RpcGroup`s wired to the same stdio transport in opposite directions:

- `AgentRpcs` — outbound from server (server calls into the agent): `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/cancel`, `session/set_mode`, `session/set_model`.
- `ClientRpcs` — inbound to server (agent calls back): `fs/read_text_file`, `fs/write_text_file`, `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release`, `session/request_permission`, `elicitation/create`. Plus `session/update` (notification).

`ClientRpcs` are split into two routing decisions in the server:

- `fs/*` and `terminal/*` are answered **locally** by the server. They never reach the frontend. Their visible side-effects (the agent emits tool-call updates that mention "I read foo.ts" or "I ran npm test") arrive on the subscribe stream as normal `SessionUpdate`s.
- `session/request_permission` and `elicitation/create` are routed to the frontend(s) as server events (§10.5). UI to surface them is deferred; v1 routes infrastructure persists requests in `pending_requests` and auto-denies on timeout.

### §7.3 Capability normalization

Different agents advertise different `agentCapabilities`. We capture them on first bind, normalize to a stable shape, store, and surface to UI.

```ts
interface NormalizedCapabilities {
  prompt:  { image: boolean; audio: boolean; embeddedContext: boolean }
  session: { load: boolean; fork: boolean; resume: boolean; list: boolean }
  models:  { canSwitch: boolean; available: ModelInfo[] }      // ACP type
  modes:   { canSwitch: boolean; available: SessionMode[] }    // ACP type
  mcp:     { http: boolean; sse: boolean; stdio: boolean }
}
```

The UI uses this to hide controls the agent doesn't support (e.g. model picker if `models.canSwitch` is false). Default policy: surface gaps, don't fake. Capability-faking for specific features can be added case-by-case later.

### §7.4 `_meta` normalization

Every ACP message can carry `_meta`. Vendors use it heavily; treating `_meta` as opaque defeats agent-agnostic rendering. v1 strategy:

1. **Per-agent normalizer module.** Maps known `_meta` fields into typed positions on our normalized `SessionUpdate` / `ToolCall` types. Examples:
   - `_meta.claudeCode.toolName` → `toolCall.toolName` on the normalized update.
   - `_meta.claudeCode.parentToolUseId` → nests under parent for the renderer.
2. **Drop unknowns.** Anything not normalized is logged for telemetry and stripped before the message reaches the wire.
3. **Frontend-side ACP types omit `_meta`.** The contracts package declares `_meta` as never on its renderer types so callers can't accidentally rely on it.
4. **Server-injected metadata** (debug stamps, timing) goes in `ServerEvent`, not back into ACP types.

Adding a new agent kind = writing its normalizer module + declaring its capability mapping + plugging into the registry.

---

## §8. The subscribe stream contract

### §8.1 Envelope

```ts
type StreamItem =
  | { kind: "snapshot"; serverSeq: SequenceNumber; state: SessionSnapshot }
  | { kind: "agent";    serverSeq: SequenceNumber; receivedAt: IsoDateTime; update: SessionUpdate }
  | { kind: "server";   serverSeq: SequenceNumber; event: ServerEvent }

type SessionSnapshot = {
  session: SessionRecord                 // current session metadata
  capabilities: NormalizedCapabilities | null
  turns: TurnSummary[]                   // ordered, with completion status
  history: SessionUpdate[]               // ACP-typed, normalized, in order
  pendingRequests: PendingRequestSummary[]
}
```

### §8.2 Subscribe semantics

```ts
sessions.subscribe({
  sessionId: SessionId,
  sinceSeq?: SequenceNumber,
}) → Stream<StreamItem>
```

- **Without `sinceSeq`:** server emits exactly one `snapshot` frame, then attaches the subscriber as a live tail.
- **With `sinceSeq = K`:** server replays events with `serverSeq > K` from the ring buffer or SQLite (whichever has them), then attaches as live tail. If too much history has been pruned to fulfill the request, the server falls back to a `snapshot` instead.
- **Live tail:** new events are pushed in order with monotonic `serverSeq`.

### §8.3 Sequence numbers

`serverSeq` is monotonic per session, server-assigned, 64-bit. It survives process restarts (`sessions.last_server_seq` in SQLite). The transaction that inserts an event also bumps the counter atomically; only after commit is the event visible to subscribers (in-memory or via replay).

### §8.4 Multi-subscriber fan-out

Per session, the server holds a `Subscription` set. New events are pushed through one publish-point that:

1. Runs the SQLite event-insert transaction (with `serverSeq` assigned).
2. Pushes onto the in-memory ring.
3. Iterates subscribers and writes to each.

Each subscriber has its own bounded outbound queue. If a queue fills, the server kills that subscription with a typed error; the client reconnects with `sinceSeq` and replays.

### §8.5 Reconnection

The frontend tracks the highest `serverSeq` it has received per session. On WS reconnect, it issues `sessions.subscribe({ sessionId, sinceSeq })`. No events lost.

### §8.6 Server events (the non-ACP part of the stream)

```ts
type ServerEvent =
  | { type: "turn-started";          turnId: TurnId; promptedBy: ClientId }
  | { type: "turn-completed";        turnId: TurnId; stopReason: StopReason }
  | { type: "turn-cancelled";        turnId: TurnId }
  | { type: "turn-failed";           turnId: TurnId; error: NormalizedError }
  | { type: "permission-requested";  requestId: PermissionRequestId; payload: RequestPermissionRequest }
  | { type: "permission-resolved";   requestId: PermissionRequestId; outcome: PermissionOutcome }
  | { type: "elicitation-requested"; requestId: ElicitationRequestId; payload: ElicitationCreateRequest }
  | { type: "elicitation-resolved";  requestId: ElicitationRequestId; outcome: ElicitationOutcome }
  | { type: "auth-required";         flow: AuthFlow }                       // §10.6
  | { type: "auth-cleared";          }
  | { type: "agent-respawned";       previousAcpSessionId: AcpSessionId | null; newAcpSessionId: AcpSessionId; reason: RespawnReason }
  | { type: "capabilities-changed";  capabilities: NormalizedCapabilities }
  | { type: "session-meta-updated";  patch: SessionMetaPatch }              // title, etc.
  | { type: "workspace-relocation-required"; workspaceId: WorkspaceId }     // periodic check fired
```

Discipline reminder: anything that is not produced by the agent goes here, never as a new variant of `SessionUpdate`.

---

## §9. WS RPC surface (v1)

All methods are members of one `RpcGroup` (`SandcastleRpc`) under a single `/rpc` WebSocket. The frontend imports method names and payload schemas from `@sandcastle/contracts`. RPC payload and return types reference entity shapes from `@sandcastle/entities` (e.g. `SessionRecord`, `Workspace`) and ACP types from `@sandcastle/acp` (e.g. `ContentBlock`, `SessionUpdate`).

### §9.1 Workspace methods

```ts
workspaces.list() → Workspace[]                         // active only

workspaces.create({
  label: string,
  path: AbsolutePath,
}) → Workspace                                          // verifies path exists; sets is_git via probe

workspaces.rename({ workspaceId: WorkspaceId, label: string }) → void
workspaces.delete({ workspaceId: WorkspaceId }) → void  // soft; cascades sessions
```

### §9.2 Session methods

```ts
sessions.list({
  filter?: { workspaceId?: WorkspaceId },
}) → SessionRecord[]                                    // active only; polling-based in v1

sessions.subscribe({
  sessionId: SessionId,
  sinceSeq?: SequenceNumber,
}) → Stream<StreamItem>

sessions.sendPrompt({
  target:
    | { kind: "new"; config: NewSessionConfig }
    | { kind: "existing"; sessionId: SessionId },
  content: ContentBlock[],                              // ACP type
}) → { sessionId: SessionId; turnId: TurnId }
// Returns when the agent has accepted the prompt. Subsequent events arrive via subscribe.
// On `target: "new"`, this call is the transactional first-prompt operation (§10.1).

sessions.cancelTurn({
  sessionId: SessionId,
  turnId: TurnId,
}) → void

sessions.setMode({  sessionId: SessionId, mode: SessionModeId })  → void
sessions.setModel({ sessionId: SessionId, modelId: ModelId })     → void

sessions.rename({ sessionId: SessionId, title: string }) → void
sessions.delete({ sessionId: SessionId }) → void        // soft; tears down worktree

sessions.respondPermission({
  requestId: PermissionRequestId,
  optionId: PermissionOptionId,                         // ACP type
}) → void

sessions.respondElicitation({
  requestId: ElicitationRequestId,
  response: ElicitationResponse,                        // ACP type
}) → void

sessions.fetchToolOutput({                              // long-tool-output retrieval (§10.7)
  sessionId: SessionId,
  toolCallId: ToolCallId,
  range?: { offset: number; length: number },
}) → ToolOutputChunk
```

### §9.3 Server / introspection methods

```ts
server.listAgentKinds() → AgentKindInfo[]               // installed agents + default models
server.getCapabilities({ sessionId: SessionId }) → NormalizedCapabilities

client.declareFocus({                                   // for permission routing infrastructure
  sessionId: SessionId,
  focused: boolean,
}) → void
```

### §9.4 What is **not** exposed

For clarity, the frontend never sees these even though they exist server-side:

- ACP method names (`session/new`, `session/prompt`, …)
- ACP session IDs (`acp_*`)
- Agent process IDs
- `_meta` from agents
- `fs/*` or `terminal/*` request/response pairs (handled locally)

---

## §10. Communication flows

### §10.1 First prompt (transactional)

The user picks a workspace, configures session in the compose UI (agent kind, model, worktree mode and optional base branch), then sends. The server runs all session-creation steps **as one logical transaction**. If any step fails, every preceding side-effect is rolled back and the failure cause is returned to the caller.

```
Frontend                                            Server                                        Agent
   │                                                   │                                             │
   │ sessions.sendPrompt({                             │                                             │
   │   target: { kind:"new",                           │                                             │
   │     config: { workspaceId, agentKind,             │                                             │
   │              modelSelection, worktreeMode } },    │                                             │
   │   content: [...]                                  │                                             │
   │ })                                                │                                             │
   │ ────WS RPC──────────────────────────────────────▶ │                                             │
   │                                                   │ Begin transaction:                          │
   │                                                   │  T1. Validate workspace exists, is active   │
   │                                                   │  T2. Resolve workdir:                       │
   │                                                   │       local      → workspace.path           │
   │                                                   │       worktree   → derive path & branch     │
   │                                                   │  T3. If worktree: `git worktree add`        │
   │                                                   │       on failure → undo nothing yet;        │
   │                                                   │       still nothing else happened           │
   │                                                   │  T4. INSERT row into sessions               │
   │                                                   │       (deleted_at = NULL; capabilities=null)│
   │                                                   │  T5. Spawn agent process (cwd=workdir)      │
   │                                                   │       on failure → rollback T4, T3          │
   │                                                   │  T6. ACP initialize → capture caps          │
   │                                                   │       on failure → kill agent, rollback     │
   │                                                   │  T7. ACP authenticate (if needed)           │
   │                                                   │       on failure → rollback                 │
   │                                                   │  T8. ACP session/new → bind acpSessionId    │
   │                                                   │       on failure → rollback                 │
   │                                                   │  T9. INSERT turns row (status=running)      │
   │                                                   │ T10. ACP session/prompt(content)            │
   │                                                   │       on failure → rollback turn + session  │
   │                                                   │ Commit. Emit ServerEvent turn-started,      │
   │                                                   │ capabilities-changed.                       │
   │ ◀── { sessionId, turnId } ────────────────────────│                                             │
   │                                                   │                                             │
   │   (frontend now calls sessions.subscribe          │                                             │
   │    if not already subscribed; turn-started        │                                             │
   │    and subsequent agent updates flow there)       │                                             │
```

**Rollback rules.** Failure at any step undoes every preceding side-effect, in reverse order:

| Failed step | Undo |
|---|---|
| T3 (`git worktree add`) | nothing (no DB row, no process) |
| T5 (spawn) | `git worktree remove --force` if a worktree was created |
| T6/T7/T8 | kill the agent process; remove worktree; delete the session row |
| T10 (`session/prompt`) | mark the turn `failed`; kill the agent; remove worktree; delete the session row. (We do not leave a half-created session behind on first-prompt failures.) |

The RPC returns a typed error union (`workspace-not-found` | `worktree-create-failed` | `agent-spawn-failed` | `auth-required` | `agent-rejected-prompt` | …). The compose UI surfaces the cause; nothing is persisted.

### §10.2 Subsequent prompt (existing session)

```
Frontend                              Server                                Agent
   │                                     │                                    │
   │ sessions.sendPrompt({               │                                    │
   │   target: { kind:"existing",        │                                    │
   │     sessionId },                    │                                    │
   │   content: [...]                    │                                    │
   │ })                                  │                                    │
   │ ────WS RPC─────────────────────────▶│                                    │
   │                                     │ If agent process is not bound      │
   │                                     │ (idle-evicted or never bound),     │
   │                                     │ run the spawn lifecycle (§7.1).    │
   │                                     │                                    │
   │                                     │ Assign turnId. INSERT turns row.   │
   │                                     │ Emit ServerEvent turn-started.     │
   │ ◀── { sessionId, turnId } ──────────│                                    │
   │                                     │ ──── ACP session/prompt ──────────▶│
   │                                     │                                    │
   │                                     │   ◀── notify session/update ───────│ (streaming)
   │                                     │   normalize, persist, fan out      │
   │ ◀── stream {kind:"agent",...} ──────│                                    │
   │                                     │   ◀── result of session/prompt ────│
   │                                     │ Mark turn completed.               │
   │                                     │ Emit ServerEvent turn-completed.   │
   │ ◀── stream {kind:"server",...} ─────│                                    │
```

### §10.3 Agent → Frontend (streaming `session/update`)

The hot path. Each `session/update` from the agent:

1. Goes through the per-agent normalizer (§7.4): known `_meta` lifted, unknowns dropped.
2. Wrapped as `{ kind: "agent", update: SessionUpdate, receivedAt }`.
3. Persisted (with new `serverSeq`) in the events transaction.
4. Pushed onto the ring buffer.
5. Fanned out to all live subscribers.

Persistence happens **before** fan-out. Subscribers always see what's in storage; reconnect produces an identical view.

### §10.4 Server-handled agent calls (`fs/*`, `terminal/*`)

Some ACP requests originate from the agent and the server can answer without a human.

```
Agent                                  Server                                          Frontend(s)
   │                                      │                                                │
   │── fs/read_text_file ────────────────▶│                                                │
   │   { path }                           │ Resolve path against session.workdir (no       │
   │                                      │ traversal beyond workspace root by policy).    │
   │                                      │ Read the file.                                 │
   │◀── { content } ──────────────────────│                                                │
   │                                      │   (no message to frontend)                     │
   │                                      │                                                │
   │── terminal/create ──────────────────▶│ Spawn subprocess in session.workdir.           │
   │   { command, args }                  │ Stream stdout/stderr to the agent via          │
   │                                      │ terminal/output responses.                     │
   │                                      │                                                │
   │   The visible side effect: the agent later emits a SessionUpdate          ───────▶    │
   │   describing the tool call ("ran `npm test`, output: …") which              shown
   │   reaches the frontend through the normal subscribe stream.                 in chat
```

`WorkspacePolicy` (interface, permissive impl in v1) gates these. Stricter policies plug in here later.

### §10.5 Agent → User (permission, elicitation)

Permission and elicitation requests need a human answer. ACP defines them as agent → client requests; we route to a frontend.

```
Agent                                Server                                          Frontend(s)
   │                                    │                                                  │
   │── session/request_permission ─────▶│ Persist as pending_requests row.                 │
   │   { toolCall, options:[...] }      │ Emit ServerEvent permission-requested.           │
   │                                    │ ── stream {kind:"server",event:...} ──────────▶  │
   │                                    │                                                  │
   │                                    │ (v1: UI is deferred. With no responder,          │
   │                                    │  request is held and auto-denies on timeout      │
   │                                    │  T_perm = 60s default.)                          │
   │                                    │                                                  │
   │                                    │ When v2 ships UI:                                │
   │                                    │   ◀──── sessions.respondPermission ────────────  │
   │                                    │   { requestId, optionId }                        │
   │                                    │ Validate (request still pending).                │
   │                                    │ Mark resolved. Emit ServerEvent                  │
   │                                    │   permission-resolved.                           │
   │◀── ACP response ───────────────────│                                                  │
   │   { outcome: { selected: ... } }   │                                                  │
```

Routing is "first valid response wins among connected clients" — no leader election in v1 (single-user). `client.declareFocus` is plumbed but unused; v2 may use it to pick the responder.

Elicitation flows identically with `respondElicitation`.

### §10.6 Auth required

When an agent needs the user to log in (browser callback, terminal device code), the server emits an `auth-required` ServerEvent describing the flow. The frontend renders whatever UI corresponds (open-this-URL, enter-this-code, etc.). Once the agent's `authenticate` call resolves, the server emits `auth-cleared` and the original prompt continues.

```
ServerEvent.auth-required = {
  flow:
    | { type: "url"; url: string; expiresAt: IsoDateTime }
    | { type: "code"; code: string; verificationUri: string; expiresAt: IsoDateTime }
    | { type: "terminal"; instructions: string }
}
```

Auth state is stored per `agentKind` (single-user; no `userId` partitioning). Multiple sessions on the same agent kind share auth.

### §10.7 Long tool output

Some agents (Claude in particular) write long-running tool output to a file and reference it. The server respects this:

- `SessionUpdate`s describing tool-call progress include a small **tail** (last N KB of stdout, default 16 KB) for inline rendering.
- The full output is referenced by a server-side path. `sessions.fetchToolOutput` lets the UI fetch the full content (or a range) on demand. The frontend may show a "view full output" affordance in the renderer.

### §10.8 Cancellation

```
Frontend → sessions.cancelTurn({ sessionId, turnId })
Server:
  1. Send ACP `session/cancel` (notification) to the agent.
  2. Forcibly kill any subprocess the server spawned for this turn (terminal/* etc.).
  3. Mark the turn `cancelled`.
  4. Emit ServerEvent turn-cancelled.
The agent sees its tool calls fail and typically wraps up its turn shortly after. We do not wait.
```

### §10.9 Agent crash recovery

If the agent process dies unexpectedly:

1. Mark all in-flight turns for that process as `failed` with reason `agent-crashed`.
2. Emit `turn-failed` ServerEvents.
3. Detach `currentAgentProcessId` and `currentAcpSessionId`. Do not respawn eagerly.
4. The next `sendPrompt` for any affected session re-runs the spawn lifecycle (§7.1) and emits `agent-respawned`.

### §10.10 Workspace relocation

A periodic job (every 60s) checks each active workspace's `path`. If the directory has disappeared:

1. Emit `workspace-relocation-required` on every active session subscribed under that workspace.
2. Reject new prompts with a typed error until the user calls `workspaces.relocate` (deferred RPC; v1 surfaces error and instructs user to delete + recreate).

---

## §11. Multi-client behavior

### §11.1 Same state, different views

All connected clients of a session see the same `subscribe` stream — same `serverSeq` ordering, same payloads. Per-client local state (which session is selected, scroll position, compose draft) is independent and not synced. Compose state is purely local to the device that's typing.

### §11.2 Concurrent prompts on one session

Two devices both call `sendPrompt` for the same session simultaneously. Default policy: serialize. The second prompt waits in a server-side queue; it emits `turn-started` only after the first turn completes. UI on both devices sees the same turn boundaries on the subscribe stream.

If the agent advertises prompt queueing (`_meta.claudeCode.promptQueueing`), we may forward both to ACP and let the agent queue. The frontend cannot tell the difference.

### §11.3 Permission/elicitation responder

v1: first valid `respondPermission`/`respondElicitation` wins. Other devices receive a `permission-resolved` event indicating the question is answered. UI on losing devices simply dismisses.

### §11.4 Destructive operations

`sessions.delete`, `workspaces.delete`, and turn cancellation are immediate, no locks. We trust the user. The subscribe stream broadcasts the consequences to all devices.

---

## §12. Type discipline

Reminder rules. Most likely to be quietly broken; treat as load-bearing.

- `SessionUpdate`, `ContentBlock`, `ToolCall`, `ToolCallUpdate`, `Plan`, etc., are imported as-is from `@sandcastle/acp`. Never edited.
- Anything we want to add goes in `ServerEvent`.
- The renderer is allowed to switch on `update.sessionUpdate` (the ACP discriminator). It is not allowed to switch on extension fields we invented.
- Image content blocks: when the agent produces a base64 image, the server stores it as a blob and **rewrites** the `ContentBlock` to use the `uri` form (e.g. `https://relay/blobs/{hash}`) before persistence and fan-out. The renderer always sees a normal `ImageContent` and resolves URIs via HTTP. This stays inside the ACP `ContentBlock` schema; we are not extending it.
- The contracts package declares ACP-derived types with `_meta` removed (or marked `never`) so frontend code cannot depend on `_meta` from agents.

---

## §13. Effect RPC layering

### §13.1 Two RPC stacks, one library

Both transports use `@effect/rpc`:

- **WS RPC** (frontend ↔ server): one `RpcGroup` (`SandcastleRpc`); served via `RpcServer.toHttpEffectWebsocket`; clients use `Socket.layerWebSocket` + `RpcClient.makeProtocolSocket` with retry policy.
- **ACP RPC** (server ↔ agent): per-spawn `RpcClient`/`RpcServer` over stdio with `RpcSerialization.ndJsonRpc()`. Two `RpcGroup`s (`AgentRpcs`, `ClientRpcs`) wired to the same transport in opposite directions.

Both groups have generated TypeScript types from Effect's schema definitions; the frontend imports schemas, not implementations.

### §13.2 Service boundary

The cardinal rule: **WS RPC handlers do not call ACP RPC clients directly.** They call into `SessionService`, which owns:

- Lookup of the bound agent process (or spawn).
- Capability and `_meta` normalization.
- Persistence (events, turns, sessions).
- Subscribe-stream fan-out.
- Pending-request lifecycle.

`SessionService` in turn calls `AcpClient`. This separation keeps the two protocols independent at the type level even though they sit close in the codebase.

### §13.3 Layer composition (sketch)

```
HttpServer
  ├─ /rpc           → RpcServer.toHttpEffectWebsocket(SandcastleRpc)
  │                       ↑ provided by WsHandlerLayer
  │                       └ requires SessionService, WorkspaceService
  ├─ GET /blobs/{h} → BlobRoute  (uses BlobStore)
  └─ POST /blobs/upload (deferred)

SessionService
  ├─ AgentRegistry        // spawns and manages AcpClient instances
  ├─ Storage              // SQLite repo: events, sessions, turns, blobs, …
  ├─ FanOut               // per-session subscriber set + ring buffer
  ├─ MetaNormalizer       // per-agent-kind normalization
  └─ WorkspacePolicy      // permissive in v1; restrictive impls plug in later

WorkspaceService
  └─ Storage (workspaces, workspace_mcp_overrides)

Cross-cutting:
  ├─ TelemetryLayer       // OpenTelemetry tracer + structured-JSON logger
  └─ ConfigLayer          // ~/.sandcastle/config.json loader
```

A single `ManagedRuntime` per server process owns the layer graph; agent spawns add scoped sub-runtimes for each child.

---

## §14. Server config and startup

### §14.1 First run

If `~/.sandcastle` does not exist:

1. Create the directory tree (`config.json`, `sandcastle.db`, `blobs/`, `worktrees/`).
2. Write a default `config.json` with sensible defaults (host, port, no MCP).
3. Apply all SQL migrations (`apps/server/migrations/*.sql`).
4. Start listening.

### §14.2 Steady state

On boot:

1. Load `config.json`.
2. Open SQLite; apply pending migrations.
3. Reconcile worktrees: enumerate `~/.sandcastle/worktrees/*/*`; if a session row is missing or soft-deleted, the worktree is orphaned → log + best-effort `git worktree remove`.
4. Any session row whose `current_agent_process_id` was set is cleared (no agents survive a server restart).
5. Start HTTP+WS listener.

### §14.3 Graceful shutdown

On SIGINT/SIGTERM:

1. Stop accepting new WS connections.
2. Close all subscribe streams (clients reconnect against the new process when ready).
3. Send ACP `session/cancel` to every running agent; wait up to 5s.
4. Force-kill remaining agent processes.
5. Flush SQLite and exit.

---

## §15. Failure modes & invariants

### §15.1 Failure matrix

| Failure | What happens |
|---|---|
| First-prompt step fails | Full rollback (§10.1). No session row left behind. Caller gets a typed error. |
| Agent crashes mid-turn | All running turns for that process → `failed` with `agent-crashed`. `turn-failed` events emitted. Next prompt respawns and emits `agent-respawned`. |
| Frontend disconnects mid-turn | Turn continues; events accumulate in SQLite + ring. Reconnect with `sinceSeq` resumes seamlessly. |
| Server crashes | On restart, no live agents; SQLite is the source of truth; subscribers reconnect and snapshot. In-flight ACP turns at crash time are lost (their processes died with the server). |
| Slow subscriber | Server kills the subscription; client reconnects with `sinceSeq`. |
| `sinceSeq` older than ring | Server falls back to snapshot. |
| Workspace directory disappears | `workspace-relocation-required` event; new prompts rejected until relocated. |
| Worktree directory disappears | Treated as session corruption: emit a `turn-failed` if active; UI surfaces error; user must delete the session. |
| `_meta` carries an unknown field | Dropped silently (logged for telemetry). |
| Unknown ACP `SessionUpdate` variant from a newer agent | Forwarded as-is; renderer falls through to a generic block. |
| Agent doesn't support `setModel` | UI hides the control via capabilities; if invoked anyway, typed `CapabilityNotSupported` error. |

### §15.2 Invariants

- **Monotonic per-session ordering.** `serverSeq` strictly increases per session. No gaps in stored events.
- **Persistence before fan-out.** No subscriber sees an event that is not durable.
- **No ACP terms on the WS wire.** No method named `session/*`, no `acp_*` IDs, no `_meta` from agents.
- **Frontend never imports ACP SDK packages.** Only `@sandcastle/acp`, `@sandcastle/entities`, `@sandcastle/contracts`.
- **Workspace and worktree mode are immutable** after session creation.

---

## §16. Frontend (TBD: state management)

This section intentionally underspecified. The architecture **above** does not depend on which state-management approach we pick on the frontend; we are deferring that choice while gathering data.

What we know:

- The frontend uses the WS RPC client over a single connection, served by a runtime layer.
- The renderer imports ACP types directly from `@sandcastle/acp` and entity types from `@sandcastle/entities`. It switches on ACP discriminators (e.g. `update.sessionUpdate`) and renders accordingly.
- The subscribe stream is the source of truth for session state. The store reduces `StreamItem`s into a per-session view model.
- List RPCs (`workspaces.list`, `sessions.list`) are polled / refetched (TanStack Query is a strong candidate). Switching to live `*.subscribe` is purely additive when we want it.
- The compose state (which workspace, agent kind, model, worktree mode, draft text) is **per-device local state**. It does not sync.

What is TBD:

- Whether the frontend uses Effect at runtime (Streams + Layers) or stays plain TS.
- The store library: Zustand, Jotai, Effect Atom, raw signals, or something else.
- Optimistic update strategy for `sendPrompt` (show the user message immediately vs. wait for `turn-started`).
- How the renderer dispatches across `kind:"agent"` (ACP types) and `kind:"server"` (our ServerEvent) cleanly without duplicating logic.
- File-organization of UI features (per-session, per-tool-call, per-content-kind components).

We will revisit after building the v1 server end-to-end and prototyping at least one UI flow against it. Until then, this section is a placeholder, not a contract.

---

## §17. Future-feature seams (so we know v1 isn't blocking)

| Future feature | Architectural hook | Notes |
|---|---|---|
| App-level auth | WS upgrade middleware; `userId` on tables | v1 has no `userId` column; adding it later is a migration but a localized one. |
| Encryption at rest | Swap to SQLCipher; wrap blob FS reader/writer | Out of scope for v1; design tolerates it. |
| Checkpoints | `git tag refs/sandcastle/checkpoints/{turnId}` at turn start; `ServerEvent restore-completed`; new RPC `sessions.restoreCheckpoint` | Worktree model already supports per-session branches. |
| Image attachments (compose UI) | `POST /blobs/upload` HTTP route; compose UI references `blob:{hash}` in outgoing prompts; server replaces with ACP `ImageContent.uri` | Storage already in v1. |
| Plan editing | New `ServerEvent`s (`plan-item-edited`, etc.) and RPCs (`plans.editItem`, `plans.reorderItems`) | Plan rendering already works in v1; editing is purely additive. |
| Diff RPCs | New `git.*` RPC group: `git.workspaceStatus`, `git.diff`, `git.fileTree` | Worktree path on session record makes this a thin shell over libgit2/CLI. |
| Permission/elicitation UI | Already routed in v1 architecture; v2 adds `respondPermission`/`respondElicitation` UI surfaces | Backend infrastructure complete. |
| Title generation via helper Claude | `turn-completed` listener triggers a one-off helper turn; result emitted as `session-meta-updated` | First 50 chars suffices for v1. |
| Sub-process sandboxing | `WorkspacePolicy` interface | v1 impl is permissive. Restrictive policies plug in without API churn. |
| List-subscribe (live workspaces/sessions list) | New stream RPCs `workspaces.subscribe`, `sessions.listSubscribe` | v1 polls. |
| Server-side file picker | New RPC `workspaces.browseDir({ path }) → DirEntry[]` | Required for browser/mobile clients. |
| MCP UI | Existing MCP storage; new RPCs `mcp.listGlobal`, `mcp.upsertWorkspaceOverride`, etc. | Schema already in v1. |

---

## §18. Glossary

- **ACP** — Agent Client Protocol. JSON-RPC 2.0 schema for agent ↔ client communication over stdio.
- **Agent** — an external coding-assistant subprocess (Claude, Gemini, …) the server spawns and speaks ACP to.
- **Frontend** — Electron app initially; browser/mobile later. Speaks our WS RPC.
- **Server (Sandcastle server)** — Bun process that owns agents, files, SQLite, blobs, and the WS API.
- **Workspace** — a server-side directory (typically a git repo). Identified by `WorkspaceId`.
- **Session** — a conversation within a workspace. Identified by `SessionId`. Owns history. Lazily binds to an agent process.
- **Worktree** — a `git worktree`-managed checkout under `~/.sandcastle/worktrees/...`, used as the session's `cwd` when the user picked worktree mode.
- **Workdir** — the resolved directory the agent runs in (workspace path or worktree path).
- **Turn** — one user prompt + the agent's response cycle. Identified by `TurnId`.
- **Subscribe stream** — the per-session event stream the frontend uses to render. Snapshot + live, monotonically ordered, replayable.
- **`StreamItem`** — the envelope on the subscribe stream: `snapshot` | `agent` (ACP `SessionUpdate`) | `server` (`ServerEvent`).
- **`ServerEvent`** — our discriminated union for events ACP doesn't model.
- **Normalization** — server-side translation of per-agent quirks (`_meta`, capability differences) into a stable shape.
- **Capabilities** — what features an agent supports. Captured at `initialize`; stored on the session; surfaced to UI.
- **`serverSeq`** — monotonic per-session 64-bit counter for events.
- **Tailscale** — our network-level access boundary. There is no app-level auth in v1.
