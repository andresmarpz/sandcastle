# Client–Server ACP Architecture

## 0. Goal

Build a thin Node.js **relay server** that owns a child `claude-agent-acp` process per user/session and exposes its stdio over **WebSocket as newline-delimited JSON-RPC frames**, so that an arbitrary remote UI (initially Electron, later possibly browser/mobile) can drive the agent without having to spawn the binary itself.

```
┌──────────────┐    WebSocket (ndjson frames)    ┌──────────────────┐    stdio (ndjson)    ┌──────────────────┐
│              │ ◀── ACP wire format, verbatim ──▶│                  │ ◀── ACP wire ──────▶ │                  │
│   Electron   │                                  │  Node relay      │                      │ claude-agent-acp │
│  UI (Client) │                                  │  (this project)  │                      │   (Agent)        │
│              │                                  │                  │                      │                  │
└──────────────┘                                  └──────────────────┘                      └──────────────────┘
                                                          │                                         │
                                                          │ keeps state about:                      │ shells out to
                                                          │  • per-session child proc               ▼
                                                          │  • auth tokens / gateway config         claude binary
                                                          │  • multi-tenant routing                 → Anthropic API
                                                          │  • optional non-ACP extensions
```

The core invariant: **ACP rides untouched in its own channel; everything else (reconnect, replay, git integrations, file diffs, future features) rides in sibling channels.** A small outer envelope multiplexes the WebSocket so we can extend the protocol without polluting ACP semantics or limiting ourselves to what `_meta` and `extMethod` allow.

---

## 1. What ACP is

