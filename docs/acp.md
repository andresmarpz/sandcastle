# Agent Client Protocol (ACP) Reference

> Companion to `architecture.md`. The full surface of ACP as it exists in
> `@agentclientprotocol/sdk` v0.20.0, organized so you can use it to reason about
> what our WS RPC contract has to cover (and what it's allowed to omit). This is
> a working-reference document, not a tutorial. If something looks scant, the
> canonical answer lives in `node_modules/@agentclientprotocol/sdk/schema/schema.json`
> and `dist/acp.d.ts`.

The architectural principle (`architecture.md` §2) is that ACP is server-internal:
the frontend never sees ACP method names, ACP session IDs, or `_meta`. Our WS RPC
imports ACP **payload types** (content blocks, tool calls, plans, mode/model
selections) but owns the wire vocabulary. This document inventories ACP so we
can decide, for each piece, whether it (a) is reused as a payload type, (b) is
re-shaped behind one of our RPCs, (c) becomes a `ServerEvent`, or (d) is server-
internal and never crosses the WS boundary.

---

## §1. What ACP is

A standardized JSON-RPC 2.0 protocol — bidirectional, symmetric, transport-agnostic
— that lets a **Client** (editor / IDE / desktop UI) drive an **Agent** (Claude
Code, Gemini CLI, Codex, …) and lets the Agent call back into the Client (read a
file, run a terminal, request permission for a destructive op, ask the user a
form question).

- Spec: https://agentclientprotocol.com
- TS SDK: `@agentclientprotocol/sdk` (v0.20.0 at time of writing)
- Maintained by Zed Industries; canonical wire format = newline-delimited
  JSON-RPC 2.0 (one JSON object per line) over a bidirectional byte stream.

Two SDK halves:

| Class | Used by |
|---|---|
| `ClientSideConnection` | A client (editor / our relay) talking to an agent |
| `AgentSideConnection` | An agent (`claude-agent-acp`, etc.) talking to clients |

Both are constructed with `(otherSide => myImplementation, stream)` and expose
typed methods for the calls you initiate, while accepting an interface for the
calls the other side makes back.

For Sandcastle, **the relay server uses `ClientSideConnection`** — we are the
client of the agent. We implement an internal `Client` to receive `sessionUpdate`,
`requestPermission`, `fs/*`, `terminal/*`, etc.

---

## §2. Wire format

- **Encoding:** newline-delimited JSON (ndJSON). One JSON-RPC envelope per line.
  No BOMs, no embedded newlines (use `\n` escapes).
- **Framing:** the SDK ships `ndJsonStream(writable, readable)` which adapts a
  byte-stream pair (e.g. a child's `stdout`/`stdin`) into the SDK's
  `Stream<AnyMessage>` shape. Anything that can be wrapped in
  `{ writable: WritableStream<AnyMessage>, readable: ReadableStream<AnyMessage> }`
  speaks ACP — that's the lever we'll pull to put it on our internal stdio
  connection between Sandcastle and `claude-agent-acp`.
- **Stdout discipline (canonical agents).** `claude-agent-acp` redirects
  `console.log/info/warn/debug` to stderr in `src/index.ts` so nothing pollutes
  stdout. One stray byte breaks framing for the rest of the session — we have
  to match this discipline if we ever embed/spawn an ACP child.
- **JSON-RPC 2.0 semantics.** Standard `id`/`method`/`params`/`result`/`error`
  envelope. `id`-less notifications are fire-and-forget.

The server-internal Stream type:

```ts
type Stream = {
  writable: WritableStream<AnyMessage>
  readable: ReadableStream<AnyMessage>
}
```

`AnyMessage` is the SDK's union of request / response / notification frames; we
never construct one directly — the connection class assembles them from typed
method calls.

---

## §3. Initialize handshake

Always first. Establishes protocol version and exchanges capabilities.

### §3.1 `initialize` (Client → Agent, request)

```ts
type InitializeRequest = {
  _meta?:               JsonObject | null
  protocolVersion:      ProtocolVersion          // integer; current = 1
  clientInfo?:          Implementation           // { name, version, title? }
  clientCapabilities?:  ClientCapabilities
}

type InitializeResponse = {
  _meta?:             JsonObject | null
  protocolVersion:    ProtocolVersion            // negotiated; pick the lower
  agentInfo?:         Implementation
  agentCapabilities?: AgentCapabilities
  authMethods?:       AuthMethod[]
}
```

### §3.2 `ClientCapabilities`

What the client (we, the relay) can do for the agent:

```ts
type ClientCapabilities = {
  _meta?:            JsonObject | null

  // Filesystem callbacks the client implements
  fs?:               { readTextFile?: boolean; writeTextFile?: boolean }

  // Whether the client implements terminal/* methods
  terminal?:         boolean

  // Whether the client can render structured user prompts (forms / URLs)
  elicitation?:      ElicitationCapabilities    // { form?, url? }

  // Auth capabilities the client supports (e.g. PTY-based terminal logins)
  auth?:             AuthCapabilities           // { terminal?: boolean }

  // Next Edit Suggestions support (UNSTABLE)
  nes?:              ClientNesCapabilities      // { jump?, rename?, searchAndReplace? }

  // Document position encodings the client speaks (UTF-8 / UTF-16 / UTF-32)
  positionEncodings?: PositionEncodingKind[]
}
```

### §3.3 `AgentCapabilities`

What the agent advertises back. Sandcastle normalizes this into
`NormalizedCapabilities` (see `architecture.md` §7.3) before exposing it to the
frontend.

```ts
type AgentCapabilities = {
  _meta?:               JsonObject | null

  promptCapabilities?:  { image?: boolean; audio?: boolean; embeddedContext?: boolean }
  sessionCapabilities?: { listSessions?: object; resume?: object; fork?: object;
                          close?: object; additionalDirectories?: object }
  mcpCapabilities?:     { stdio?: boolean; http?: boolean; sse?: boolean }
  loadSession?:         boolean              // supports session/load
  auth?:                { logout?: object }  // agent can be logged out

  // UNSTABLE: NES support matrix
  nes?:                 NesCapabilities | null

  // UNSTABLE: provider config
  providers?:           ProvidersCapabilities | null

  // Agent's chosen text position encoding
  positionEncoding?:    PositionEncodingKind
}
```

### §3.4 `_meta` fields used in practice

`claude-agent-acp` puts plenty of vendor-specific data here:

- `_meta.claudeCode.toolName` — concrete tool that emitted a tool call (`Bash`,
  `Read`, `Edit`, …) so a UI can route per-tool rendering.
- `_meta.claudeCode.parentToolUseId` — sub-agent attribution (Task tool spawning
  child tool calls).
- `_meta.claudeCode.promptQueueing: true` (on `agentCapabilities._meta`) —
  client may submit a new `session/prompt` mid-stream and the agent will queue.
- `_meta.terminal_info / terminal_output / terminal_exit` — live Bash terminal
  streaming embedded in tool-call updates (when the client sets
  `clientCapabilities._meta.terminal_output: true`).
- `_meta.gateway` — gateway-auth method for proxied Anthropic API access.

Our normalizer (`apps/server/src/agents/normalizers/claude.ts`) is responsible
for lifting known `_meta.claudeCode.*` fields into typed positions on the
normalized `SessionUpdate` / `ToolCall` and dropping unknown fields before
anything reaches the WS wire.

---

## §4. Full method surface

Wire-level method names with `x-method` annotations from `schema.json`. This is
the canonical list. Note: in the TS SDK, method names use camelCase
(`newSession` → `session/new`). The methods live as instance methods on
`ClientSideConnection` / `AgentSideConnection`.

### §4.1 Client → Agent (we call these to drive the agent)

| Method (wire) | TS method | Stability | Notes |
|---|---|---|---|
| `initialize` | `initialize` | stable | Once per connection. |
| `authenticate` | `authenticate` | stable | Optional; only if `authMethods` non-empty. |
| `logout` | `unstable_logout` | unstable | Only if `agent.auth.logout` advertised. |
| `session/new` | `newSession` | stable | Creates session; agent issues sessionId. |
| `session/load` | `loadSession` | stable | Replays history as `session/update`s. |
| `session/resume` | `resumeSession` | stable | Restores without replay. |
| `session/list` | `listSessions` | stable | Enumerates persisted sessions. |
| `session/close` | `closeSession` | stable | Tears down session state. |
| `session/fork` | `unstable_forkSession` | unstable | Branch a session. |
| `session/prompt` | `prompt` | stable | Send user prompt; resolves on turn end. |
| `session/cancel` | `cancel` | stable | **Notification.** Fire-and-forget. |
| `session/set_mode` | `setSessionMode` | stable | Switch permission mode. |
| `session/set_model` | `unstable_setSessionModel` | unstable | Switch model. |
| `session/set_config_option` | `setSessionConfigOption` | stable | Generic mode/model/effort knob. |
| `nes/start` | `unstable_startNes` | unstable | Next-Edit-Suggestion lifecycle. |
| `nes/suggest` | `unstable_suggestNes` | unstable | |
| `nes/close` | `unstable_closeNes` | unstable | |
| `document/didOpen` | `unstable_didOpenDocument` | unstable | LSP-style document tracking. |
| `document/didChange` | `unstable_didChangeDocument` | unstable | |
| `document/didClose` | `unstable_didCloseDocument` | unstable | |
| `document/didSave` | `unstable_didSaveDocument` | unstable | |
| `document/didFocus` | `unstable_didFocusDocument` | unstable | |
| `providers/list` | (TS not yet exposed; via `extMethod`) | unstable | Lists model providers. |
| `providers/set` | (TS not yet exposed; via `extMethod`) | unstable | |
| `providers/disable` | (TS not yet exposed; via `extMethod`) | unstable | |
| `$/cancel_request` | (internal) | JSON-RPC | Per-request cancellation. |

### §4.2 Agent → Client (the relay must implement these)

| Method (wire) | Client method | Stability | Notes |
|---|---|---|---|
| `session/update` | `sessionUpdate` | stable | **Notification.** Streaming output. |
| `session/request_permission` | `requestPermission` | stable | Awaits user choice. |
| `fs/read_text_file` | `readTextFile` | stable | Optional (gated on capability). |
| `fs/write_text_file` | `writeTextFile` | stable | Optional. |
| `terminal/create` | `createTerminal` | stable | Optional. |
| `terminal/output` | `terminalOutput` | stable | |
| `terminal/wait_for_exit` | `waitForTerminalExit` | stable | |
| `terminal/kill` | `killTerminal` | stable | |
| `terminal/release` | `releaseTerminal` | stable | |
| `elicitation/create` | `unstable_createElicitation` | unstable | Form / URL prompt. |
| `elicitation/complete` | `unstable_completeElicitation` | unstable | **Notification.** |
| `nes/accept` | `unstable_acceptNes` | unstable | **Notification.** |
| `nes/reject` | `unstable_rejectNes` | unstable | **Notification.** |

Plus the extension escape hatches in both directions:

```ts
extMethod(method: string, params: JsonObject): Promise<JsonObject>     // request
extNotification(method: string, params: JsonObject): Promise<void>      // notification
```

### §4.3 No `startSession`

The user mentioned "startSession" — that name does not exist in the SDK. The
session-creation method is `newSession` (TS) / `session/new` (wire). Confirmed
by grep against `dist/acp.d.ts` and `schema.json`.

---

## §5. `session/new` — creating a session

```ts
type NewSessionRequest = {
  _meta?:       JsonObject | null
  cwd:          string                  // **absolute** path; required
  mcpServers:   McpServer[]              // see §13
}

type NewSessionResponse = {
  _meta?:           JsonObject | null
  sessionId:        SessionId            // agent-issued opaque string
  modes?:           SessionModeState     // available + current mode
  models?:          SessionModelState | null  // UNSTABLE
}
```

`cwd` is the session's working directory on whatever filesystem the agent has
access to. For us this is always a server-side absolute path (workspace path or
worktree path; `architecture.md` §5.2). The agent's `cwd` for shell tool calls
and the resolution root for `fs/*` are the same value.

`mcpServers` is forwarded to the agent at session creation; the agent merges
them into its MCP config (so MCP servers run **in the agent process**, not in
the relay). See §13.

---

## §6. `session/prompt` — running a turn

```ts
type PromptRequest = {
  _meta?:      JsonObject | null
  sessionId:   SessionId
  prompt:      ContentBlock[]            // user message; usually [{type:"text", text}]
  messageId?:  string                    // UNSTABLE — UUID; client-side dedupe
}

type PromptResponse = {
  _meta?:      JsonObject | null
  stopReason:  StopReason
}

type StopReason =
  | "end_turn"             // model decided it's done
  | "max_tokens"           // hit per-message token cap
  | "max_turn_requests"    // hit per-turn API call cap
  | "refusal"              // model refused
  | "cancelled"            // session/cancel was sent (or other interruption)
```

The promise resolves **when the turn ends**. Streaming output arrives between
the request and the response as `session/update` notifications (§7).

`session/cancel` is a notification that asks for a graceful stop:

```ts
type CancelNotification = {
  _meta?:    JsonObject | null
  sessionId: SessionId
}
```

The agent finishes any in-flight tool calls, flushes pending updates, and
resolves the prompt with `stopReason: "cancelled"`. We do not await
`session/cancel`.

### §6.1 `session/load` and replay

```ts
type LoadSessionRequest = {
  _meta?:      JsonObject | null
  sessionId:   SessionId
  cwd:         string                    // must match (or compatible with) original
  mcpServers:  McpServer[]
}

type LoadSessionResponse = {
  _meta?:    JsonObject | null
  modes?:    SessionModeState
  models?:   SessionModelState | null
}
```

When `loadSession` is called, the agent fires a stream of `session/update`s
recreating the historical transcript **before** the response resolves. There is
no flag on `update` saying "this is replay" — the client distinguishes by
ordering: replay updates always arrive before `loadSession`'s response promise
settles. After that, live updates flow normally.

Sandcastle plays this against our `events` table (`db.md` §4.7): on idle-
eviction respawn, prefer `session/load` if the agent advertises it; otherwise
`session/new` and replay our own history into the prompt context.

---

## §7. `session/update` — streaming output (the hot path)

The `Client.sessionUpdate(notification)` callback is how the agent tells us
about everything happening inside a turn. The wrapper:

```ts
type SessionNotification = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  update:    SessionUpdate
}
```

`SessionUpdate` is a discriminated union on `sessionUpdate` (note: the field is
named the same as the method — `update.sessionUpdate` is the discriminator).

| Variant | Payload (key fields) | What it is |
|---|---|---|
| `user_message_chunk` | `ContentChunk { content: ContentBlock; messageId? }` | A streamed user message (rare; mostly for replay). |
| `agent_message_chunk` | `ContentChunk` | Streamed model text. |
| `agent_thought_chunk` | `ContentChunk` | Streamed reasoning trace ("thinking"). |
| `tool_call` | `ToolCall` | A new tool invocation (first sighting). |
| `tool_call_update` | `ToolCallUpdate` | Status / content / output refinement on existing tool call. |
| `plan` | `Plan { entries: PlanEntry[] }` | TodoWrite-style plan snapshot (full re-emit each time). |
| `available_commands_update` | `AvailableCommandsUpdate { availableCommands: AvailableCommand[] }` | Slash-command catalog. |
| `current_mode_update` | `CurrentModeUpdate { currentModeId }` | Mode changed (e.g. ExitPlanMode). |
| `config_option_update` | `ConfigOptionUpdate { id, value }` | Per-session config knob changed. |
| `session_info_update` | `SessionInfoUpdate { title?, ... }` | Session metadata (e.g. derived title). |
| `usage_update` | `UsageUpdate { tokens?, totalCostUsd?, contextWindowSize?, ... }` | Token/cost tally during/after the turn. |

`ContentChunk`:

```ts
type ContentChunk = {
  _meta?:     JsonObject | null
  content:    ContentBlock
  messageId?: string                     // UNSTABLE; groups chunks of one logical message
}
```

In our model these are persisted as `events` rows (`db.md` §4.7) **after**
`_meta` normalization (§3.4). The renderer never sees raw `_meta`.

---

## §8. `ContentBlock` — the universal content array

Used in user prompts, agent messages, tool-call content, and embedded
resources. Discriminated on `type`.

```ts
type ContentBlock =
  | { type: "text";          _meta?; annotations?; text: string }
  | { type: "image";         _meta?; annotations?; data: string;     // base64
                                                  mimeType: string;
                                                  uri?: string }
  | { type: "audio";         _meta?; annotations?; data: string; mimeType: string }
  | { type: "resource_link"; _meta?; name: string; uri: string;
                              description?: string; title?: string;
                              size?: number; mimeType?: string;
                              annotations? }
  | { type: "resource";      _meta?; uri: string;
                              resource: TextResourceContents | BlobResourceContents }
```

Notes:

- `image` carries data inline (base64) by default; `uri` is permitted for cases
  where the image is hosted externally. Sandcastle's blob-rewrite path
  (`architecture.md` §12) replaces inline base64 with a `uri` form pointing at
  `https://relay/blobs/{hash}` **before** persistence. This stays inside the
  spec — we are not extending `ContentBlock`.
- `resource` (embedded) is MCP-shaped: a typed `resource` payload of either
  text or blob bytes.
- `resource_link` is a pointer; UIs should fetch on demand.
- Future `ContentBlock` variants from a newer agent are forwarded as-is and
  rendered through the renderer's `unknownBlock.tsx` fallback (`directories.md`
  §5).

---

## §9. Tool calls

### §9.1 Shapes

```ts
type ToolCall = {
  _meta?:        JsonObject | null
  toolCallId:    ToolCallId               // unique per session
  title:         string                   // human label
  kind?:         ToolKind
  status?:       ToolCallStatus
  content?:      ToolCallContent[]
  locations?:    ToolCallLocation[]       // [{ path, line? }, ...]
  rawInput?:     unknown                  // tool-specific JSON input
  rawOutput?:    unknown                  // tool-specific JSON output
}

type ToolCallUpdate = {
  _meta?:        JsonObject | null
  toolCallId:    ToolCallId
  status?:       ToolCallStatus | null
  title?:        string | null
  kind?:         ToolKind | null
  content?:      ToolCallContent[] | null
  locations?:    ToolCallLocation[] | null
  rawInput?:     unknown
  rawOutput?:    unknown
}

type ToolKind =
  | "read" | "edit" | "delete" | "move" | "search" | "execute"
  | "think" | "fetch" | "switch_mode" | "other"

type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed"

type ToolCallLocation = { _meta?; path: string; line?: number }
```

### §9.2 `ToolCallContent` variants

The richer rendering blocks specifically for tool-call output:

```ts
type ToolCallContent =
  | { type: "content";  _meta?; content: ContentBlock }      // wraps standard ContentBlock
  | { type: "diff";     _meta?; path: string;
                        oldText: string | null;              // null = file created
                        newText: string }
  | { type: "terminal"; _meta?; terminalId: TerminalId }     // live terminal reference
```

### §9.3 Lifecycle (canonical)

1. **First sighting** — `tool_call` update with `status: "pending"`, full
   `rawInput`, `kind`, `title`, possibly `locations`.
2. **Progress** — one or more `tool_call_update`s, status moves
   `pending → in_progress`, `content` accumulates (e.g. terminal output).
3. **Completion** — final `tool_call_update` with `status: "completed"` (or
   `"failed"`), `rawOutput` populated, content fully resolved.

Edits arrive a bit differently: `claude-agent-acp` emits the structured diff in
a `tool_call_update` produced from a SDK `PostToolUse` hook — i.e. the diff
shows up after the initial `tool_call`, not in it.

`TodoWrite` is special-cased: instead of a tool call, the agent emits a `plan`
update directly. We do not model `TodoWrite` as a tool call in our DB.

---

## §10. Permission flow

Triggered when the agent's tool-use policy needs human approval (e.g. `Bash`
with a non-pre-approved command, `Edit` outside `acceptEdits` mode).

