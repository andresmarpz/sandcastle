# Backend Implementation Plan - Chat Streaming (Effect RPC)

This document contains fine-grained implementation tickets for completing the backend chat streaming architecture. Each ticket is self-contained and can be picked up by future Claude sessions.

**Reference documents:**

- `docs/chat-streaming-effect.md` - Architecture specification
- `docs/effect-rpc-stream.md` - Effect RPC streaming patterns

---

## Current State Assessment

### Completed (✅)

| Component | Location | Status |
|-----------|----------|--------|
| RPC Schema (5 endpoints) | `packages/rpc/src/chat/` | Complete |
| SessionHub Service | `apps/http/src/services/session-hub/` | Complete |
| Claude Adapter (transformer, accumulator) | `apps/http/src/adapters/claude/` | Complete |
| Storage Layer (messages, turns, cursors) | `packages/storage/` | Complete |
| RPC Handlers (chat operations) | `apps/http/src/handlers/chat.ts` | Complete |
| Server Composition (HTTP RPC) | `apps/http/src/server.ts` | Complete |

### Pending (❌)

| Component | Priority | Blocker For |
|-----------|----------|-------------|
| WebSocket upgrade route (`/ws`) | High | Frontend WebSocket client |
| Message history endpoint | High | Initial page load |
| Server-level error logging | Medium | Production debugging |
| Graceful shutdown (scope cleanup) | Medium | Server reliability |
| Integration tests | Low | CI/CD pipeline |

---

## Tickets

### TICKET-001: Add WebSocket Upgrade Route

**Context:**
The current server (`apps/http/src/server.ts`) only exposes HTTP RPC at `/api/rpc` using `RpcServer.layerProtocolHttp`. The streaming architecture document specifies WebSocket transport for real-time streaming with automatic reconnection and heartbeat.

**Current State:**

- Server uses `BunHttpServer.layer` with HTTP-only routing
- RPC uses `RpcSerialization.layerNdjson` (works with both HTTP and WebSocket)
- No WebSocket handler exists

**Goal:**
Add a `/ws` route that upgrades HTTP connections to WebSocket and wires them to the same `SandcastleRpc` router via Effect's socket protocol.

**Implementation Approach:**

1. Use Bun's native `websocket` option in `Bun.serve()` configuration
2. Create an Effect Socket adapter from Bun's WebSocket
3. Use `RpcServer.makeSocketProtocol(router)` to get the socket handler
4. Wire the socket handler to the Bun WebSocket callbacks (open, message, close)

**Key Files:**

- `apps/http/src/server.ts` - Add WebSocket upgrade handling
- May need new file: `apps/http/src/websocket.ts` - Socket adapter logic

**Reference:**

- `docs/effect-rpc-stream.md` Section 2.4 (Socket Protocol)
- `docs/chat-streaming-effect.md` Section "WebSocket Server Setup (Bun)"

**Acceptance Criteria:**

- [ ] WebSocket connections accepted at `/ws` path
- [ ] RPC calls routed correctly over WebSocket
- [ ] `chat.subscribe` streams events over WebSocket
- [ ] Heartbeat (ping/pong) working via Effect RPC protocol
- [ ] Existing HTTP RPC at `/api/rpc` continues to work

---

### TICKET-002: Add Message History RPC Endpoint

**Context:**
The streaming architecture document specifies that clients need to fetch message history on initial load before subscribing to real-time events. The storage layer has `chatMessages.listBySession()` and `chatMessages.getMessagesSince()` methods, but no RPC endpoint exposes them.

**Current State:**

- Storage service has `chatMessages.listBySession(sessionId)` returning `ChatMessage[]`
- Storage service has `chatMessages.getMessagesSince(sessionId, afterMessageId?)` for cursor-based loading
- No RPC or HTTP endpoint exposes message history

**Goal:**
Add an RPC endpoint `chat.getHistory` (or equivalent HTTP endpoint) for fetching persisted messages.

**Implementation Approach:**

**Option A: RPC Endpoint (Recommended)**