The **Agent Client Protocol** (https://agentclientprotocol.com) is a standardized JSON-RPC 2.0 protocol that lets a "Client" (an editor, IDE plugin, terminal frontend, or in our case an Electron app) drive an "Agent" (a coding assistant: Claude Code, Gemini CLI, Codex, etc.) over a bidirectional message stream.

Why it matters:
- **Agent-agnostic UI.** If we build our UI against ACP, swapping Claude for Gemini/Codex later is a config change, not a rewrite.
- **Rich, streamed interactions out of the box.** ACP defines first-class message types for streaming text, tool calls, file diffs, plans (TODO lists), permission prompts, terminal output, MCP server config, session fork/resume/list, model selection, and usage/cost.
- **Symmetric.** Both sides can call methods on each other — the agent can ask the client to read a file or request user permission for a destructive op.

### 1.1 Transport

The protocol is transport-agnostic but has one canonical wire format: **newline-delimited JSON-RPC 2.0 over a bidirectional byte stream**, typically the stdio of a child process. Each message is one JSON object on one line; nothing else interleaves.

This is exactly what `@agentclientprotocol/sdk`'s `ndJsonStream(writable, readable)` helper sets up. The stream type is `{ writable: WritableStream<AnyMessage>, readable: ReadableStream<AnyMessage> }` — once you have that pair, both ends speak ACP regardless of whether the underlying bytes flow over a pipe, a TCP socket, or a WebSocket.

This is the lever we'll pull: **swap stdio for WebSocket** without touching the protocol layer.

### 1.2 JSON-RPC method surface

From `@agentclientprotocol/sdk/schema/schema.json` (`x-method` annotations):

**Client → Agent** (your UI calls these):

| Method | Purpose |
|---|---|
| `initialize` | Handshake; exchange capabilities and protocol version |
| `authenticate`, `logout` | Trigger an auth flow advertised by the agent |
| `session/new` | Create a new conversation |
| `session/load` | Restore a session and replay its history as `session/update` notifications |
| `session/resume` | Restore a session without replay |
| `session/fork` (unstable) | Branch a session at the current point |
| `session/list` | List existing sessions |
| `session/close` | Tear down a session |
| `session/prompt` | Send a user message; resolves when the turn ends |
| `session/cancel` (notification) | Cancel an in-flight prompt |
| `session/set_mode` | Switch permission mode (default/acceptEdits/plan/auto/dontAsk/bypassPermissions) |
| `session/set_model` (unstable) | Switch model |
| `session/set_config_option` | Set a generic config option (mode/model/effort) |

**Agent → Client** (your UI must handle these):

| Method | Purpose |
|---|---|
| `session/update` (notification) | Streaming output: text/thought chunks, tool calls/updates, plan, mode/config/usage updates, available commands |
| `session/request_permission` | Ask the user to approve a tool call; user picks one of the offered options |
| `fs/read_text_file`, `fs/write_text_file` | Agent reads/writes via the client's filesystem view (e.g. unsaved editor buffers) |
| `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` | Agent runs commands in client-managed terminals; client renders live output |
| `elicitation/create`, `elicitation/complete` (unstable) | Agent asks for structured form input |

Plus extension escape hatches on both sides:
- `extMethod(method, params)` — arbitrary request
- `extNotification(method, params)` — arbitrary notification

We will use the `_meta` field on every message and `extMethod`/`extNotification` for our relay-specific features.

### 1.3 Message anatomy

Every notification, request, and response carries an optional `_meta: { [key: string]: unknown } | null` field. The spec explicitly reserves it for vendor metadata. `claude-agent-acp` uses it heavily:

- `_meta.claudeCode.toolName` on tool updates so the UI can route per-tool rendering
- `_meta.claudeCode.parentToolUseId` to attribute output to a sub-agent (Task tool)
- `_meta.terminal_info / terminal_output / terminal_exit` for live Bash terminal streaming
- `_meta.gateway` on the `gateway` auth method to tunnel API traffic through a custom proxy

We will follow the same pattern with a `_meta.sandcastle.*` namespace for our own additions (user-id stamping, billing tags, etc.).

### 1.4 Client and agent capabilities

Both sides advertise capabilities at `initialize`. The client tells the agent what it can do; the agent tells the client what features are available.

**Client capabilities** worth knowing:

```ts
{
  fs: { readTextFile: true, writeTextFile: true },
  terminal: true,                               // implements createTerminal etc.
  _meta: { terminal_output: true },             // wants live Bash terminal frames
  auth: { terminal: true, _meta: { "terminal-auth": true, gateway: true } },
  elicitation: { ... },                          // structured form input
}
```

**Agent capabilities** advertised by `claude-agent-acp` (see `acp-agent.ts:559-589`):

```ts
{
  protocolVersion: 1,
  agentCapabilities: {
    promptCapabilities: { image: true, embeddedContext: true },
    mcpCapabilities:    { http: true, sse: true },
    loadSession: true,
    sessionCapabilities: { fork: {}, list: {}, resume: {}, close: {} },
    _meta: { claudeCode: { promptQueueing: true } },
  },
  authMethods: [ /* claude/console terminal logins, optional gateway method */ ],
}
```

Capability negotiation has implications for our relay: the relay sits between client and agent, so any capability the agent advertises must actually be implementable by the client. If the relay plans to inject extra capabilities of its own (for instance, a `sandcastle.audit_log` extension), it can rewrite the `initialize` response on the way through.

---

## 2. How `claude-agent-acp` is implemented (the agent we're wrapping)

`claude-agent-acp` is the bridge from ACP to `@anthropic-ai/claude-agent-sdk`, which itself wraps the native `claude` CLI binary that talks to the Anthropic API. The full layering:

```
Our Electron UI ──ACP via WS──▶ Our Node relay ──ACP via stdio──▶ claude-agent-acp ──Claude SDK──▶ claude (binary) ──HTTPS──▶ Anthropic API
```

### 2.1 Process model

`src/index.ts` is a 70-line stdio bootstrap:

- redirects `console.log/info/warn/debug → stderr` so nothing pollutes the ACP stream on stdout
- builds an `AgentSideConnection(client => new ClaudeAcpAgent(client), ndJsonStream(stdout, stdin))`
- `process.stdin.resume()` keeps the event loop alive
- on stdin EOF or `connection.closed`, disposes all sessions and exits cleanly

The whole adapter — `class ClaudeAcpAgent implements Agent` — lives in `src/acp-agent.ts` (~2700 lines).

### 2.2 What it maps

| ACP request/notification | Claude SDK action |
|---|---|
| `session/new` | `query({prompt, options})` → returns SDK `Query`; we capture sessionId, modes, models, configOptions |
| `session/prompt` | push `SDKUserMessage` into the input stream; pump `for await (const msg of session.query)` and translate each SDK message into one or more `session/update` notifications |
| `session/cancel` | `query.interrupt()` |
| `session/set_mode` | `query.setPermissionMode()` (default/acceptEdits/plan/auto/dontAsk/bypassPermissions) |
| `session/set_model` | `query.setModel()` |
| `session/set_config_option` | mode / model / effort knobs; rebuilds available effort levels when model changes |
| `session/load` | `getSessionMessages(id)` → replays history as `session/update` notifications, then resolves |
| `session/list` | `listSessions({dir})` from the SDK transcript store |
| `session/fork` | new sessionId, resume from existing |
| MCP servers in `NewSessionRequest.mcpServers` | merged into SDK's `mcpServers` config (stdio/http/sse) |
| SDK `canUseTool` callback | converted into `session/request_permission` calls back to the client |
| SDK `PostToolUse` hooks | used to intercept Edit results (structured diffs) and detect plan-mode entry |

### 2.3 Streaming translation (the heart of it)

In `prompt()` (`acp-agent.ts:672`), the agent iterates `session.query` and dispatches by `message.type`:

- `stream_event` → granular Anthropic streaming events:
  - `message_start` / `message_delta` → `usage_update` notifications computed from cumulative `input_tokens + output_tokens + cache_read_input_tokens + cache_creation_input_tokens` plus an authoritative context window size
  - `content_block_start` / `content_block_delta` → `agent_message_chunk`, `agent_thought_chunk`, partial `tool_call`s
- `assistant` / `user` → full Anthropic message blocks. Emits final `tool_call` (with full input), `tool_call_update` (refines the streaming version), image blocks, plan updates from the `TodoWrite` tool
- `result` → final `usage_update` (with authoritative cost), then resolves the prompt with `stopReason` (`end_turn`/`max_tokens`/`max_turn_requests`/`refusal`/`cancelled`)
- `system` subtypes:
  - `compact_boundary` → emits "Compacting completed" message + resets context-used counter to 0
  - `session_state_changed: idle` → also resolves the prompt
  - `local_command_output` → text from local-only slash commands (`/context`, `/heapdump`, `/extra-usage`)

Two pure functions do the heavy lifting and are exported for reuse:
- `toAcpNotifications(content, role, sessionId, toolUseCache, client, logger, opts)` — `acp-agent.ts:2343`
- `streamEventToAcpNotifications(message, sessionId, toolUseCache, client, logger, opts)` — `acp-agent.ts:2602`

### 2.4 Tool calls

Per tool invocation:

1. **First sighting** (streaming `content_block_start` or full assistant message): emit `tool_call` with `toolCallId`, `kind` (`read|edit|delete|move|search|execute|think|fetch|switch_mode|other`), `title`, `status: "pending"`, `rawInput`, `locations`, `content`. `toolInfoFromToolUse` (in `tools.ts:121`) shapes these per Claude tool: `Bash` → `{kind:"execute", title: command}`, `Read` → `{kind:"read", title: "Read path", locations:[{path,line}]}`, `Edit` → `{kind:"edit", content: [{type:"diff", path, oldText, newText}]}`, etc.
2. **Updates** flow as `tool_call_update` (status changes, output content, refined diff).
3. For `Bash`, when the client advertises `_meta.terminal_output: true`, the agent emits a `{type: "terminal", terminalId}` ToolCallContent block plus `_meta.terminal_info`/`terminal_output`/`terminal_exit` updates so the UI can render a live terminal.
4. For `Edit`, the structured diff arrives in a `tool_call_update` produced by a `PostToolUse` hook (using SDK's `structuredPatch`), not the initial event.
5. `TodoWrite` is special-cased: instead of a tool call, it emits a `plan` update with the TODOs.

### 2.5 Permission flow

When the SDK's `canUseTool` fires (every tool that isn't pre-approved by the current session mode), the bridge calls `client.requestPermission(...)` with options like:

```
[
  { kind: "allow_always", name: "Always Allow Bash(npm test:*)", optionId: "allow_always" },
  { kind: "allow_once",   name: "Allow",                          optionId: "allow"        },
  { kind: "reject_once",  name: "Reject",                         optionId: "reject"       },
]
```

`describeAlwaysAllow` (`acp-agent.ts:403`) builds the option label so the user sees the exact rule they're committing to (`Bash(npm test:*)` or `access to /tmp/foo`). The client's response (`{outcome: {outcome: "selected", optionId}}`) maps back to an SDK `{behavior: "allow", updatedInput, updatedPermissions}` or `{behavior: "deny", message}`.

`ExitPlanMode` is special-cased: its options switch the session mode (`auto`/`acceptEdits`/`default`/`plan`/`bypassPermissions`).

### 2.6 Session modes

Advertised at session creation (`acp-agent.ts:1844-1878`):

| Mode | Behavior |
|---|---|
| `auto` | Model classifier auto-approves/denies permission prompts |
| `default` | Prompt for risky operations |
| `acceptEdits` | Auto-accept file edits |
| `plan` | Read-only planning mode, no tool execution |
| `dontAsk` | Deny anything not pre-approved |
| `bypassPermissions` | Skip all permission checks (disabled when running as root unless `IS_SANDBOX=1`) |

### 2.7 Slash commands

`session.query.supportedCommands()` returns Claude Code's slash-command set. The bridge sends `available_commands_update` notifications so the UI can autocomplete `/`. A small set of "local-only" commands (`/context`, `/heapdump`, `/extra-usage`) execute without invoking the model. MCP commands are renamed: client types `/mcp:server:command`, wire is `/server:command (MCP)`.

### 2.8 MCP servers

Passed to `session/new` as `mcpServers: [{name, type, command/args/env | url/headers}]`. The bridge merges these into the SDK's MCP config — so MCP servers run **in the agent process**, with the agent's environment variables. Reconfiguring MCP requires recreating the session (`session/load` with a different MCP set tears down and recreates the underlying SDK Query; see `computeSessionFingerprint` at `acp-agent.ts:160`).

### 2.9 Auth

The agent advertises `authMethods` at `initialize`, conditional on client capabilities:

- `claude-ai-login` / `console-login` — terminal-based: client launches `claude --cli auth login --claudeai|--console` in a pty (or `claude /login` for remote/SSH cases). OAuth tokens persist in `~/.claude`.
- `gateway` — only offered if client advertises `auth._meta.gateway: true`. On `authenticate({methodId: "gateway", _meta: {gateway: {baseUrl, headers}}})`, the agent injects `ANTHROPIC_BASE_URL`, `ANTHROPIC_CUSTOM_HEADERS`, and a non-empty `ANTHROPIC_AUTH_TOKEN` to bypass the login requirement and proxy traffic through a custom Anthropic-compatible gateway. **This is the right path for a server-side deployment** — see §5.

### 2.10 Other notable mechanics

- **Stdout is sacred.** `console.log/info/warn/debug` are redirected to stderr in `index.ts:45`. Anything we shove between the agent and the client must preserve this discipline — one stray byte on stdout breaks ndjson framing.
- **Prompt queueing.** Client may submit a new prompt while a previous one is mid-stream; the agent pushes it into the input stream and resolves the prior promise with `end_turn`. `agentCapabilities._meta.claudeCode.promptQueueing: true` advertises this.
- **`session/load` replay.** When you reopen a session, the agent fires `session/update` for every prior message before `session/load` resolves. The client must distinguish "this is replay" vs "this is live" — there's no flag, but `session/load` doesn't resolve until replay is done.
- **`usage_update` is mid-stream.** Token counts update *during* a turn from `message_delta` events, then a final authoritative count from the `result`. Display as approximate until the turn ends.
- **Cancellation is async.** `session/cancel` is a notification — fire-and-forget; the prompt promise eventually resolves with `stopReason: "cancelled"` after pending updates flush.
- **Model context window.** The agent caches the current model's window size and resets it on model switch (`acp-agent.ts:1547-1554`); the value rides along with `usage_update.size`.

---

## 3. The relay server design

### 3.1 Goals and non-goals

**Goals**
1. Run on a VPS; client connects from anywhere over TLS WebSocket.
2. Be a transparent ACP passthrough by default — any current or future ACP client SDK should work without modification.
3. One agent process per client session; lifecycle managed by the relay.
4. Survive process restarts without losing in-flight session IDs (hand sessions back via `session/load` after reconnect).
5. Pluggable auth at the WS edge (we control which user gets which Anthropic credentials).
6. Hooks for our own non-ACP features (audit log, telemetry, future multi-user collab) without breaking ACP semantics.

**Non-goals (initial cut)**
- Multi-tenant within a single agent process (we'd need agent-side support; not worth it).
- Re-implementing ACP. We use `@agentclientprotocol/sdk` types but don't construct `AgentSideConnection`/`ClientSideConnection` on the relay — we just shuttle frames.
- Caching or rewriting `session/update` payloads. Keep the relay dumb.

### 3.2 Topology

```
       ┌──────────────────────────────────────┐
       │           Electron UI                │
       │ ┌──────────────────────────────────┐ │
       │ │  acp.ClientSideConnection        │ │
       │ │  + acp.Client implementation     │ │
       │ └──────────────┬───────────────────┘ │
       │   WSStream<AnyMessage>               │
       └────────────────┼─────────────────────┘
                        │ WSS, ndjson frames (one JSON object per WS text message)
                        ▼
       ┌──────────────────────────────────────┐
       │       Node relay (this project)      │
       │  ┌──────────────┐  ┌──────────────┐  │
       │  │ WS handler   │  │ AuthN/Z      │  │
       │  └──────┬───────┘  └──────────────┘  │
       │         │                            │
       │  ┌──────▼─────────────────────────┐  │
       │  │ SessionBroker                  │  │
       │  │  • spawns claude-agent-acp     │  │
       │  │  • per-WS state                │  │
       │  │  • frame router (passthrough)  │  │
       │  │  • inject _meta.sandcastle.*   │  │
       │  └──────┬─────────────────────────┘  │
       │         │ stdin/stdout (ndjson)      │
       └─────────┼────────────────────────────┘
                 ▼
       ┌──────────────────────────────────────┐
       │         claude-agent-acp             │
       │ (one child process per WS session)   │
       └──────────────────────────────────────┘
```

### 3.3 Wire format on the WebSocket

Each WS text message is one JSON object — an **envelope** with a `kind` discriminator that routes the payload to a channel. The hot-path channel is `"acp"`, whose payload is a verbatim ACP JSON-RPC 2.0 frame (the same bytes the agent reads from stdin and writes to stdout). Other channels (`"control"`, `"git"`, future) carry our own typed messages.

Envelope shape:

```ts
type Envelope =
  | { kind: "acp";     seq?: number; payload: AnyJsonRpcMessage }   // server→client carries seq; client→server omits
  | { kind: "control"; seq?: number; type: ControlType; id?: number; payload: unknown }
  | { kind: "git";     seq?: number; type: GitType;     id?: number; payload: unknown }
  // ... more channels as features land
```

Why an envelope rather than the original "rely on `extMethod`" plan:

- **Mid-stream reconnect** (§3.11) needs a server→client sequence number on every frame so the client can request a replay from `since: lastSeq`. We can't put `seq` inside the JSON-RPC payload without bending the spec; the envelope is the natural home.
- **Non-ACP features** (git diffs, file watches, collab cursors) need their own request/response and notification semantics. Stuffing them into `extMethod` over a single multiplexed JSON-RPC layer means a single ID space and intermixed concerns; separate channels keep the surface tractable.
- **Backpressure / replay buffering** is per-channel. ACP frames need replay; ephemeral `control.heartbeat` frames don't. Knowing the kind lets the relay decide cheaply.
- ACP itself is still untouched — its bytes ride inside `payload` unchanged, so an off-the-shelf `acp.ClientSideConnection` works once we adapt its `Stream` to unwrap/wrap envelopes (a few lines).

Cost: each side needs a small Stream adapter; raw `acp.ClientSideConnection` doesn't drop in unmodified. We pay this once in `packages/acp-transport`.

The adapter on each side filters envelopes by kind and serves only the ACP channel to `acp.ClientSideConnection`:

```ts
// packages/acp-transport/src/wsStream.ts
import type * as acp from "@agentclientprotocol/sdk";

export function wsAcpStream(ws: WebSocket, onNonAcp: (env: Envelope) => void): acp.Stream {
  const writable = new WritableStream<acp.AnyMessage>({
    write(msg) { ws.send(JSON.stringify({ kind: "acp", payload: msg })); },
  });
  const readable = new ReadableStream<acp.AnyMessage>({
    start(controller) {
      ws.addEventListener("message", e => {
        const env: Envelope = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString());
        if (env.kind === "acp") controller.enqueue(env.payload as acp.AnyMessage);
        else onNonAcp(env);
      });
      ws.addEventListener("close",   () => controller.close());
      ws.addEventListener("error", err => controller.error(err));
    },
  });
  return { readable, writable };
}
```

Then on the Electron main process:

```ts
const conn = new acp.ClientSideConnection(_agent => new MyClient(), wsAcpStream(ws, handleControl));
```

…and we still get all the typed ACP methods (`conn.initialize`, `conn.newSession`, `conn.prompt`, etc.) — just with envelope unwrap in the middle.

### 3.4 Channels

Channels are declared in advance; both sides know the catalog. Adding a channel is a versioned change. Initial set:

| `kind` | Direction | Replayable | Purpose |
|---|---|---|---|
| `acp` | both | yes (server→client) | ACP JSON-RPC frames, verbatim payload |
| `control` | both | partial | Auth, resume, heartbeat, server-pushed errors/quota |
| `git` | both | yes (server→client) | Future: file-change events, diff requests, blame, branch state |
| `fs` | both | maybe | Future: workspace tree snapshots, watch notifications (may overlap with `git`) |

Each channel can carry both notifications and request/response. For request/response we use the optional envelope `id` field (one ID space per channel). The relay does not interpret payloads of channels it doesn't own; unknown channels are dropped with a `control.error` reply.

### 3.5 Control channel

The control channel is the relay's own surface, distinct from ACP. Initial message types:

| `type` | Direction | id? | Purpose |
|---|---|---|---|
| `hello` | C → S, request | yes | Auth + client identification. Must be the first message after WS open. Reply: `{ relayVersion, agent: { name, version }, session: { mode: "fresh" \| "resumed", since?: seq }, capabilities: { resume: bool, channels: [...] } }` |
| `resume` | C → S, request | yes | Reattach to a previously-active session: `{ sessionId, since: seq }`. Server replies with `{ ok: true, replayedThrough: seq }`, then the buffered ACP frames flow on the `acp` channel with monotonically increasing `seq`. If the buffer is gone, replies `{ ok: false, reason: "buffer_expired" }` and the client falls back to ACP `session/load`. |
| `heartbeat` | C → S, notification | – | App-level liveness; reply is `heartbeat_ack`. WS-level pings handle network liveness; this catches stuck relays/agents. |
| `quota` | S → C, notification | – | Quota/billing warnings, soft-deny notices. |
| `error` | S → C, notification | – | Out-of-band errors not tied to a specific request (agent crashed, replay buffer ran out, internal). Distinct from JSON-RPC error responses. |
| `agent_state` | S → C, notification | – | Lifecycle: `{ state: "starting" \| "ready" \| "respawning" \| "dead" }`. Useful so the UI can show "reconnecting…" without guessing. |

### 3.6 Process lifecycle (broker-owned, WS-independent)

To make mid-stream reconnect work the agent process must outlive any single WS connection. We introduce a **SessionBroker** (one per `userId`, or per `(userId, agentSessionId)` if we want hard isolation) that owns:

- the `claude-agent-acp` child process
- a long-lived `ClientSideConnection`-equivalent driver inside the relay (we are the agent's "client")
- a per-session **outbound buffer** of envelopes (§3.11)
- the currently-attached WebSocket, if any (zero or one at a time per session in v1)

State machine of a broker session:

```
        ┌──────────┐  WS attaches, ACP initialize done
        │  IDLE    │ ──────────────────────────────────┐
        └────┬─────┘                                   │
             │ first prompt creates broker session     ▼
             ▼                                   ┌──────────┐
       ┌──────────┐  WS detaches (close/error)   │  ACTIVE  │
       │ ATTACHED │ ◀───────────────────────────▶│ (DETACHED│
       └────┬─────┘  WS attaches with valid      │  buffer  │
            │        control.resume              │  fills)  │
            │                                    └────┬─────┘
            │ idle for grace_period (no WS, no work)  │
            ▼                                         │
       ┌──────────┐ ◀───────────────────────────────-─┘
       │ DRAINING │  send remaining frames, flush buffer
       └────┬─────┘
            │
            ▼
       ┌──────────┐  SIGTERM child, free Redis stream
       │ TORNDOWN │
       └──────────┘
```

Key points:

1. **Open WS.** Don't spawn anything yet. Wait for `control.hello`.
2. **`control.hello` received.** Verify token. Resolve `userId` and credentials. Reply with relay capabilities. Don't spawn an agent yet either — wait for either a fresh `initialize`/`session/new` or a `control.resume`.
3. **Fresh path.** Client sends `acp` → `initialize` → `session/new`. Relay spawns an agent (or reuses an idle broker for the user), creates a new broker session, attaches the WS. From this point ACP frames flow normally; every server→client envelope on the `acp` channel gets a monotonic `seq` and is appended to the session's outbound buffer.
4. **Resume path.** Client sends `control.resume {sessionId, since}`. If a broker session exists in `ACTIVE (DETACHED)` and `since` is still in the buffer: relay replies `{ ok: true }`, replays envelopes with `seq > since` from the buffer, then continues live forwarding. If broker session is gone or buffer was trimmed: relay replies `{ ok: false, reason: "buffer_expired" }`; client falls back to ACP `session/load` for full transcript replay.
5. **Auth injection.** At broker-spawn time, the relay constructs the agent's env (per-user credentials, isolated `CLAUDE_CONFIG_DIR`) and authenticates the agent with the gateway method itself, before any ACP traffic from the WS is forwarded. The client never sees raw Anthropic creds.
6. **WS close.** Broker transitions `ATTACHED → ACTIVE (DETACHED)`. **No `session/cancel` is issued.** The agent keeps running. The buffer keeps filling (bounded — see §3.11). A grace timer starts.
7. **WS reattach within grace window.** Resume per step 4.
8. **Grace expires with no WS.** Broker enters `DRAINING`: any in-flight prompt is cancelled (`session/cancel` to the agent), the agent's process is sent SIGTERM, the buffer is freed.
9. **Child dies unexpectedly.** Broker emits `control.error { code: "agent_died" }` to the WS if attached, transitions to `TORNDOWN`. Buffer is preserved for the grace window so the client can `control.resume` and trigger a full reload (which will fail and force a `session/load` on a freshly spawned broker).

Multiple sessions per user are tracked as multiple broker sessions sharing one agent process (the agent supports multi-session natively via `sessionId` on every request) when feasible, or as separate processes when isolation is preferred. v1 picks the simpler "one agent process per attached WS, multi-session within it" model — see §3.12.

### 3.7 Frame rewriting (controlled, narrow)

ACP-channel payloads should be passed through bit-for-bit on the hot path. The relay rewrites only:

- `initialize` response — strip `authMethods` we don't expose to end users (e.g. drop `claude-ai-login` in production, leave `gateway`); optionally annotate `agentCapabilities._meta.sandcastle.*` with relay-specific capabilities (e.g. `replay: true` so the client knows soft-reconnect is available).
- `authenticate` — the relay does this itself with the gateway method as soon as the agent finishes `initialize`, before forwarding the `initialize` response to the client. The client never sees raw Anthropic creds.
- Stamping each server→client envelope (not the ACP payload) with `seq` and appending to the outbound buffer. This is at envelope level, not inside the ACP JSON-RPC, so the SDK on the client sees an unmodified frame.

Rewrites of ACP payloads must preserve JSON-RPC semantics (don't change `id`, don't drop responses) and should never block on async work in the hot path.

### 3.8 Auth and credential management

Two layers:

**Layer 1 — relay authentication (client → relay).** WSS handshake includes a bearer token (Authorization header on the upgrade, or a query param) issued by our normal auth system. WS connections without a valid token are closed at the upgrade.

**Layer 2 — agent authentication (relay → Anthropic).** The relay knows the user's Anthropic credentials (or a user-scoped gateway URL + headers) and injects them on the agent's behalf:

- **Gateway model (recommended).** Run an Anthropic-protocol gateway (the relay itself, or a separate proxy) that authenticates outbound requests using a server-held API key, applies per-user quota/audit, then forwards to `api.anthropic.com`. Use ACP's `gateway` auth method to point the agent at it. Result: end users never see API keys, never run `claude login`, and we have full request visibility.
- **Pass-through API key.** Set `ANTHROPIC_API_KEY` in the agent process's env from server-side user state. Simpler, but we lose request-level visibility and per-user gateway features.

Either way, agent-process env is **constructed by the relay**, not inherited from the parent shell:

```ts
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  // not inherited: shell history, AWS creds, etc.
  ANTHROPIC_BASE_URL: user.gatewayUrl,
  ANTHROPIC_CUSTOM_HEADERS: `X-Sandcastle-User: ${user.id}\nAuthorization: Bearer ${user.gatewayToken}`,
  ANTHROPIC_AUTH_TOKEN: "x",  // must be non-empty to bypass claude-login requirement
  CLAUDE_CONFIG_DIR: perUserConfigDir(user.id),  // isolate ~/.claude per user
};
```

Per-user `CLAUDE_CONFIG_DIR` is important: the Claude SDK persists session transcripts there, and we don't want one user's history leaking into another's `session/list`.

### 3.9 Working directory and filesystem

ACP's `session/new` requires a `cwd` (absolute path). On a VPS we have a few choices:

1. **Server-owned workspaces.** Each user gets a sandboxed dir (`/var/sandcastle/users/<id>/workspaces/<wsid>`); the client picks one when creating a session. The agent reads/writes files there. Editor UI is built on top of `fs/read_text_file` + `fs/write_text_file` against the relay's local FS.
2. **Client-owned filesystem.** The Electron client advertises `fs: { readTextFile: true, writeTextFile: true }`. The relay forwards `fs/read_text_file`/`fs/write_text_file` requests as-is to the client, which serves them from the user's local disk. The agent's `cwd` then must be a path that exists on the *server* (for `Bash`/`Glob`/`Grep`), but the *content* the agent sees comes from the client's machine.

These don't compose cleanly — the agent uses the same `cwd` for shell commands and for resolving paths to `fs/read_text_file`. **Pick one per session.** For a hosted product, (1) is simpler; for a local-power-user product, (2) is what Zed does.

Initial choice: **(1) server-owned workspaces.** Electron is just a UI; no local FS sync. We can add (2) later as a per-session opt-in.

### 3.10 Terminals

If the client advertises `terminal: true`, the agent calls `terminal/create` etc. for `Bash` invocations. The relay forwards these to the client. The client (Electron) opens a real shell and pipes output back. **But:** if `cwd` is a server path and the terminal is client-side, `cd` and shell built-ins go to the wrong machine. So:

- For server-owned workspaces (3.9 option 1): the relay should run terminals server-side. Either (a) advertise `_meta.terminal_output: true` from the client and let the agent embed terminal blocks in tool calls (no `terminal/create` needed — output is part of the `tool_call`), or (b) implement `terminal/create` *on the relay*, not the client, and forward only the rendered output to the UI.
- For client-owned workspaces: terminals on the client.

Initial choice: **embed Bash output via `_meta.terminal_output`** (advertise it from the relay-as-client, get streamed text in `tool_call_update` payloads, render in the UI as a terminal-styled component). No real PTY needed on the client until we want interactive shells.

### 3.11 Mid-stream reconnect (custom, beyond ACP)

ACP's `session/load` and `session/resume` give us **hard reconnect** (full transcript replay from the agent's on-disk store). They don't help if the WS drops mid-prompt — the user shouldn't lose the streaming response in flight, and the agent shouldn't have to start the turn over. We add a **soft reconnect** layer below ACP, owned entirely by the relay.

The mechanism: every server→client envelope on the `acp` channel is stamped with a monotonic per-broker-session `seq` and written to a bounded **outbound buffer** before being sent on the WS. If the WS drops, the broker keeps appending to the buffer. When the client reconnects, it sends `control.resume {sessionId, since}`; the relay drains envelopes with `seq > since` and then resumes live forwarding.

#### 3.11.1 Buffer backing

Single-node deployment, no shared state across processes — so we don't need anything fancy.

**Default: in-process ring buffer per broker session.** A plain `Map<sessionId, BufferedEnvelope[]>` on the relay, bounded by count and bytes, plus a counter for `seq`. Zero I/O on the hot path; appending an envelope is an array push. The buffer dies if the relay process dies, but that's also when the agent process dies, so the client's only correct response to relay restart is a hard reconnect via ACP `session/load` regardless. Persisting the buffer wouldn't help recover from relay crashes — the agent's mid-prompt state isn't recoverable either.

**Optional: SQLite (`better-sqlite3`) as a drop-in.** Useful if we want the buffer to survive a relay restart (e.g. zero-downtime relay deploys, where the new process inherits old buffers and clients reconnect to a fresh relay without forcing `session/load`). One table per relay, one row per envelope, primary key `(sessionId, seq)`, with a periodic `DELETE WHERE seq < oldestSeq OR createdAt < now - ttl`. Synchronous writes are fine at our throughput (the agent emits maybe a few hundred envelopes per second on the busy path; SQLite WAL handles tens of thousands).

**Recommendation: in-memory for v1**, with the buffer hidden behind a `BufferStore` interface so swapping to SQLite later is mechanical:

```ts
interface BufferStore {
  append(sessionId: string, env: Envelope): number;       // returns assigned seq
  range(sessionId: string, since: number): Envelope[];    // strictly > since, in seq order
  oldest(sessionId: string): number;                      // smallest seq still retained
  trim(sessionId: string): void;                          // enforce caps
  drop(sessionId: string): void;                          // teardown
}
```

Caps and TTLs (per session): **10,000 envelopes or 10 MB**, whichever is smaller; **1 hour after last write**. Same numbers regardless of backing.

#### 3.11.2 Replay protocol

```
client                                      relay                      agent
   │                                           │                         │
   │ ── WS open ──────────────────────────────▶│                         │
   │ ── envelope { control, hello, ... } ────▶│                         │
   │ ◀── envelope { control, hello.ok } ──────│                         │
   │ ── envelope { control, resume,           │                         │
   │      payload: { sessionId, since: 412 } }─▶│                         │
   │                                           │ XRANGE buffer 412+ ...  │
   │ ◀── envelope { control, resume.ok,       │                         │
   │      payload: { replayedThrough: 481 } } │                         │
   │ ◀── envelope { acp, seq:413, payload }   │                         │
   │ ◀── envelope { acp, seq:414, payload }   │                         │
   │  ...                                      │                         │
   │ ◀── envelope { acp, seq:481, payload }   │                         │
   │      (now caught up; live forwarding)    │                         │
   │ ◀── envelope { acp, seq:482, payload }   │ ◀── live frame from ────│
```

Ordering invariants the relay must maintain:

1. **Per-session monotonicity.** All `acp` envelopes for a single sessionId have strictly increasing `seq`.
2. **Replay before live.** During resume, the relay drains the buffer fully before forwarding any new frames. The simplest correct implementation: pause the live forward loop while replay drains, then unpause.
3. **No duplicates, no gaps.** Each `seq` is sent at most once per WS attachment. The buffer is the source of truth — a frame is only sent on the WS *after* it's been appended to the buffer.

Client behavior: track `lastSeq` per sessionId. On reconnect, send `control.resume {since: lastSeq}`. If `resume.ok = false`, fall back to `acp:session/load` and rebuild local state from the replay.

#### 3.11.3 Buffer sizing and overflow

A long Bash command + a chatty model can produce thousands of envelopes per turn. The buffer must be bounded.

- Per-session cap: **10,000 envelopes or 10 MB**, whichever is smaller. Approximate trim is fine.
- Per-session TTL: **1 hour after last write** (covers laptop-sleep, plane mode, captive portals).
- On overflow: keep the most recent N envelopes, drop the oldest. The relay tracks `oldestSeq`. If a `control.resume {since}` arrives with `since < oldestSeq`, reply `{ ok: false, reason: "buffer_expired" }`.

Backpressure on the live path: if the WS is slow but buffer is fine, no problem (we don't block the agent on WS writes; we always append to buffer first, then `ws.send` is best-effort and the buffer stands in for any frames that didn't make it). If the WS is healthy but the buffer is full, we trim the head — the client will detect the gap on the next reconnect and recover via `session/load`.

#### 3.11.4 Interaction with ACP `session/load`

`session/load` is the agent's idea of replay; our buffer is the relay's idea of replay. They're complementary:

| Scenario | Tool |
|---|---|
| WS drop during a turn, reconnect within an hour | Relay buffer (`control.resume`) |
| Cold open of an old session in a new app instance | ACP `session/load` |
| Buffer expired or relay restart wiped buffer | ACP `session/load` |
| Agent process crashed and was respawned | Hybrid: spawn fresh agent, do ACP `session/load` from disk transcript, then resume buffer-flushing if any envelopes were appended during respawn |

Crucially, the buffer holds **envelopes** (already-translated ACP frames the agent emitted), not raw SDK messages. We don't try to re-translate; replay is exactly what the client would have seen if the WS hadn't dropped.

#### 3.11.5 Things this doesn't solve

- **Mid-prompt with no agent persistence.** If the agent process dies before its `result` message hits the buffer, the turn is lost. The user sees a partial response and a `control.error`, and must re-prompt. We can't recover a turn the model never finished sending.
- **Two clients on one session.** v1 disallows it. If a second WS attaches while one is already attached, we either reject (cleanest) or migrate (more user-friendly — kick the old WS, let the new one resume). Pick "reject with `slot_occupied`" for v1.
- **Buffering client→server frames.** Not buffered. If a `session/prompt` is sent during a WS drop, it never reached the relay; the client must retry on its own. Idempotent operations (`session/cancel`) are safe to retry blindly; non-idempotent ones (`session/prompt`) need client-side dedupe via the optional ACP `messageId` field.

### 3.12 Multi-session per user

A user might want multiple concurrent conversations. ACP already supports multi-session within one agent process (the `ClaudeAcpAgent.sessions` map). One WS can carry many `session/new` requests, each with its own `sessionId` on every frame.

**v1 model**: one agent process per WS, many sessions per agent. Each session has its own outbound buffer (Redis stream) and its own `seq` counter. The broker tracks `Map<sessionId, BrokerSession>` per agent process.

If a user opens a second device, that's a second WS and (in the simple model) a second agent process. With Claude's on-disk transcripts, they can both `session/load` the same `sessionId` and read it. Two simultaneous prompts on the same `sessionId` are undefined and we serialize at the relay: per-`sessionId` lock, second writer waits or rejects with `control.error { code: "session_busy" }`. Soft-reconnect (§3.11) is single-attachment per session in v1; if a second WS tries to attach to a session that's already attached, reject with `slot_occupied`.

### 3.13 Observability

The relay is the natural choke point for:

- **Audit log** — every `session/prompt`, every `tool_call`, every `request_permission` outcome, with userId stamps.
- **Metrics** — token counts (from `usage_update`), latency (from `id`-correlated request/response pairs), tool-call success rates, per-tool error rates.
- **Cost** — `result.total_cost_usd` per turn, aggregated per user.

Implementation: an interceptor in the frame router that taps the stream and emits to OTel/Prometheus/wherever, without modifying the frames.

### 3.14 Failure modes

| Failure | Detection | Action |
|---|---|---|
| Agent process exits | `child.on("exit")` | Notify client via `sandcastle/error`; close WS code 1011 |
| Agent stdout stalls (deadlock) | per-frame watchdog timer | Log; SIGTERM agent; close WS |
| Client sends malformed JSON | `JSON.parse` throws | Reject frame; if persistent, close WS code 1003 |
| Client floods prompts | rate limit per user | Send `sandcastle/error`; reject `session/prompt` |
| Outbound Anthropic API fails | comes back as `result.is_error` from agent | Pass through; UI renders the error |
| Out-of-disk on relay | `fs/write_text_file` fails | Pass through as `RequestError.internalError` |

---

## 4. Repo layout (proposed)

```
sandcastle/
├── apps/
│   ├── api/         (this — the Node relay)
│   │   ├── src/
│   │   │   ├── index.ts             # HTTP + WS server entry
│   │   │   ├── auth.ts              # WS upgrade auth, JWT verification
│   │   │   ├── relay.ts             # SessionBroker, frame router, child lifecycle
│   │   │   ├── transport.ts         # ws ↔ acp.Stream adapters; ndjson reframer
│   │   │   ├── control.ts           # sandcastle/* method handlers
│   │   │   ├── interceptors.ts      # audit log, metrics, _meta tagging
│   │   │   └── env.ts               # per-user env construction
│   │   └── package.json
│   └── desktop/    (Electron app)
│       ├── src/
│       │   ├── main/                # Electron main: WS connection + ACP client
│       │   ├── preload/             # IPC bridge
│       │   └── renderer/            # React UI rendering session/update notifications
│       └── package.json
└── packages/
    ├── acp-transport/   # shared: wsStream(ws): acp.Stream, control-method types
    └── acp-types/       # shared: re-exports + sandcastle/* schemas
```

The Electron app talks to the relay through a local WebSocket client living in the main process; the renderer talks to the main process via IPC. We don't put WS in the renderer because (a) we want auth tokens out of renderer memory, (b) we want one connection across renderer reloads.

---

## 5. Implementation plan (phases)

### Phase 1 — passthrough relay (MVP)
- WS server, JSON parsing on frames, child spawn per WS.
- No auth, no rewriting, no control methods. Hardcoded user.
- Goal: prove that an off-the-shelf `acp.ClientSideConnection` can talk through the relay to the agent.
- Validation: run the example client from `@agentclientprotocol/sdk/dist/examples/client.js` against the relay.

### Phase 2 — Electron skeleton
- Electron main process opens WS to local relay (`ws://localhost:PORT`).
- React renderer with: chat input, message list (text), tool-call cards (basic), permission modal, session list.
- Map `session/update` variants to React components.
- Renderer ↔ main IPC for sending prompts and receiving updates.

### Phase 3 — auth and credentials
- Add `sandcastle/hello` with token verification.
- Per-user `CLAUDE_CONFIG_DIR`, env construction.
- Implement gateway auth method or `ANTHROPIC_API_KEY` injection.

### Phase 4 — production hardening
- Reconnect support (`sandcastle/resume`, `session/load` flow).
- Multi-session per WS.
- Audit log + metrics interceptors.
- Rate limits.

### Phase 5 — extensions
- Server-side workspaces (file storage, git integration).
- Embedded `_meta.terminal_output` for live Bash rendering.
- Custom slash commands at the relay layer.
- Multi-device collaboration (`session/load` from two WSs at once with arbitration).

---

## 6. Reference: working Phase 1 sketch

Illustrative only; real implementation lives in `apps/api/src/` and `apps/desktop/src/`.

### 6.1 Envelope and channel types (shared)

```ts
// packages/acp-transport/src/envelope.ts
export type AcpEnvelope     = { kind: "acp";     seq?: number; payload: unknown };
export type ControlEnvelope = { kind: "control"; seq?: number; type: string; id?: number; payload: unknown };
export type GitEnvelope     = { kind: "git";     seq?: number; type: string; id?: number; payload: unknown };
export type Envelope = AcpEnvelope | ControlEnvelope | GitEnvelope;

export function encode(env: Envelope): string { return JSON.stringify(env); }
export function decode(text: string): Envelope { return JSON.parse(text); }
```

### 6.2 Relay broker (single agent, single session, in-memory buffer)

```ts
// apps/api/src/broker.ts
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { encode, type Envelope } from "@sandcastle/acp-transport";

interface BufferedEnvelope { seq: number; env: Envelope; }

export class BrokerSession {
  private child: ChildProcess;
  private buffer: BufferedEnvelope[] = [];   // BufferStore impl; swap for SQLite later if needed
  private nextSeq = 1;
  private oldestSeq = 1;
  private ws: WebSocket | null = null;
  private graceTimer: NodeJS.Timeout | null = null;
  private readonly maxBuffered = 10_000;

  constructor(private readonly userId: string, env: NodeJS.ProcessEnv) {
    this.child = spawn("claude-agent-acp", [], { stdio: ["pipe", "pipe", "pipe"], env });
    const rl = createInterface({ input: this.child.stdout! });
    rl.on("line", line => { if (line.trim()) this.onAgentFrame(line); });
    this.child.stderr!.on("data", b => process.stderr.write(`[agent] ${b}`));
    this.child.on("exit", () => this.onAgentExit());
  }

  attach(ws: WebSocket, since?: number): { ok: boolean; reason?: string; replayedThrough?: number } {
    if (this.ws) return { ok: false, reason: "slot_occupied" };
    if (since !== undefined && since < this.oldestSeq - 1) return { ok: false, reason: "buffer_expired" };

    this.ws = ws;
    if (this.graceTimer) { clearTimeout(this.graceTimer); this.graceTimer = null; }

    if (since !== undefined) {
      const replay = this.buffer.filter(b => b.seq > since);
      for (const { env } of replay) ws.send(encode(env));
      return { ok: true, replayedThrough: replay.at(-1)?.seq ?? since };
    }
    return { ok: true };
  }

  detach() {
    this.ws = null;
    this.graceTimer = setTimeout(() => this.teardown(), 60_000);  // 60s grace
  }

  sendFromClient(payload: unknown) {
    this.child.stdin!.write(JSON.stringify(payload) + "\n");
  }

  private onAgentFrame(line: string) {
    let payload: unknown;
    try { payload = JSON.parse(line); } catch { return; }
    const env: Envelope = { kind: "acp", seq: this.nextSeq, payload };
    this.buffer.push({ seq: this.nextSeq, env });
    this.nextSeq++;
    while (this.buffer.length > this.maxBuffered) {
      this.oldestSeq = this.buffer[1]?.seq ?? this.oldestSeq;
      this.buffer.shift();
    }
    if (this.ws && this.ws.readyState === this.ws.OPEN) this.ws.send(encode(env));
  }

  private onAgentExit() {
    const env: Envelope = { kind: "control", type: "error", payload: { code: "agent_died" } };
    if (this.ws?.readyState === this.ws.OPEN) this.ws.send(encode(env));
    this.teardown();
  }

  private teardown() {
    if (!this.child.killed) this.child.kill("SIGTERM");
    setTimeout(() => { if (!this.child.killed) this.child.kill("SIGKILL"); }, 5_000);
    this.buffer = [];
  }
}
```

### 6.3 WS handler (envelope router)

```ts
// apps/api/src/ws-handler.ts
import { decode, encode } from "@sandcastle/acp-transport";

export function handleConnection(ws: WebSocket) {
  let session: BrokerSession | null = null;

  ws.on("message", data => {
    const text = typeof data === "string" ? data : data.toString("utf8");
    let env;
    try { env = decode(text); } catch { return; }

    switch (env.kind) {
      case "acp": {
        if (!session) {
          // Lazy spawn on first ACP frame (assumed to be `initialize`).
          // In production: require a prior `control.hello` and bind userId from token.
          session = new BrokerSession("dev-user", buildAgentEnv("dev-user"));
          session.attach(ws);
        }
        session.sendFromClient(env.payload);
        break;
      }
      case "control": {
        switch (env.type) {
          case "hello":  /* verify token, reply with capabilities */ break;
          case "resume": /* look up session by id, attach with `since` */ break;
          case "heartbeat":
            ws.send(encode({ kind: "control", type: "heartbeat_ack", payload: {} }));
            break;
        }
        break;
      }
      case "git": /* future */ break;
    }
  });

  ws.on("close", () => session?.detach());
  ws.on("error", () => session?.detach());
}
```

### 6.4 Electron client (main process)

```ts
// apps/desktop/src/main/acp-client.ts
import WebSocket from "ws";
import * as acp from "@agentclientprotocol/sdk";
import { wsAcpStream, encode } from "@sandcastle/acp-transport";

const ws = new WebSocket("wss://relay.sandcastle.dev/acp", {
  headers: { Authorization: `Bearer ${token}` },
});
await new Promise(r => ws.once("open", r));

let lastSeq = 0;
const onNonAcp = (env) => {
  if (env.kind === "control") handleControl(env);
  // else if (env.kind === "git") ...
};

// Wrap the stream so we (a) tag each inbound ACP envelope's seq, (b) emit envelopes outbound.
const stream = wsAcpStream(ws, onNonAcp, env => { if (env.seq) lastSeq = env.seq; });

const conn = new acp.ClientSideConnection(_a => ({
  async sessionUpdate(p) { sendToRenderer("session-update", p); },
  async requestPermission(p) { return await askRendererForPermission(p); },
  async readTextFile(p)  { return { content: await fs.readFile(p.path, "utf8") }; },
  async writeTextFile(p) { await fs.writeFile(p.path, p.content); return {}; },
}), stream);

// Control: hello before any ACP traffic
ws.send(encode({ kind: "control", type: "hello", id: 1, payload: { token } }));

// On reconnect: send control.resume with our lastSeq before sending any ACP frames
ws.on("open-after-reconnect", () => {
  ws.send(encode({ kind: "control", type: "resume", id: 2, payload: { sessionId, since: lastSeq } }));
});

// Normal ACP usage from here:
const init = await conn.initialize({
  protocolVersion: acp.PROTOCOL_VERSION,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, _meta: { terminal_output: true } },
});
const session = await conn.newSession({ cwd: "/var/sandcastle/wsp/abc", mcpServers: [] });
```

---

## 7. Key things to keep in mind

- **ACP is one channel; everything else gets its own.** Don't smuggle relay control into ACP frames or ACP into control messages. Adding a feature == adding a channel or message type, not bending an existing one.
- **Inside the ACP channel, the relay is a passthrough.** Anything that requires the relay to *understand* the conversation is a smell. The agent and the client SDK already understand it.
- **Sequence numbers are envelope-level, not payload-level.** `seq` lives on the envelope; ACP payloads are unmodified. The buffer stores envelopes, not raw agent stdout.
- **The agent process must outlive the WS.** That's the whole point of mid-stream reconnect. Don't tear the agent down on `ws.close` — start the grace timer instead. Don't `session/cancel` on disconnect either.
- **Buffer the right direction.** Server→client envelopes are buffered for replay. Client→server envelopes are not — if a `session/prompt` was in flight when the WS dropped, it was lost; the client retries with the same `messageId` if dedup matters.
- **Replay drains before live resumes.** Never interleave buffered and live frames during a `control.resume`; pause the live forward, drain, then unpause.
- **Buffer is bounded.** Cap by count and bytes, TTL after last write. Overflow trims the oldest; if the client's `since` falls below `oldestSeq`, force a hard reconnect (`session/load`).
- **One attached WS per session in v1.** A second attach gets `slot_occupied`. Build the `force_takeover` flow once UX needs it.
- **Stdout discipline.** One stray byte from the agent's stderr leaking to stdout, or one log line in the relay accidentally going to the WS, breaks the framing for the entire session. Always test with full streaming traces.
- **Per-user `CLAUDE_CONFIG_DIR` + locked-down env.** The agent process inherits only what we give it; default-deny.
- **Capability rewriting is allowed but logged.** If the relay strips `claude-ai-login` from `authMethods`, it should be auditable.
- **Don't try to host multiple users in one agent process.** It's a single-tenant binary by design; the cost of an extra Node process per attached WS is acceptable.
- **Schema is the source of truth.** `node_modules/@agentclientprotocol/sdk/schema/schema.json` is canonical. The TS types in `dist/schema/types.gen.d.ts` are generated from it.
- **Don't fight the agent on session ownership.** Session IDs are issued by the agent (or echoed from `session/load`); the relay maps them to userIds but never invents them.
- **Cancellation is a notification, not a request.** Don't await it; just send.
- **`session/load` replays history.** The client must be ready for a flood of `session/update`s on a hard reconnect, separate from any `control.resume` replay.
- **Future channels (`git`, `fs`, …) get the same buffering treatment if their semantics need it.** Pick per-channel: replayable vs ephemeral, buffered vs not. Document the choice when adding a channel.
- **The envelope is a forever-public contract.** Any change to `kind`, `seq`, or `payload` field shapes is a breaking change. Add new fields, never repurpose old ones.