```ts
type RequestPermissionRequest = {
  _meta?:      JsonObject | null
  sessionId:   SessionId
  toolCall:    ToolCallUpdate              // the call awaiting approval
  options:     PermissionOption[]
}

type PermissionOption = {
  _meta?:    JsonObject | null
  optionId:  PermissionOptionId            // echoed back in response
  kind:      "allow_once" | "allow_always" | "reject_once" | "reject_always"
  name:      string                        // "Always Allow Bash(npm test:*)"
}

type RequestPermissionResponse = {
  _meta?:   JsonObject | null
  outcome:  RequestPermissionOutcome
}

type RequestPermissionOutcome =
  | { outcome: "selected";  optionId: PermissionOptionId }
  | { outcome: "cancelled"                                }
```

Notes for our design:

- `name` is fully rendered by the agent (label includes the rule it would
  install: `"Always Allow Bash(npm test:*)"` or `"access to /tmp/foo"`). We
  store the labels verbatim in `pending_requests` / our future
  `permission_requests` table — that's what the user actually consented to.
- `ExitPlanMode` is special-cased in `claude-agent-acp`: its options correspond
  to **session-mode switches** rather than allow/deny. Treat permission options
  as opaque from the relay's perspective and forward labels to the UI as-is.
- ACP permissions are blocking — the tool call doesn't progress until the
  client responds. v1 architecture routes them as `permission-requested`
  ServerEvents and persists to `pending_requests`; the UI is deferred so v1
  auto-denies on a 60s timeout (`architecture.md` §10.5).