1. Add `chat.getHistory` to `packages/rpc/src/chat/schema.ts`:

   ```
   Payload: { sessionId: string, afterMessageId?: string, limit?: number }
   Success: { messages: ChatMessage[], hasMore: boolean }
   Error: ChatSessionNotFoundRpcError
   ```

2. Add handler in `apps/http/src/handlers/chat.ts` calling `storage.chatMessages.getMessagesSince()`

**Option B: REST Endpoint**

1. Add custom route `GET /api/sessions/:id/messages` in `server.ts`
2. Parse query params: `?after=<messageId>&limit=<n>`
3. Return JSON array of ChatMessage

**Key Files:**

- `packages/rpc/src/chat/schema.ts` - Add RPC definition
- `apps/http/src/handlers/chat.ts` - Add handler
- `packages/schemas/src/index.ts` - Ensure `ChatMessage` is exported

**Acceptance Criteria:**

- [ ] Clients can fetch historical messages by session ID
- [ ] Cursor-based pagination supported (afterMessageId)
- [ ] Limit parameter controls response size
- [ ] Response includes `hasMore` flag for pagination UI
- [ ] Error returned for non-existent session

---

### TICKET-003: Add Structured Error Logging

**Context:**
The current server has basic console logging for request/response (`LoggingMiddleware`), but lacks structured error logging for stream failures, SDK errors, and system issues.

**Current State:**

- `LoggingMiddleware` logs HTTP method, URL, status, duration
- Errors in SessionHub are caught but not logged (silently swallowed in some cases)
- No correlation between RPC requests and errors

**Goal:**
Add structured error logging with context (session ID, turn ID, error type) for production debugging.

**Implementation Approach:**

1. Create a logging service or use Effect's built-in logging
2. Add error logging to SessionHub:
   - Stream errors in `processStream()`
   - SDK errors in `startStreaming()`
   - Interrupt failures in `interrupt()`
3. Include context: `{ sessionId, turnId, errorType, message, stack }`
4. Consider log levels: ERROR for failures, WARN for interrupts, INFO for completions

**Key Files:**

- `apps/http/src/services/session-hub/live.ts` - Add error logging calls
- `apps/http/src/server.ts` - Configure Effect logger
- May need new file: `apps/http/src/logging.ts` - Logging configuration

**Reference:**

- Effect's `Logger` service and `Effect.logError`

**Acceptance Criteria:**

- [ ] Stream errors logged with session context
- [ ] SDK initialization failures logged
- [ ] Interrupt operations logged (success and failure)
- [ ] Log output is structured JSON (for log aggregation)
- [ ] Log level configurable via environment variable

---

### TICKET-004: Implement Graceful Server Shutdown

**Context:**
The server needs to cleanly handle shutdown signals (SIGTERM, SIGINT) to avoid leaving orphaned connections, running fibers, or corrupted state.

**Current State:**

- Server starts via `BunRuntime.runMain(Layer.launch(ServerLive))`
- No explicit shutdown handling
- SessionHub holds in-memory state (sessions map, fibers)
- Running Claude SDK streams may be orphaned on shutdown

**Goal:**
Implement graceful shutdown that:

1. Stops accepting new connections
2. Completes in-flight requests (with timeout)
3. Interrupts running stream fibers
4. Persists partial progress before exit

**Implementation Approach:**

1. Use Effect's `addFinalizer` in SessionHub to register cleanup
2. Implement cleanup function that:
   - Iterates all active sessions
   - Calls `interrupt()` on streaming sessions
   - Waits for fibers to complete (with timeout)
3. Configure Bun server shutdown timeout
4. Handle SIGTERM/SIGINT signals

**Key Files:**

- `apps/http/src/services/session-hub/live.ts` - Add finalizer
- `apps/http/src/server.ts` - Signal handling

**Acceptance Criteria:**

- [ ] Server handles SIGTERM gracefully
- [ ] Running streams interrupted on shutdown
- [ ] Partial messages persisted before exit
- [ ] Shutdown completes within timeout (e.g., 30s)
- [ ] Clean exit code (0) on graceful shutdown