---

## §11. Elicitation (UNSTABLE)

Structured user-input prompt for cases where the agent needs more than a
permission decision (form data, user-typed values, URL flow).

```ts
type CreateElicitationRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  message:   string                         // "Enter your API key"
  mode:      "form" | "url"
  formData?: { schema: JsonSchema; scope: "session" | "request" | "tool_call" }
  url?:      string
  scope?:    "session" | "request"
}

type CreateElicitationResponse = {
  _meta?:  JsonObject | null
  action:  "accept" | "decline" | "cancel"
  result?: unknown                          // form payload or URL-flow result
}

// Notification for multi-step flows:
type CompleteElicitationNotification = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  result:    unknown
}
```

Sandcastle treats elicitation symmetrically with permissions: route to the
frontend as `elicitation-requested` ServerEvent, persist in `pending_requests`,
respond via `sessions.respondElicitation`. Same auto-deny-on-timeout policy in
v1 (UI deferred).

---

## §12. Authentication

ACP punts auth to the agent. The flow:

1. `initialize` returns `authMethods: AuthMethod[]`. Each method is
   `{ id, name, description?, _meta? }`.
2. If `newSession` returns an `auth_required` error, the client must call
   `authenticate({ methodId, _meta? })`. Once that resolves, the client retries
   `newSession`.