---

### TICKET-005: Add WebSocket Connection Health Check

**Context:**
The RPC protocol includes built-in heartbeat (10s ping/pong), but we need visibility into connection health for debugging and monitoring.

**Current State:**

- Effect RPC handles heartbeat automatically when using socket protocol
- No metrics or logging for connection health
- No way to diagnose client disconnection issues

**Goal:**
Add connection health monitoring with metrics and logging.

**Implementation Approach:**

1. Track WebSocket connection count (active, total)
2. Log connection events (open, close, error) with client info
3. Optionally expose metrics endpoint (e.g., `/api/metrics`)
4. Consider adding connection ID for debugging

**Key Files:**

- `apps/http/src/websocket.ts` (created in TICKET-001)
- `apps/http/src/server.ts` - Metrics endpoint

**Acceptance Criteria:**

- [ ] Connection open/close events logged
- [ ] Active connection count tracked
- [ ] Error events logged with details
- [ ] Metrics endpoint returns connection stats (optional)

**Dependencies:**

- TICKET-001 (WebSocket route)

---

### TICKET-006: Handle Session Deletion During Active Streaming

**Context:**
The streaming architecture document mentions handling `SessionDeleted` event, but the current implementation doesn't handle the case where a session is deleted while clients are subscribed.

**Current State:**

- Sessions RPC has `session.delete` that removes from storage
- SessionHub has in-memory session state
- No coordination between deletion and active subscriptions

**Goal:**
When a session is deleted, notify all active subscribers and clean up.

**Implementation Approach:**

1. Add `SessionDeleted` event type to `SessionEvent` union (packages/schemas)
2. Add `deleteSession` method to SessionHub that:
   - Broadcasts `SessionDeleted` to all subscribers
   - Interrupts any active stream
   - Removes session from in-memory map
3. Call `sessionHub.deleteSession()` from `session.delete` RPC handler

**Key Files:**

- `packages/schemas/src/index.ts` - Add SessionDeleted event
- `apps/http/src/services/session-hub/live.ts` - Add deleteSession method
- `apps/http/src/services/session-hub/service.ts` - Add interface method
- `apps/http/src/handlers/sessions.ts` - Call deleteSession on delete

**Acceptance Criteria:**

- [ ] `SessionDeleted` event defined in schema
- [ ] Active subscribers receive deletion notification
- [ ] Running streams interrupted on deletion
- [ ] In-memory session state cleaned up
- [ ] Storage deletion still works as before

---

### TICKET-007: Add Turn Management RPC Endpoints

**Context:**
The storage layer has turn management (`turns.create`, `turns.complete`, `turns.listBySession`) but these are internal. For debugging and admin purposes, exposing turn data via RPC may be useful.

**Current State:**

- Turns created internally by SessionHub on `sendMessage`
- Turns completed internally on stream end
- No RPC endpoint to query turn history

**Goal:**
Add RPC endpoint to list turns for a session (read-only, for debugging).

**Implementation Approach:**

1. Add `session.listTurns` to SessionRpc schema:

   ```
   Payload: { sessionId: string }
   Success: { turns: Turn[] }  // id, status, startedAt, completedAt, reason
   Error: SessionNotFoundRpcError
   ```

2. Add handler calling `storage.turns.listBySession()`

**Key Files:**

- `packages/rpc/src/sessions/schema.ts` - Add RPC definition
- `apps/http/src/handlers/sessions.ts` - Add handler
- `packages/schemas/src/index.ts` - Add/export Turn type

**Priority:** Low (nice-to-have for debugging)

**Acceptance Criteria:**

- [ ] Turn history queryable via RPC
- [ ] Returns turn status, timestamps, completion reason
- [ ] Error returned for non-existent session

---

### TICKET-008: Integration Tests for Chat Streaming

**Context:**
The SessionHub has complex state management (streaming, queuing, interruption, catch-up) that needs automated testing.

**Current State:**