3. The client may proactively call `authenticate` ahead of any session work.

`claude-agent-acp` exposes three methods, conditional on
`clientCapabilities`:

| `methodId` | What it does |
|---|---|
| `claude-ai-login`, `console-login` | PTY-based terminal login (the agent expects the client to run `claude /login` in a real terminal). Available when `clientCapabilities.auth.terminal: true`. |
| `gateway` | Tunnels Anthropic API traffic through a custom proxy. Activated by passing `_meta.gateway: { baseUrl, headers }` in `authenticate`. The agent injects `ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_AUTH_TOKEN` into its child env. |

Sandcastle's auth model:

- Auth state is **per-agent-kind**, single-user (no `userId` partitioning) —
  multiple sessions on the same agent kind share auth (`architecture.md` §10.6).
- The relay handles `auth_required` and emits `auth-required` ServerEvents
  describing the flow to the UI (URL / device code / terminal instructions).
  When the underlying `authenticate` resolves, an `auth-cleared` event lets
  the original prompt continue.

`logout` is the unstable inverse — only available if
`agent.auth.logout` is advertised.

---

## §13. MCP server configuration

```ts
type McpServer =
  | { type: "http"; _meta?; name: string; url: string;
      headers: { name: string; value: string }[] }
  | { type: "sse";  _meta?; name: string; url: string;
      headers: { name: string; value: string }[] }
  | {                _meta?; name: string;          // stdio (default; no `type`)
      command: string;
      args:    string[];
      env:     { name: string; value: string }[] }
```

MCP servers are passed at `session/new` (and again at `session/load`). The
agent merges them into its SDK MCP config — **MCP servers run in the agent
process**, with the agent's environment variables. Reconfiguring MCP requires
recreating the session (`computeSessionFingerprint` in `claude-agent-acp` keys
on the MCP config; mismatched fingerprint forces a fresh `session/new`).

Sandcastle layering (`architecture.md` §6.7):

- **Global MCP** lives in `~/.sandcastle/config.json`.
- **Per-workspace MCP overrides** in the `workspace_mcp_overrides` table.
- The relay merges them at session-creation time and sends the final
  `McpServer[]` to the agent.

---

## §14. Plans

```ts
type Plan = {
  _meta?:  JsonObject | null
  entries: PlanEntry[]
}

type PlanEntry = {
  _meta?:    JsonObject | null
  content:   string                          // "Analyze codebase"
  status:    "pending" | "in_progress" | "completed"
  priority?: "high" | "medium" | "low"
}
```

Plans arrive as `session/update { sessionUpdate: "plan", entries }`. Each plan
update is a **complete snapshot** — items don't update individually, the agent
re-emits the full list. Our DB stores one row per snapshot
(`db.md` §4.6).

---

## §15. Modes and models

### §15.1 Session mode

```ts
type SessionMode = {
  _meta?:       JsonObject | null
  id:           SessionModeId
  name:         string
  description?: string
}

type SessionModeState = {
  _meta?:         JsonObject | null
  availableModes: SessionMode[]
  currentModeId:  SessionModeId
}

// Wire: session/set_mode (stable)
type SetSessionModeRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  modeId:    SessionModeId
}
```

`claude-agent-acp` exposes (`acp-agent.ts:1844-1878`):

| Mode | Behavior |
|---|---|
| `default` | Prompt for risky operations |
| `acceptEdits` | Auto-accept file edits |
| `plan` | Read-only planning mode, no tool execution |
| `auto` | Model classifier auto-approves/denies |
| `dontAsk` | Deny anything not pre-approved |
| `bypassPermissions` | Skip all permission checks (disabled when running as root unless `IS_SANDBOX=1`) |

We store the current mode on `sessions.mode` and snapshot the per-turn mode on
`turns.mode` so a future `session/load` replay can recreate context.

### §15.2 Session model (UNSTABLE)