- Unit test for MessageAccumulator exists (`message-accumulator.test.ts`)
- No integration tests for SessionHub
- No tests for RPC handlers

**Goal:**
Add integration tests covering key streaming scenarios.

**Test Scenarios:**

1. **Basic flow:** Send message → receive events → stream completes
2. **Queuing:** Send while streaming → queued → auto-dequeued
3. **Interruption:** Send message → interrupt → partial saved
4. **Catch-up:** Subscribe mid-stream → receive buffer + live events
5. **Multi-client:** Two subscribers → both receive same events
6. **Error handling:** SDK error → error event → session idle

**Implementation Approach:**

1. Create test file: `apps/http/src/services/session-hub/live.test.ts`
2. Use Effect's testing utilities (`TestContext`, mocks)
3. Mock `ClaudeSDKService` to simulate SDK responses
4. Assert on storage writes and PubSub events

**Key Files:**

- `apps/http/src/services/session-hub/live.test.ts` (new)
- May need mock: `apps/http/src/agents/claude/mock.ts`

**Acceptance Criteria:**

- [ ] Tests run via `bun test`
- [ ] All 6 scenarios covered
- [ ] Claude SDK properly mocked
- [ ] Tests are deterministic (no flaky timeouts)

---

## Implementation Order

**Phase 1: Core Functionality (Blockers for Frontend)**

1. TICKET-002 - Message History Endpoint (required for initial load)
2. TICKET-001 - WebSocket Route (required for real-time streaming)

**Phase 2: Production Readiness**
3. TICKET-003 - Structured Error Logging
4. TICKET-004 - Graceful Server Shutdown
5. TICKET-006 - Session Deletion Handling

**Phase 3: Polish**
6. TICKET-005 - WebSocket Health Check
7. TICKET-007 - Turn Management RPC
8. TICKET-008 - Integration Tests

---

## Architecture Notes

### Layer Composition

```
ServerLive
├── RpcLayer
│   ├── ChatRpcHandlersLive
│   │   └── SessionHubLive
│   │       ├── StorageServiceDefault
│   │       └── ClaudeSDKServiceLive
│   ├── SessionRpcHandlersLive
│   │   └── StorageServiceDefault
│   ├── WorktreeRpcHandlersLive
│   │   └── StorageServiceDefault
│   ├── RepositoryRpcHandlersLive
│   │   └── StorageServiceDefault
│   └── FilesRpcHandlersLive
│       └── StorageServiceDefault
├── HttpProtocol (NDJSON RPC at /api/rpc)
├── WebSocketProtocol (NDJSON RPC at /ws) [TICKET-001]
├── CustomRoutes (/api/health)
└── BunHttpServer (port binding)
```

### SessionHub State per Session

```
SessionState
├── statusRef: "idle" | "streaming"
├── activeTurnIdRef: string | null
├── bufferRef: ChatStreamEvent[]        // Current turn only
├── queueRef: QueuedMessage[]           // Pending messages
├── historyCursorRef: HistoryCursor     // Last persisted
├── pubsub: PubSub<SessionEvent>        // Fan-out to subscribers
├── fiberRef: Fiber | null              // Running stream processor
├── queryHandleRef: QueryHandle | null  // Claude SDK handle
├── accumulatorRef: MessageAccumulator  // For persistence
├── streamStateRef: StreamState         // Transformer state
└── claudeSessionIdRef: string | null   // For resume
```

### RPC Endpoints Summary

| Endpoint | Type | SessionHub Method | Returns |
|----------|------|-------------------|---------|
| `chat.subscribe` | Stream | `subscribe()` | `Stream<SessionEvent>` |
| `chat.send` | Unary | `sendMessage()` | `SendMessageResult` |
| `chat.interrupt` | Unary | `interrupt()` | `InterruptResult` |
| `chat.dequeue` | Unary | `dequeueMessage()` | `DequeueResult` |
| `chat.getState` | Unary | `getState()` | `SessionSnapshot` |
| `chat.getHistory` | Unary | (storage direct) | `ChatMessage[]` [TICKET-002] |