```ts
type ModelInfo = {
  _meta?:       JsonObject | null
  modelId:      ModelId
  name:         string
  description?: string
}

type SessionModelState = {
  _meta?:          JsonObject | null
  availableModels: ModelInfo[]
  currentModelId:  ModelId
}

// Wire: session/set_model (unstable)
type SetSessionModelRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  modelId:   ModelId
}
```

Same dual-storage pattern: `sessions.model` for current, `turns.model` for the
snapshot at turn time.

### §15.3 Generic config option

```ts
// Wire: session/set_config_option (stable)
type SetSessionConfigOptionRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  id:        string                          // "mode" | "model" | "effort" | ...
  value:     unknown
}
```

A generic knob; in practice the typed `set_mode` / `set_model` are preferred,
and `set_config_option` covers extension knobs (Claude's `effort` levels,
etc.).

---

## §16. Filesystem callbacks (Agent → Client)

Optional. Gated on `clientCapabilities.fs.{readTextFile,writeTextFile}: true`.

```ts
type ReadTextFileRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  path:      string                          // absolute
  line?:     number                          // 1-based start line
  limit?:    number                          // max lines to read
}

type ReadTextFileResponse = { _meta?; content: string }

type WriteTextFileRequest = {
  _meta?:    JsonObject | null
  sessionId: SessionId
  path:      string
  content:   string
}

type WriteTextFileResponse = { _meta?: JsonObject | null }
```

Sandcastle handles these locally on the server (`architecture.md` §10.4) —
they never reach the WS frontend. Path resolution is gated by
`WorkspacePolicy` (permissive in v1).

---

## §17. Terminal callbacks (Agent → Client)

Optional. Gated on `clientCapabilities.terminal: true`. All five methods need
to be implemented together; the agent assumes the full lifecycle.

```ts
type CreateTerminalRequest = {
  _meta?:           JsonObject | null
  sessionId:        SessionId
  command:          string                   // e.g. "/bin/bash"
  args?:            string[]
  cwd?:             string
  env?:             { name: string; value: string }[]
  outputByteLimit?: number                   // tail-buffer cap
}

type CreateTerminalResponse = {
  _meta?:     JsonObject | null
  terminalId: TerminalId
}

type TerminalOutputRequest = {
  _meta?:     JsonObject | null
  sessionId:  SessionId
  terminalId: TerminalId
}

type TerminalOutputResponse = {
  _meta?:     JsonObject | null
  output:     string                         // accumulated stdout/stderr
  truncated?: boolean
  exitStatus?: TerminalExitStatus | null
}

type WaitForTerminalExitRequest = {
  _meta?:     JsonObject | null
  sessionId:  SessionId
  terminalId: TerminalId
}

type WaitForTerminalExitResponse = {
  _meta?:      JsonObject | null
  exitStatus:  TerminalExitStatus
}

type KillTerminalRequest = {
  _meta?:     JsonObject | null
  sessionId:  SessionId
  terminalId: TerminalId
}

type ReleaseTerminalRequest = {
  _meta?:     JsonObject | null
  sessionId:  SessionId
  terminalId: TerminalId
}

type TerminalExitStatus = {
  _meta?:    JsonObject | null
  exitCode?: number | null
  signal?:   string | null
}
```

Sandcastle handles terminals server-side via the same `WorkspacePolicy`-gated
handlers (`architecture.md` §10.4). The agent's own tool-call updates surface
the visible side-effects (`Bash` ran, here's the output) through the normal
subscribe stream — the frontend never sees raw `terminal/*` traffic.

Alternative path: `claude-agent-acp` will embed live Bash output **inside**
tool-call content using `ToolCallContent { type: "terminal", terminalId }` plus
`_meta.terminal_info / terminal_output / terminal_exit` updates, when the
client advertises `_meta.terminal_output: true`. This avoids a separate
terminal lifecycle for the simple Bash case. Our normalizer can opt into
either model.

---

## §18. NES — Next Edit Suggestions (UNSTABLE)

Out-of-scope for v1. The full surface, for completeness:

Client → Agent:

```ts
unstable_startNes(StartNesRequest)   → StartNesResponse
unstable_suggestNes(SuggestNesRequest) → SuggestNesResponse
unstable_closeNes(CloseNesRequest)   → CloseNesResponse
```

Agent → Client (notifications):

```ts
unstable_acceptNes(AcceptNesNotification)
unstable_rejectNes(RejectNesNotification)
```

Capability gate: `agentCapabilities.nes` (matrix of supported feature flags) +
`clientCapabilities.nes` (`{ jump?, rename?, searchAndReplace? }`). We will not
expose any of this in v1.

## §19. Document tracking (UNSTABLE)

Also out-of-scope for v1. LSP-style notifications letting the client tell the
agent what files are open / focused / changed in the editor:

```ts
unstable_didOpenDocument(DidOpenDocumentNotification)
unstable_didChangeDocument(DidChangeDocumentNotification)
unstable_didCloseDocument(DidCloseDocumentNotification)
unstable_didSaveDocument(DidSaveDocumentNotification)
unstable_didFocusDocument(DidFocusDocumentNotification)
```

Useful for an editor-integrated client (Zed, VSCode). For Sandcastle's
chat-shaped UI we don't need it.

## §20. Provider configuration (UNSTABLE)

Schema-only at present (no TS surface in v0.20.0; goes via `extMethod`):

```
providers/list   → list configured model providers
providers/set    → upsert provider config
providers/disable → disable a provider
```

`agentCapabilities.providers` advertises support. Out-of-scope for v1.

---

## §21. Slash commands

Notification: `available_commands_update { availableCommands: AvailableCommand[] }`.

```ts
type AvailableCommand = {
  _meta?:      JsonObject | null
  name:        string                        // "compact", "config", ...
  description: string
  input?:      AvailableCommandInput | null  // hint for arg-typing UX
}
```

`claude-agent-acp` translates this from `session.query.supportedCommands()` and
re-emits when the agent's command set changes. MCP-defined commands are
re-shaped on the wire: client types `/mcp:server:command`, agent sees
`/server:command (MCP)`.

---

## §22. Extension escape hatches

ACP is forward-compatible by design through two mechanisms.

### §22.1 `_meta` (every message)

```ts
type AnyAcpMessage = { _meta?: { [key: string]: unknown } | null; ... }
```

Vendor-namespaced keys (`_meta.claudeCode.*`, `_meta.sandcastle.*`). Used by
`claude-agent-acp` for tool-name routing, parent-tool attribution, terminal
streaming, and gateway-auth payloads. Sandcastle's normalizer (§3.4) lifts
known `_meta.claudeCode.*` keys into typed positions on our normalized types
and drops unknowns.

### §22.2 `extMethod` / `extNotification`

```ts
extMethod(method: string, params: JsonObject): Promise<JsonObject>      // request
extNotification(method: string, params: JsonObject): Promise<void>       // notification
```

Available on both `ClientSideConnection` and `AgentSideConnection`, plus the
matching client / agent interfaces. Method names must be vendor-prefixed (e.g.
`com.anthropic.claudeCode/customThing`) to avoid collision with future stable
methods.

We do not currently use either. If we ever need an extension we control, we
prefer `extMethod` over a `_meta` field — typed payload, explicit handler.

---

## §23. Stop reasons and errors

`PromptResponse.stopReason` has five values (§6). Beyond that, ACP errors are
JSON-RPC errors:

```ts
type RequestError = {
  code:    number          // JSON-RPC numeric code
  message: string
  data?:   unknown
}
```

Standard JSON-RPC codes plus ACP-specific values:

| Code | Meaning |
|---|---|
| `-32700` | Parse error |
| `-32600` | Invalid request |
| `-32601` | Method not found |
| `-32602` | Invalid params |
| `-32603` | Internal error |
| `-32000` … `-32099` | Implementation-defined (auth required, capability missing, etc.) |

`auth_required` is emitted on `newSession` when the agent has no valid auth;
the client responds by calling `authenticate` and retrying.

In Sandcastle, ACP errors are caught at the `AcpClient` boundary and either
re-thrown as typed RPC errors (`agent-rejected-prompt`, `auth-required`,
`capability-not-supported`, …) or recorded against the in-flight turn as
`turn-failed { error }`.

---

## §24. Connection lifecycle helpers

Both connection classes expose:

```ts
class ClientSideConnection /* or AgentSideConnection */ {
  signal: AbortSignal      // fires on connection close
  closed: Promise<void>    // resolves on connection close
}
```

Used to tear down per-connection resources cleanly. In Sandcastle, we wire
these into the agent's scoped runtime so all in-flight work (turn promises,
permission requests) is cancelled on close.

---

## §25. Mapping ACP to our WS RPC contract

This section is the practical payoff: which ACP types we reuse as payload
types in `@sandcastle/contracts`, which we reshape, which become
`ServerEvent`s, and which never cross our WS boundary.

### §25.1 Reused as payload types (imported from `@sandcastle/acp`)

These types are stable, widely used, and exactly what we want to render. We
import them as-is (with `_meta` stripped at the type level).

| ACP type | Our use |
|---|---|
| `ContentBlock` | `sessions.sendPrompt({ content: ContentBlock[] })`; nested in stream items via `SessionUpdate` |
| `ToolCall`, `ToolCallUpdate`, `ToolCallContent`, `ToolKind`, `ToolCallStatus`, `ToolCallLocation` | rendered directly by `blocks/ToolCallBlock.tsx` |
| `Plan`, `PlanEntry` | rendered by `blocks/PlanBlock.tsx` |
| `SessionUpdate` (full union) | `StreamItem { kind: "agent"; update: SessionUpdate }` |
| `SessionMode`, `SessionModeId`, `SessionModeState` | `Session.modes`, model picker UI |
| `ModelInfo`, `ModelId`, `SessionModelState` | `Session.models`, mode picker UI |
| `StopReason` | `ServerEvent.turn-completed { stopReason }` |
| `PermissionOption`, `PermissionOptionId`, `PermissionOptionKind`, `RequestPermissionOutcome` | `ServerEvent.permission-requested`; `sessions.respondPermission` |
| `RequestPermissionRequest` | embedded in the `permission-requested` ServerEvent |
| `ElicitationCreateRequest`, `ElicitationCreateResponse` | embedded in `elicitation-*` ServerEvents (deferred UI) |

### §25.2 Reshaped behind our RPCs

Where ACP semantics don't fit the architectural commitments
(`architecture.md` §2), we wrap or replace.

| ACP wire | Our equivalent |
|---|---|
| `session/new` | `sessions.sendPrompt({ target: { kind: "new", config } })` — first prompt is transactional (`architecture.md` §10.1). Sessions are lazy. |
| `session/prompt` | `sessions.sendPrompt({ target: { kind: "existing", sessionId } })` |
| `session/cancel` | `sessions.cancelTurn({ sessionId, turnId })` — server forwards as the ACP notification |
| `session/set_mode` | `sessions.setMode({ sessionId, mode })` |
| `session/set_model` | `sessions.setModel({ sessionId, modelId })` |
| `session/load` | server-internal; UI never calls it. We use it (or `session/new` + replay) on agent respawn. |
| `session/list` | not exposed; sessions are listed via our DB (`sessions.list`). |
| `session/close` | server-internal idle-eviction; UI calls `sessions.delete` for soft delete. |
| `session/fork` | not exposed in v1. |
| `authenticate` | server-internal; UI sees `auth-required` ServerEvent and a future RPC to drive the flow. |
| `initialize` | server-internal; runs once per agent spawn. UI sees `NormalizedCapabilities` via `server.getCapabilities` or the snapshot. |

### §25.3 Become `ServerEvent`s (non-ACP, our envelope)

Every event the relay needs to surface that ACP doesn't model goes here.
Discriminator on `type`:

- `turn-started`, `turn-completed`, `turn-cancelled`, `turn-failed`
- `permission-requested`, `permission-resolved`
- `elicitation-requested`, `elicitation-resolved`
- `auth-required`, `auth-cleared`
- `agent-respawned`, `capabilities-changed`
- `session-meta-updated`
- `workspace-relocation-required`

Defined in `packages/contracts/src/stream/events.ts`. The architectural rule
(`architecture.md` §2) is **never extend ACP unions** — anything that isn't an
ACP `SessionUpdate` rides here.

### §25.4 Never cross the WS boundary

| ACP wire | Why hidden |
|---|---|
| `fs/read_text_file`, `fs/write_text_file` | Server handles locally on workspace path. Visible only via tool-call updates. |
| `terminal/*` | Same — server-side execution only. |
| `_meta.*` | Vendor noise; normalized at agent boundary. |
| ACP session IDs (`acp_*`) | Mapped to our `SessionId`. |
| `available_commands_update` | TBD — currently no slash-command UI in v1. May surface as a `ServerEvent` later. |
| NES, document/*, providers/* | Out of scope for v1. |

### §25.5 What our normalizer must do per agent

The per-agent normalizer (`apps/server/src/agents/normalizers/<kind>.ts`) is
the gatekeeper between raw ACP and our renderer types. Required transformations:

1. **`_meta` lifting.** Move known vendor keys to typed positions (see §3.4).
   Drop unknowns and log to telemetry.
2. **Image rewrite.** When a `ContentBlock { type: "image", data: <base64> }`
   appears, write to blob store, replace with
   `{ type: "image", uri: "https://relay/blobs/{hash}", mimeType }`. Persist
   the rewritten form.
3. **Capability normalization.** Map raw `agentCapabilities` →
   `NormalizedCapabilities` (see `architecture.md` §7.3). Surface gaps to UI;
   don't fake.
4. **Terminal embedding choice.** Decide whether to advertise
   `_meta.terminal_output: true` to the agent (inline terminal blocks) or
   implement the full `terminal/*` lifecycle (separate terminal model). v1
   recommendation: inline; simpler renderer, no extra state.

Adding a new agent kind = writing a new normalizer module + capability mapping
+ registry entry. No changes elsewhere.

---

## §26. Cross-references

| Topic | Where |
|---|---|
| Architectural commitments | `docs/architecture.md` §2 |
| Subscribe stream contract | `docs/architecture.md` §8 |
| WS RPC method declarations | `packages/contracts/src/rpc/*.ts` |
| `StreamItem` envelope | `packages/contracts/src/stream/item.ts` |
| `ServerEvent` union | `packages/contracts/src/stream/events.ts` |
| ACP type re-exports | `packages/acp/src/*.ts` |
| Agent normalizers | `apps/server/src/agents/normalizers/*.ts` |
| First-prompt transaction | `apps/server/src/sessions/firstPrompt.ts` |
| DB tables for ACP entities | `docs/db.md` §4 |
| Canonical schema | `node_modules/@agentclientprotocol/sdk/schema/schema.json` |
| TS definitions | `node_modules/@agentclientprotocol/sdk/dist/acp.d.ts` |

---

## §27. Glossary

- **Client (ACP sense)** — the half that drives the agent. In Sandcastle,
  *the relay server* is the client. Our frontend is not an ACP client.
- **Agent (ACP sense)** — the LLM-driven coding assistant subprocess
  (`claude-agent-acp`, `gemini-acp`, …).
- **Session (ACP sense)** — a conversation owned by the agent, identified by
  the agent-issued `sessionId`. Distinct from our `SessionRecord` (which has
  a relay-issued ID and may bind/unbind multiple ACP session IDs over its
  lifetime as agents respawn).
- **Turn (ACP-ish)** — not a first-class ACP entity; bounded by
  `session/prompt` request and the matching `result`. Sandcastle promotes
  this to a first-class table (`turns`).
- **`session/update`** — the streaming-output notification. The hot path.
- **`SessionUpdate`** — the discriminated union carried by `session/update`.
- **Stable / Unstable** — SDK-level marker. Stable methods are part of the
  contract; unstable are subject to change. We use `unstable_*` only behind
  capability checks.
- **`_meta`** — vendor-extension JSON object on every message. Treated as
  opaque outside the normalizer.
- **`extMethod` / `extNotification`** — typed extension hooks for vendor
  methods. Preferred over `_meta` when a typed handler is desired.
