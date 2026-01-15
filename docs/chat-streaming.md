# Chat Streaming Architecture

This document describes Sandcastle's real-time chat streaming architecture using WebSockets. It covers the protocol design, state management, and implementation approach for enabling multiple clients to observe and interact with AI agent sessions.

## Table of Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Architecture](#architecture)
- [WebSocket Protocol](#websocket-protocol)
- [Session State Machine](#session-state-machine)
- [Buffer and Catch-up](#buffer-and-catch-up)
- [Message Queue](#message-queue)
- [Client Subscription Model](#client-subscription-model)
- [Interruption Handling](#interruption-handling)
- [User Message Flow](#user-message-flow)
- [Error Handling](#error-handling)
- [Edge Cases](#edge-cases)
- [Implementation with Effect.ts](#implementation-with-effectts)
- [Frontend Implementation](#frontend-implementation)

---

## Overview

Sandcastle enables multiple clients (webapp, desktop) to connect to a single backend server and observe AI agent sessions in real-time. Sessions run on the server and can be watched, interacted with, and controlled from any connected client.

### Key Characteristics

- **Single server, multi-client**: One backend serves N clients (not designed for 150+ concurrent)
- **Session observation**: Any client can watch any session
- **Collaborative control**: Any client can send messages or interrupt sessions
- **Resumable streams**: Clients can connect mid-stream and catch up on missed events
- **In-memory only**: No Redis or external pub/sub; single server instance

### Deployment / Trust Boundary

This architecture assumes a **single-user, trusted network** deployment. There is **no built-in authentication or authorization**. Access control is expected to be handled externally (localhost, VPN, private LAN). If exposed on a public network, this design is unsafe.

### Why WebSocket Over SSE

We chose WebSocket over Server-Sent Events (SSE) because:

| Concern | SSE | WebSocket |
|---------|-----|-----------|
| Restart notification | Needs separate coordination channel | Native bidirectional |
| Multiple sessions | Multiple connections | Single multiplexed connection |
| Client actions | Separate HTTP requests | Same connection |
| Reconnection | Must open new SSE stream | Just re-subscribe |

The critical issue with SSE: if Client A interrupts a stream and then sends a new message, Client B (with a closed SSE stream) has no way to know a new stream started. WebSocket solves this naturally.

---

## Requirements

### Functional Requirements

1. **Real-time streaming**: Stream AI agent events to all subscribed clients
2. **Mid-stream catch-up**: New subscribers receive buffered events from the current turn
3. **Multi-client interaction**: Any client can send messages or interrupt
4. **Message queuing**: Messages sent during streaming are queued and auto-sent when idle
5. **Graceful interruption**: Interrupt stream, save partial progress, notify all clients

### Non-Functional Requirements

1. **Low complexity**: Simple in-memory state, no external dependencies
2. **Effect.ts native**: Use Effect patterns (PubSub, Fibers, etc.)
3. **Bounded buffers**: Only buffer current turn (cleared on completion)
4. **Horizontal scaling**: Not required (single server)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                    │
│  │   Client A    │  │   Client B    │  │   Client C    │                    │
│  │  (webapp)     │  │  (desktop)    │  │  (webapp)     │                    │
│  │               │  │               │  │               │                    │
│  │  LRU: [s1,s2] │  │  LRU: [s1,s3] │  │  LRU: [s2]    │                    │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                    │
│          │                  │                  │                             │
│          └──────────────────┼──────────────────┘                             │
│                             │ WebSocket (one per client)                     │
└─────────────────────────────┼───────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                          │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      ConnectionManager                                 │  │
│  │  connections: Map<ConnectionId, {                                      │  │
│  │    ws: WebSocket,                                                      │  │
│  │    subscriptions: Set<SessionId>                                       │  │
│  │  }>                                                                    │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         SessionHub                                     │  │
│  │  sessions: Map<SessionId, SessionState>                                │  │
│  │                                                                        │  │
│  │  SessionState = {                                                      │  │
│  │    status: "idle" | "streaming",                                       │  │
│  │    buffer: StreamEnvelope[],       // Current turn events              │  │
│  │    queue: QueuedMessage[],         // Pending messages                 │  │
│  │    subscribers: Set<ConnectionId>, // Who's watching                   │  │
│  │    fiber: Fiber | null,            // Running Claude stream            │  │
│  │    pubsub: PubSub<SessionEvent>,   // Fan-out to subscribers           │  │
│  │  }                                                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Claude Adapter                                    │  │
│  │  - Transforms SDKMessage → ChatStreamEvent                             │  │
│  │  - Accumulates messages for storage                                    │  │
│  │  - Handles tool call correlation                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         SQLite                                         │  │
│  │  - Sessions, Messages (persisted on turn completion)                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **ConnectionManager** | WebSocket lifecycle, routing messages to/from clients |
| **SessionHub** | Session state, subscriptions, event fan-out |
| **Claude Adapter** | SDK translation (see `docs/agent-protocol.md`) |
| **SQLite** | Persistent storage for completed turns |

---

## WebSocket Protocol

### Connection Handshake

Connections are established with a simple handshake. The server sends a `welcome` message on open; clients may optionally send `hello` if they want to verify connectivity.

```
Client → Server: { "type": "hello" }
Server → Client: { "type": "welcome", "connectionId": "conn_abc123" }
```

### Message Types

#### Client → Server

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Connection
// ═══════════════════════════════════════════════════════════════════════════

{ type: "hello" }
{ type: "ping" }

// ═══════════════════════════════════════════════════════════════════════════
// Subscription
// ═══════════════════════════════════════════════════════════════════════════

{ type: "subscribe", sessionId: string }
{ type: "unsubscribe", sessionId: string }

// ═══════════════════════════════════════════════════════════════════════════
// Session Actions
// ═══════════════════════════════════════════════════════════════════════════

// Send a message (auto-subscribes sender; starts streaming if idle, queues if streaming)
{
  type: "send_message",
  sessionId: string,
  content: string,            // Plain-text fallback
  parts?: MessagePart[],      // Optional rich parts (UIMessage-compatible)
  clientMessageId: string  // For optimistic UI correlation
}

// Interrupt current stream
{ type: "interrupt", sessionId: string }

// Remove a message from the queue
{ type: "dequeue_message", sessionId: string, messageId: string }
```

#### Server → Client

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// Connection
// ═══════════════════════════════════════════════════════════════════════════

{ type: "welcome", connectionId: string }
{ type: "pong" }

// ═══════════════════════════════════════════════════════════════════════════
// Subscription Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

// Subscription confirmed with current state (explicit subscribe or implicit on send_message)
{
  type: "subscribed",
  sessionId: string,
  status: "idle" | "streaming",
  activeTurnId?: string,       // Present if streaming
  lastSeq?: number,            // Highest seq included in buffer
  buffer: StreamEnvelope[],    // Current turn events (empty if idle)
  queue: QueuedMessage[],      // Pending messages
  historyCursor: HistoryCursor // Latest persisted message at subscribe time
}

// Unsubscription confirmed
{ type: "unsubscribed", sessionId: string }

// ═══════════════════════════════════════════════════════════════════════════
// Session Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

// Streaming started (new turn beginning)
{ type: "session_started", sessionId: string, turnId: string, messageId: string }

// Streaming stopped
{
  type: "session_stopped",
  sessionId: string,
  turnId: string,
  reason: "completed" | "interrupted" | "error"
}

// Session was deleted (via RPC)
{ type: "session_deleted", sessionId: string }

// ═══════════════════════════════════════════════════════════════════════════
// Stream Events
// ═══════════════════════════════════════════════════════════════════════════

// Individual stream event from Claude adapter
{ type: "event", sessionId: string, turnId: string, seq: number, event: ChatStreamEvent }

// ═══════════════════════════════════════════════════════════════════════════
// Queue Events
// ═══════════════════════════════════════════════════════════════════════════

// Message added to queue
{ type: "message_queued", sessionId: string, message: QueuedMessage }

// Message removed from queue
{ type: "message_dequeued", sessionId: string, messageId: string }

// ═══════════════════════════════════════════════════════════════════════════
// User Message Events
// ═══════════════════════════════════════════════════════════════════════════

// User message accepted and saved (broadcast to all subscribers)
{
  type: "user_message",
  sessionId: string,
  message: {
    id: string,           // Server-generated ID (replaces clientMessageId)
    content: string,
    parts?: MessagePart[],
    clientMessageId: string  // Original client ID for correlation
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════════════════

{ type: "error", sessionId?: string, code: string, message: string }
```

### Data Types

```typescript
interface QueuedMessage {
  id: string;               // Server-generated
  content: string;
  parts?: MessagePart[];
  queuedAt: string;         // ISO timestamp
  clientMessageId?: string; // Optional correlation for optimistic UI
}

interface StreamEnvelope {
  turnId: string;      // Unique per turn
  seq: number;         // Monotonic per turn
  event: ChatStreamEvent;
}

interface HistoryCursor {
  lastMessageId: string | null; // Latest persisted message at subscribe time
  lastMessageAt: string | null; // ISO timestamp
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: string; [key: string]: unknown }; // Extensible for tools/files/etc.

// ChatStreamEvent is defined in @sandcastle/schemas
// See docs/agent-protocol.md for full list
type ChatStreamEvent =
  | StreamEventStart
  | StreamEventTextStart
  | StreamEventTextDelta
  | StreamEventTextEnd
  | StreamEventReasoningStart
  | StreamEventReasoningDelta
  | StreamEventReasoningEnd
  | StreamEventToolInputStart
  | StreamEventToolInputAvailable
  | StreamEventToolOutputAvailable
  | StreamEventToolOutputError
  | StreamEventFinish;
```

---

## Session State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
              ┌──────────┐                                    │
              │   IDLE   │◀───────────────────────────────────┤
              │          │                                    │
              └────┬─────┘                                    │
                   │                                          │
                   │ send_message (queue empty)               │
                   │                                          │
                   ▼                                          │
              ┌──────────┐      completed/interrupted/error   │
              │STREAMING │────────────────────────────────────┘
              │          │
              └────┬─────┘
                   │
                   │ (while streaming)
                   │
                   ▼
         ┌─────────────────────┐
         │  send_message       │──▶ Queue message
         │  interrupt          │──▶ Stop stream, save partial
         │  dequeue_message    │──▶ Remove from queue
         └─────────────────────┘
```

### State Transitions

| Current State | Event | Action | New State |
|--------------|-------|--------|-----------|
| IDLE | `send_message` (queue empty) | Save user message, start Claude stream | STREAMING |
| IDLE | `send_message` (queue has items) | Append to queue, broadcast `message_queued` | IDLE |
| STREAMING | `send_message` | Queue message, broadcast `message_queued` | STREAMING |
| STREAMING | `interrupt` | Call `QueryObject.interrupt()`, save partial, broadcast `session_stopped` | IDLE |
| STREAMING | stream completes | Save messages to DB, clear buffer, broadcast `session_stopped` | IDLE |
| STREAMING | stream errors | Best-effort save, clear buffer, broadcast `session_stopped` | IDLE |
| IDLE (after streaming) | queue not empty | Auto-send first queued message | STREAMING |

### Auto-Send from Queue

When a stream ends (completed, interrupted, or error) and the queue is not empty:

1. Remove first message from queue
2. Broadcast `message_dequeued`
3. Process as new `send_message`
4. Transition to STREAMING

This creates a seamless flow where queued messages are processed in order.

### Serialized Session Updates (Atomicity)

All session state changes (status, queue, buffer, fiber, active turn) must be **serialized per session**. This avoids races between `send_message`, `interrupt`, stream completion, and auto-send. Practically, this means:

- Each session has a single "command loop" that processes actions one at a time.
- All transitions happen within that loop, so updates are atomic from the perspective of other commands.
- External events (stream events, disconnects) enqueue commands instead of mutating state directly.

---

## Buffer and Catch-up

### Buffer Purpose

The buffer stores `StreamEnvelope[]` for the **current turn only**. It enables:

1. **Mid-stream catch-up**: New subscribers receive all events from turn start
2. **Reconnection recovery**: Disconnected clients can catch up

### Buffer Lifecycle

```
Turn Start (send_message accepted)
         │
         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                         BUFFER                               │
    │  [start, text-start, text-delta, text-delta, text-end, ...] │
    │                                                              │
    │  - Append each StreamEnvelope as it's produced              │
    │  - Subscribers receive from buffer on subscribe             │
    │  - Live events also sent to subscribers                     │
    └─────────────────────────────────────────────────────────────┘
         │
         ▼
Turn End (completed/interrupted/error)
         │
         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  1. Accumulator.getMessages() → SQLite                      │
    │  2. Buffer cleared                                          │
    │  3. session_stopped broadcast                               │
    └─────────────────────────────────────────────────────────────┘
```

### Catch-up Flow

When a client subscribes to a session:

```
Client: { type: "subscribe", sessionId: "abc" }
                    │
                    ▼
Server: Check session status
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   status: IDLE            status: STREAMING
        │                       │
        ▼                       ▼
   buffer: []              buffer: [events...]
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
Server: { type: "subscribed", sessionId: "abc", status, buffer, lastSeq, queue, historyCursor }
                    │
                    ▼
Client: Render buffer events (catch-up)
                    │
                    ▼
Client: Continue receiving live { type: "event" } messages
```

**Ordering guarantee**: On subscribe, the server attaches the subscriber, snapshots the buffer, and returns `lastSeq`. Live events always have `seq > lastSeq`, so clients can drop any duplicates with `seq <= lastSeq`.

### History Loading

The buffer only contains the current turn. For full conversation history:

1. Client calls RPC: `GET /api/sessions/:id/messages`
2. Returns `ChatMessage[]` from SQLite (completed turns)
3. Client renders history and remembers `lastMessageId`
4. Client subscribes via WebSocket for current turn + live events
5. Server returns `historyCursor.lastMessageId`
6. If `historyCursor.lastMessageId` is newer than the client's `lastMessageId`, fetch the gap:
   `GET /api/sessions/:id/messages?after=<lastMessageId>`

This separation keeps WebSocket focused on real-time events.

---

## Message Queue

### Purpose

The queue holds messages that arrive while a session is streaming. This enables:

- Queueing follow-up questions without waiting
- Shared queue visible to all subscribers
- Automatic processing when stream completes
- **In-memory only**: queued messages are *not* persisted until executed

### Queue Behavior

| Scenario | Behavior |
|----------|----------|
| Session IDLE, queue empty | Message sent immediately (bypass queue) |
| Session STREAMING | Message added to queue, broadcast `message_queued` (not persisted) |
| Stream completes, queue not empty | Dequeue first, persist as `user_message`, then start stream |
| `dequeue_message` received | Remove from queue, broadcast `message_dequeued` (no persistence) |

### Queue Properties

- **FIFO**: First in, first out
- **Shared**: All subscribers see the same queue
- **No reordering**: Remove and re-add to change order
- **Any client can modify**: Any subscriber can add or remove messages
- **Not persisted**: Only persisted when a queued message begins execution
- **UI correlation**: Include `clientMessageId` in queued items when provided

### Queue Data Structure

```typescript
interface QueuedMessage {
  id: string;        // Server-generated UUID
  content: string;   // Message content
  parts?: MessagePart[];
  queuedAt: string;  // ISO timestamp
  clientMessageId?: string;
}
```

---

## Client Subscription Model

### Client-Side LRU

Each client maintains a local LRU cache of subscribed sessions (max 3). The server does **not** track client identity or enforce limits.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                          │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      LRU Cache (max 3)                                 │  │
│  │                                                                        │  │
│  │  [session_1, session_2, session_3]                                     │  │
│  │       ▲                                                                │  │
│  │       │ Most recently visited                                          │  │
│  │                                                                        │  │
│  │  On visit session_4:                                                   │  │
│  │    1. Unsubscribe from session_3 (oldest)                             │  │
│  │    2. Subscribe to session_4                                          │  │
│  │    3. LRU becomes [session_4, session_1, session_2]                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Client-Side?

| Aspect | Server-Side LRU | Client-Side LRU |
|--------|-----------------|-----------------|
| Client identity | Required (cookies/UUID) | Not needed |
| Reconnection | Server restores subscriptions | Client re-subscribes |
| Multiple tabs | Complex (share identity?) | Simple (independent) |
| Server state | Per-client LRU tracking | Per-connection subscriptions only |

Client-side is simpler: the server only knows "this connection is subscribed to X, Y, Z."

Sending `send_message` implicitly subscribes the sender if needed. Explicit `subscribe` is still required for observers and for receiving `buffer`/`queue` state.
Clients with an LRU should treat `send_message` as a session "visit" to keep unsubscribe behavior consistent.

### Reconnection

When a WebSocket disconnects and reconnects:

1. Client opens new WebSocket
2. Client sends `hello`
3. Client re-subscribes to sessions in its LRU
4. For each subscription, client receives `subscribed` with current state
5. Client clears local "in progress" state, uses buffer for catch-up

---

## Interruption Handling

### Interrupt Flow

```
Client A: { type: "interrupt", sessionId: "abc" }
                    │
                    ▼
Server: session.status === "streaming" ?
                    │
        ┌───────────┴───────────┐
        │ No                    │ Yes
        ▼                       ▼
   Ignore (no-op)         QueryObject.interrupt()
                                │
                                ▼
                         Claude SDK stops
                                │
                                ▼
                         Accumulator.getMessages()
                                │
                                ▼
                         Save partial to SQLite
                                │
                                ▼
                         Clear buffer
                                │
                                ▼
                         Broadcast: { type: "session_stopped", reason: "interrupted" }
                                │
                                ▼
                         Queue not empty?
                                │
                    ┌───────────┴───────────┐
                    │ No                    │ Yes
                    ▼                       ▼
               Stay IDLE              Auto-send first
                                      queued message
```

### Key Points

- **Cannot interrupt IDLE session**: No-op if not streaming
- **Partial progress saved**: Whatever the agent produced is persisted
- **Queue continues**: Interrupting doesn't clear the queue
- **All subscribers notified**: Everyone sees `session_stopped`

---

## User Message Flow

### Sending a Message

Server persists the full user payload (`content` + `parts`) and uses `content` as the model input fallback.
If the sender is not yet subscribed, the server implicitly subscribes it and may emit `subscribed` before `user_message`.

```
Client A: {
  type: "send_message",
  sessionId: "abc",
  content: "Hello",
  parts: [{ type: "text", text: "Hello" }],
  clientMessageId: "temp_123"  // Client-generated for optimistic UI
}
                    │
                    ▼
Server: session.status === "idle" ?
                    │
        ┌───────────┴───────────┐
        │ No (streaming)        │ Yes (idle)
        ▼                       ▼
Queue message (in-memory)  Persist user message to SQLite
Broadcast: message_queued  Broadcast: user_message + session_started
                    │                      │
                    ▼                      ▼
          (later) Dequeued                Start Claude stream
          Persist user message
          Broadcast: message_dequeued + user_message + session_started
                    │
                    ▼
Client A: Replace temp_123 with msg_456 in UI
Client B: Add new message msg_456 to UI
```

### Optimistic UI

1. Client generates a temporary `clientMessageId`
2. Client shows message immediately in UI (optimistic)
3. Server processes and returns real `id` (immediately if idle; when dequeued if queued)
4. Client replaces temporary ID with server ID
5. All clients now have consistent message IDs

---

## Error Handling

### Stream Errors

When the Claude agent stream errors:

1. **Best-effort save**: Accumulator extracts whatever messages exist
2. **Save to SQLite**: Partial turn is persisted
3. **Clear buffer**: Buffer is emptied
4. **Notify subscribers**: `{ type: "session_stopped", reason: "error" }`
5. **No retry**: User must send a new message to continue

**Finish semantics**: `StreamEventFinish` is the canonical per-turn finish signal for the UI. `session_stopped` is a session lifecycle event and should not be mapped to a UI "finish" if one already arrived for the same `turnId`.

### WebSocket Errors

| Error | Handling |
|-------|----------|
| Client disconnects | Remove from session subscriber sets and stop subscriber fibers/outbox |
| Server can't parse message | Send `{ type: "error", code: "PARSE_ERROR" }` |
| Subscribe to non-existent session | Send `{ type: "error", code: "SESSION_NOT_FOUND" }` |
| Action on unsubscribed session | Send `{ type: "error", code: "NOT_SUBSCRIBED" }` (except `send_message`, which auto-subscribes) |

### Server Restart

If the server restarts mid-stream:

- **In-memory state is lost**: Buffer, queue, subscriptions gone
- **SQLite persists**: Completed turns are safe
- **Acceptable loss**: Current turn is lost
- **Recovery**: User sends a new message to continue

This is acceptable for a single-server, non-critical application.

---

## Edge Cases

### Decisions Made

| Edge Case | Decision |
|-----------|----------|
| Reconnection with stale state | Client clears local state, fetches fresh history via RPC |
| Duplicate events on reconnect | Client receives full buffer, deduplicates by `turnId` + `seq` |
| Server restart mid-stream | Acceptable loss, user sends new message |
| Session deleted while subscribed | Server sends `session_deleted`, client handles |
| Message sent to IDLE session | Bypass queue, send immediately |
| Interrupt race with queue | Acceptable, queue order preserved |
| Multiple sessions streaming | Fully supported, independent streams |
| Multiple browser tabs | Independent connections, independent subscriptions |
| History gap on initial load | Use `historyCursor` and fetch `/messages?after=<lastMessageId>` |
| `send_message` without prior subscribe | Auto-subscribe sender and proceed; optional `subscribed` response |

### Buffer Deduplication

Since clients receive the full buffer on subscribe (not "events since X"), they may receive duplicates on reconnection. Clients should deduplicate using `turnId` + `seq`:

```typescript
let lastSeqByTurn = new Map<string, number>();

function handleEvent(envelope: StreamEnvelope) {
  const lastSeq = lastSeqByTurn.get(envelope.turnId) ?? -1;
  if (envelope.seq <= lastSeq) return; // Skip duplicate or out-of-order
  lastSeqByTurn.set(envelope.turnId, envelope.seq);
  // Process envelope.event
}
```

This is simple because:
- Buffer is bounded (one turn)
- `seq` is monotonic per turn
- Worst case: re-process ~100 events

---

## Implementation with Effect.ts

### Core Services

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SessionHub Service
// ═══════════════════════════════════════════════════════════════════════════

interface SessionState {
  status: "idle" | "streaming";
  activeTurnId: string | null;
  nextSeq: number;             // Monotonic per turn
  buffer: StreamEnvelope[];
  queue: QueuedMessage[];
  subscribers: Set<string>;  // ConnectionIds
  fiber: Fiber.RuntimeFiber<void, Error> | null;
  pubsub: PubSub.PubSub<SessionEvent>;
}

interface SessionHub {
  // Session state
  getSession(sessionId: string): Effect.Effect<SessionState, SessionNotFoundError>;

  // Subscriptions
  subscribe(sessionId: string, connectionId: string): Effect.Effect<SubscribedResponse>;
  unsubscribe(sessionId: string, connectionId: string): Effect.Effect<void>;

  // Actions
  sendMessage(
    sessionId: string,
    content: string,
    clientMessageId: string,
    parts?: MessagePart[]
  ): Effect.Effect<void>;
  interrupt(sessionId: string): Effect.Effect<void>;
  dequeueMessage(sessionId: string, messageId: string): Effect.Effect<void>;

  // Internal
  broadcast(sessionId: string, event: SessionEvent): Effect.Effect<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ConnectionManager Service
// ═══════════════════════════════════════════════════════════════════════════

interface ConnectionState {
  ws: WebSocket;
  subscriptions: Set<string>;  // SessionIds
}

interface ConnectionManager {
  // Connection lifecycle
  register(ws: WebSocket): Effect.Effect<string>;  // Returns connectionId
  unregister(connectionId: string): Effect.Effect<void>;

  // Messaging
  send(connectionId: string, message: ServerMessage): Effect.Effect<void>;
  broadcast(connectionIds: Set<string>, message: ServerMessage): Effect.Effect<void>;
  enqueue(connectionId: string, message: ServerMessage): Effect.Effect<void>; // Non-blocking

  // Routing
  handleMessage(connectionId: string, message: ClientMessage): Effect.Effect<void>;
}
```

**Serialization**: All `SessionHub` actions should enqueue `SessionCommand` values into a per-session command queue processed by a single fiber. This ensures atomic state updates and predictable ordering.

### Event Flow with PubSub

```typescript
// Each session has a bounded PubSub for fan-out
const sessionPubSub = yield* PubSub.bounded<SessionEvent>(1024);

// When Claude adapter produces an event:
yield* PubSub.publish(sessionPubSub, { type: "event", turnId, seq, event: chatStreamEvent });

// Each subscriber has a fiber consuming from PubSub and enqueueing to its socket outbox:
const subscriberFiber = yield* Effect.fork(
  PubSub.subscribe(sessionPubSub).pipe(
    Stream.fromQueue,
    Stream.runForEach((event) => connectionManager.enqueue(connectionId, event)),
  )
);
```

Use bounded buffers and a policy for slow consumers (drop oldest, drop latest, or disconnect) to prevent backpressure from stalling the Claude stream.

### Streaming Pipeline

```typescript
// Claude stream → Buffer + Broadcast
const runStream = (sessionId: string, message: string, messageId: string) =>
  Effect.gen(function* () {
    const session = yield* sessionHub.getSession(sessionId);
    const turnId = createTurnId();
    session.activeTurnId = turnId;
    session.nextSeq = 0;
    session.buffer = [];
    const claudeStream = yield* claudeService.query(sessionId, message);

    yield* sessionHub.broadcast(sessionId, { type: "session_started", sessionId, turnId, messageId });

    yield* claudeStream.pipe(
      Stream.tap((sdkMessage) =>
        Effect.gen(function* () {
          // Transform to ChatStreamEvents
          const events = processMessage(sdkMessage, state, config);

          for (const event of events) {
            const envelope = { turnId, seq: session.nextSeq++, event };

            // Add to buffer
            session.buffer.push(envelope);

            // Broadcast to subscribers
            yield* sessionHub.broadcast(sessionId, { type: "event", ...envelope });
          }
        })
      ),
      Stream.runDrain,
    );

    // Stream completed - save and cleanup
    const messages = accumulator.getMessages();
    yield* storage.messages.createMany(messages);
    session.buffer = [];
    session.activeTurnId = null;
    yield* sessionHub.broadcast(sessionId, { type: "session_stopped", sessionId, turnId, reason: "completed" });

    // Auto-send from queue if not empty
    if (session.queue.length > 0) {
      const next = session.queue.shift()!;
      yield* sessionHub.broadcast(sessionId, { type: "message_dequeued", messageId: next.id });
      // Enqueue as a new command to avoid recursive streams
      yield* sessionHub.sendMessage(
        sessionId,
        next.content,
        next.clientMessageId ?? next.id,
        next.parts
      );
    }
  });
```

---

## Frontend Implementation

This section describes the React frontend implementation using the Vercel AI SDK's `useChat()` hook with a custom WebSocket transport.

### Architecture Overview

The frontend uses a **single multiplexed WebSocket connection** shared across all React components. Multiple `useChat()` hook instances can coexist, each filtering events by `sessionId`.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         React App                                            │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │    useChat()     │  │    useChat()     │  │    useChat()     │           │
│  │   session_abc    │  │   session_def    │  │   session_ghi    │           │
│  │                  │  │                  │  │                  │           │
│  │ WebSocketChat-   │  │ WebSocketChat-   │  │ WebSocketChat-   │           │
│  │ Transport        │  │ Transport        │  │ Transport        │           │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘           │
│           │                     │                     │                      │
│           │ filter by           │ filter by           │ filter by            │
│           │ sessionId           │ sessionId           │ sessionId            │
│           │                     │                     │                      │
│  ┌────────▼─────────────────────▼─────────────────────▼─────────────────┐   │
│  │                    WebSocketManager (singleton)                       │   │
│  │                                                                       │   │
│  │  - Single WebSocket connection to server                             │   │
│  │  - sessionHandlers: Map<sessionId, Set<handler>>                     │   │
│  │  - Routes incoming events by sessionId                               │   │
│  │  - Manages subscribe/unsubscribe lifecycle                           │   │
│  └───────────────────────────────┬───────────────────────────────────────┘   │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │ Single WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Server                                          │
│  All events include: { sessionId: "...", type: "event", event: {...} }      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Custom Transport?

The Vercel AI SDK's `useChat()` hook supports a pluggable `ChatTransport` interface. By implementing a custom transport, we get:

| Feature | Benefit |
|---------|---------|
| State management | Automatic message accumulation from AI SDK |
| Tool handling | Built-in tool call/result correlation |
| UI helpers | `status`, `error`, `isLoading` states |
| Message types | `UIMessage` with typed parts |
| Callbacks | `onFinish`, `onToolCall`, `onError` |

We only need to bridge the WebSocket to a `ReadableStream<UIMessageChunk>`.

### Event Mapping

Server `ChatStreamEvent` maps directly to AI SDK `UIMessageChunk`:

| ChatStreamEvent | UIMessageChunk | Notes |
|-----------------|----------------|-------|
| `StreamEventStart` | `start` | Includes `messageId` |
| `StreamEventTextStart` | `text-start` | Includes `id` for correlation |
| `StreamEventTextDelta` | `text-delta` | Includes `id` and `delta` |
| `StreamEventTextEnd` | `text-end` | Includes `id` |
| `StreamEventReasoningStart` | `reasoning-start` | Extended thinking |
| `StreamEventReasoningDelta` | `reasoning-delta` | Extended thinking |
| `StreamEventReasoningEnd` | `reasoning-end` | Extended thinking |
| `StreamEventToolInputStart` | `tool-input-start` | Tool call beginning |
| `StreamEventToolInputAvailable` | `tool-input-available` | Full input ready |
| `StreamEventToolOutputAvailable` | `tool-output-available` | Tool result |
| `StreamEventToolOutputError` | `tool-output-error` | Tool execution failed |
| `StreamEventFinish` | `finish` | Includes `finishReason` |

Each stream message also carries `turnId` + `seq` in the WebSocket envelope to support ordering and deduplication.

### WebSocketManager

Global singleton managing the WebSocket connection and event routing.

```typescript
// lib/websocket-manager.ts
import type { UIMessageChunk } from 'ai';

type SessionEventHandler = (chunk: UIMessageChunk) => void;
type SessionLifecycleHandler = (event: SessionLifecycleEvent) => void;

type StreamEnvelope<T> = {
  turnId: string;
  seq: number;
  event: T;
};

interface SessionLifecycleEvent {
  type: 'session_started' | 'session_stopped' | 'session_deleted';
  sessionId: string;
  turnId?: string;
  reason?: 'completed' | 'interrupted' | 'error';
}

interface SubscribedEvent {
  type: 'subscribed';
  sessionId: string;
  status: 'idle' | 'streaming';
  activeTurnId?: string;
  lastSeq?: number;
  buffer: StreamEnvelope<UIMessageChunk>[];
  queue: QueuedMessage[];
  historyCursor: HistoryCursor;
}

interface HistoryCursor {
  lastMessageId: string | null;
  lastMessageAt: string | null;
}

interface ServerMessage {
  type: string;
  sessionId?: string;
  turnId?: string;
  seq?: number;
  event?: UIMessageChunk;
  activeTurnId?: string;
  lastSeq?: number;
  historyCursor?: HistoryCursor;
  // ... other fields
}

class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private ws: WebSocket | null = null;
  private connectionPromise: Promise<void> | null = null;
  private url: string = '';

  // Event handlers per session
  private streamHandlers = new Map<string, Set<SessionEventHandler>>();
  private lifecycleHandlers = new Map<string, Set<SessionLifecycleHandler>>();
  private subscribeCallbacks = new Map<string, Set<(event: SubscribedEvent) => void>>();
  private lastSeqBySession = new Map<string, { turnId: string; lastSeq: number }>();

  // Reconnection state
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private subscribedSessions = new Set<string>();

  static getInstance(): WebSocketManager {
    if (!this.instance) {
      this.instance = new WebSocketManager();
    }
    return this.instance;
  }

  async connect(url: string): Promise<void> {
    this.url = url;

    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.ws!.send(JSON.stringify({ type: 'hello' }));
        // Re-subscribe to previously subscribed sessions on reconnect
        this.resubscribeAll();
        resolve();
      };

      this.ws.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);
        this.routeMessage(data);
      };

      this.ws.onerror = () => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.connectionPromise = null;
        this.handleDisconnect();
      };
    });

    return this.connectionPromise;
  }

  private routeMessage(data: ServerMessage) {
    const { sessionId } = data;

    switch (data.type) {
      case 'welcome':
        // Connection established
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'subscribed': {
        const callbacks = this.subscribeCallbacks.get(sessionId!);
        if (callbacks) {
          if (data.activeTurnId && typeof (data as any).lastSeq === 'number') {
            this.lastSeqBySession.set(sessionId!, {
              turnId: (data as any).activeTurnId,
              lastSeq: (data as any).lastSeq,
            });
          }
          callbacks.forEach((callback) => callback(data as SubscribedEvent));
          this.subscribeCallbacks.delete(sessionId!);
        }
        break;
      }

      case 'event': {
        // Route stream event to session handlers
        const handlers = this.streamHandlers.get(sessionId!);
        if (handlers && data.event) {
          const turnId = data.turnId ?? '';
          const seq = data.seq ?? -1;
          const last = this.lastSeqBySession.get(sessionId!);

          if (!turnId) {
            handlers.forEach(handler => handler(data.event!));
            break;
          }

          if (!last || last.turnId !== turnId) {
            this.lastSeqBySession.set(sessionId!, { turnId, lastSeq: seq });
            handlers.forEach(handler => handler(data.event!));
            break;
          }

          if (seq > last.lastSeq) {
            this.lastSeqBySession.set(sessionId!, { turnId, lastSeq: seq });
            handlers.forEach(handler => handler(data.event!));
          }
        }
        break;
      }

      case 'session_started':
      case 'session_stopped':
      case 'session_deleted': {
        const lifecycleHandlers = this.lifecycleHandlers.get(sessionId!);
        if (lifecycleHandlers) {
          const event: SessionLifecycleEvent = {
            type: data.type,
            sessionId: sessionId!,
            turnId: (data as any).turnId,
            reason: (data as any).reason,
          };
          lifecycleHandlers.forEach(handler => handler(event));
        }
        break;
      }

      case 'error':
        console.error('[WebSocket] Server error:', data);
        break;
    }
  }

  private handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(this.url), delay);
    }
  }

  private resubscribeAll() {
    for (const sessionId of this.subscribedSessions) {
      this.send({ type: 'subscribe', sessionId });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to stream events for a session.
   * Returns unsubscribe function.
   */
  subscribeToStream(
    sessionId: string,
    handler: SessionEventHandler
  ): () => void {
    if (!this.streamHandlers.has(sessionId)) {
      this.streamHandlers.set(sessionId, new Set());
    }
    this.streamHandlers.get(sessionId)!.add(handler);

    return () => {
      const handlers = this.streamHandlers.get(sessionId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.streamHandlers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Subscribe to lifecycle events for a session.
   * Returns unsubscribe function.
   */
  subscribeToLifecycle(
    sessionId: string,
    handler: SessionLifecycleHandler
  ): () => void {
    if (!this.lifecycleHandlers.has(sessionId)) {
      this.lifecycleHandlers.set(sessionId, new Set());
    }
    this.lifecycleHandlers.get(sessionId)!.add(handler);

    return () => {
      const handlers = this.lifecycleHandlers.get(sessionId);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.lifecycleHandlers.delete(sessionId);
        }
      }
    };
  }

  /**
   * Subscribe to a session on the server.
   * Returns the current session state (status, buffer, queue).
   */
  async subscribeSession(sessionId: string): Promise<SubscribedEvent> {
    if (!this.url) {
      throw new Error('WebSocket URL not set; call connect(url) first');
    }
    await this.connect(this.url);

    return new Promise((resolve) => {
      const callbacks = this.subscribeCallbacks.get(sessionId) ?? new Set();
      callbacks.add(resolve);
      this.subscribeCallbacks.set(sessionId, callbacks);
      this.subscribedSessions.add(sessionId);
      this.send({ type: 'subscribe', sessionId });
    });
  }

  /**
   * Unsubscribe from a session on the server.
   */
  unsubscribeSession(sessionId: string) {
    this.subscribedSessions.delete(sessionId);
    this.send({ type: 'unsubscribe', sessionId });
  }

  /**
   * Send a message through the WebSocket.
   */
  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send, connection not open');
    }
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsManager = WebSocketManager.getInstance();
```

### WebSocketChatTransport

Custom transport implementing the AI SDK's `ChatTransport` interface.

```typescript
// lib/websocket-chat-transport.ts
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai';
import { wsManager } from './websocket-manager';

export class WebSocketChatTransport implements ChatTransport<UIMessage> {
  private sessionId: string;
  private wsUrl: string;

  constructor(sessionId: string, wsUrl: string = 'wss://localhost:3000/ws') {
    this.sessionId = sessionId;
    this.wsUrl = wsUrl;
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    await wsManager.connect(this.wsUrl);
    // send_message auto-subscribes on the server; explicit subscribe is optional

    let unsubscribeStream: (() => void) | null = null;
    let unsubscribeLifecycle: (() => void) | null = null;
    let sawFinish = false;

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // Subscribe to stream events for THIS session only
        unsubscribeStream = wsManager.subscribeToStream(
          this.sessionId,
          (chunk) => {
            if (chunk.type === 'finish') {
              sawFinish = true;
            }
            controller.enqueue(chunk);
          }
        );

        // Subscribe to lifecycle events to know when stream ends
        unsubscribeLifecycle = wsManager.subscribeToLifecycle(
          this.sessionId,
          (event) => {
            if (event.type === 'session_stopped') {
              // Only synthesize finish if the stream never emitted one
              if (!sawFinish) {
                const finishChunk: UIMessageChunk = {
                  type: 'finish',
                  finishReason: event.reason === 'completed' ? 'stop' : 'error',
                };
                controller.enqueue(finishChunk);
              }
              controller.close();
              cleanup();
            }
          }
        );

        // Extract content from the last message
        const lastMessage = messages[messages.length - 1];
        const content = lastMessage.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');

        // Send the message through WebSocket
        wsManager.send({
          type: 'send_message',
          sessionId: this.sessionId,
          content,
          parts: lastMessage.parts,
          clientMessageId: lastMessage.id,
        });

        // Handle abort signal
        abortSignal?.addEventListener('abort', () => {
          wsManager.send({ type: 'interrupt', sessionId: this.sessionId });
          controller.close();
          cleanup();
        });

        function cleanup() {
          unsubscribeStream?.();
          unsubscribeLifecycle?.();
        }
      },

      cancel: () => {
        unsubscribeStream?.();
        unsubscribeLifecycle?.();
      },
    });
  }

  async reconnectToStream({
    chatId,
  }: Parameters<ChatTransport<UIMessage>['reconnectToStream']>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Check if session is currently streaming
    // If so, subscribe and return buffered events + live stream
    try {
      const subscribed = await wsManager.subscribeSession(this.sessionId);

      if (subscribed.status !== 'streaming' || subscribed.buffer.length === 0) {
        return null;
      }

      let unsubscribeStream: (() => void) | null = null;
      let unsubscribeLifecycle: (() => void) | null = null;
      let sawFinish = false;

      return new ReadableStream<UIMessageChunk>({
        start: (controller) => {
          // First, enqueue all buffered events (catch-up)
          for (const envelope of subscribed.buffer) {
            if (envelope.event.type === 'finish') {
              sawFinish = true;
            }
            controller.enqueue(envelope.event);
          }

          // Then subscribe to live events
          unsubscribeStream = wsManager.subscribeToStream(
            this.sessionId,
            (chunk) => {
              if (chunk.type === 'finish') {
                sawFinish = true;
              }
              controller.enqueue(chunk);
            }
          );

          unsubscribeLifecycle = wsManager.subscribeToLifecycle(
            this.sessionId,
            (event) => {
              if (event.type === 'session_stopped') {
                if (!sawFinish) {
                  const finishChunk: UIMessageChunk = {
                    type: 'finish',
                    finishReason: event.reason === 'completed' ? 'stop' : 'error',
                  };
                  controller.enqueue(finishChunk);
                }
                controller.close();
                unsubscribeStream?.();
                unsubscribeLifecycle?.();
              }
            }
          );
        },

        cancel: () => {
          unsubscribeStream?.();
          unsubscribeLifecycle?.();
        },
      });
    } catch {
      return null;
    }
  }
}
```

### React Hook Usage

Using the custom transport with `useChat()`:

```typescript
// components/ChatSession.tsx
import { useChat } from '@ai-sdk/react';
import { useMemo, useEffect } from 'react';
import { WebSocketChatTransport } from '@/lib/websocket-chat-transport';
import { wsManager } from '@/lib/websocket-manager';

interface ChatSessionProps {
  sessionId: string;
}

export function ChatSession({ sessionId }: ChatSessionProps) {
  // Create transport for this specific session (memoized)
  const transport = useMemo(
    () => new WebSocketChatTransport(sessionId),
    [sessionId]
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
  } = useChat({
    id: sessionId,  // Ties hook state to this session
    transport,
    onFinish: ({ message, finishReason }) => {
      console.log('Stream finished:', finishReason);
    },
    onError: (error) => {
      console.error('Stream error:', error);
    },
  });

  // Subscribe to session on mount, unsubscribe on unmount
  useEffect(() => {
    wsManager.subscribeSession(sessionId);
    return () => {
      wsManager.unsubscribeSession(sessionId);
    };
  }, [sessionId]);

  const handleSubmit = (content: string) => {
    sendMessage({
      content,
      // Optional: attach files, metadata, etc.
    });
  };

  const handleInterrupt = () => {
    stop();  // Triggers abort signal → sends interrupt via WebSocket
  };

  return (
    <div>
      {/* Status indicator */}
      {status === 'streaming' && <span>Streaming...</span>}
      {error && <span>Error: {error.message}</span>}

      {/* Messages */}
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong>
          {msg.parts.map((part, i) => (
            <div key={i}>
              {part.type === 'text' && <p>{part.text}</p>}
              {part.type === 'tool-invocation' && (
                <div>
                  Tool: {part.toolInvocation.toolName}
                  {part.toolInvocation.state === 'result' && (
                    <pre>{JSON.stringify(part.toolInvocation.result)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Input */}
      <form onSubmit={(e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem('message') as HTMLInputElement;
        handleSubmit(input.value);
        input.value = '';
      }}>
        <input name="message" placeholder="Type a message..." />
        <button type="submit" disabled={status === 'streaming'}>Send</button>
        {status === 'streaming' && (
          <button type="button" onClick={handleInterrupt}>Stop</button>
        )}
      </form>
    </div>
  );
}
```

### LRU Subscription Manager

Client-side LRU cache for managing subscriptions (max 3 concurrent).

```typescript
// lib/subscription-manager.ts
import { wsManager } from './websocket-manager';

const MAX_SUBSCRIPTIONS = 3;

class SubscriptionManager {
  private lru: string[] = [];  // Most recent first

  /**
   * Visit a session. Subscribes if not already subscribed,
   * evicts oldest if at capacity.
   */
  visit(sessionId: string) {
    // Remove from current position if exists
    const index = this.lru.indexOf(sessionId);
    if (index !== -1) {
      this.lru.splice(index, 1);
    }

    // Add to front (most recent)
    this.lru.unshift(sessionId);

    // Evict oldest if over capacity
    if (this.lru.length > MAX_SUBSCRIPTIONS) {
      const evicted = this.lru.pop()!;
      wsManager.unsubscribeSession(evicted);
    }

    // Subscribe to the visited session
    if (index === -1) {
      wsManager.subscribeSession(sessionId);
    }
  }

  /**
   * Explicitly leave a session (e.g., session deleted).
   */
  leave(sessionId: string) {
    const index = this.lru.indexOf(sessionId);
    if (index !== -1) {
      this.lru.splice(index, 1);
      wsManager.unsubscribeSession(sessionId);
    }
  }

  /**
   * Get currently subscribed sessions.
   */
  getSubscribed(): string[] {
    return [...this.lru];
  }

  /**
   * Re-subscribe all on reconnect.
   */
  resubscribeAll() {
    for (const sessionId of this.lru) {
      wsManager.subscribeSession(sessionId);
    }
  }
}

export const subscriptionManager = new SubscriptionManager();
```

### Loading History

History is loaded via RPC, separate from WebSocket:

```typescript
// hooks/useSessionMessages.ts
import { useQuery } from '@tanstack/react-query';
import { useChat } from '@ai-sdk/react';
import { useMemo } from 'react';
import { WebSocketChatTransport } from '@/lib/websocket-chat-transport';

export function useSessionMessages(sessionId: string) {
  // Load history from RPC
  const { data: history, isLoading } = useQuery({
    queryKey: ['session-messages', sessionId],
    queryFn: () => fetch(`/api/sessions/${sessionId}/messages`).then(r => r.json()),
  });

  // Live streaming via WebSocket
  const transport = useMemo(
    () => new WebSocketChatTransport(sessionId),
    [sessionId]
  );

  const {
    messages: streamingMessages,
    sendMessage,
    status,
    error,
    stop,
  } = useChat({
    id: sessionId,
    transport,
    initialMessages: history ?? [],  // Seed with history
  });

  return {
    messages: streamingMessages,  // Includes history + streaming
    sendMessage,
    status,
    error,
    stop,
    isLoadingHistory: isLoading,
  };
}
```

After subscribing, compare `historyCursor.lastMessageId` with the last history item and fetch any gap using `?after=<lastMessageId>`.

### Multi-Session Multiplexing Flow

How multiple `useChat()` instances share one WebSocket:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Server sends event:                                       │
│  { sessionId: "session_abc", type: "event", event: { type: "text-delta" } } │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WebSocketManager.routeMessage()                           │
│                                                                              │
│  streamHandlers Map:                                                         │
│    "session_abc" → [handler_A, handler_B]  ← Both receive the event         │
│    "session_def" → [handler_C]             ← Does NOT receive (wrong ID)    │
│    "session_ghi" → [handler_D]             ← Does NOT receive (wrong ID)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │ useChat() for     │       │ useChat() for     │
        │ session_abc       │       │ session_abc       │
        │ (Tab 1)           │       │ (Tab 2)           │
        │                   │       │                   │
        │ ReadableStream    │       │ ReadableStream    │
        │ enqueues chunk    │       │ enqueues chunk    │
        └───────────────────┘       └───────────────────┘
```

### Implementation Checklist

| Component | Purpose | Status |
|-----------|---------|--------|
| `WebSocketManager` | Singleton connection, event routing | To implement |
| `WebSocketChatTransport` | AI SDK transport adapter | To implement |
| `SubscriptionManager` | LRU-based subscription management | To implement |
| Event mapping | `ChatStreamEvent` → `UIMessageChunk` | Backend adapter |
| History loading | RPC endpoint for completed messages | Existing |

### Test Plan (MVP)

- **Subscribe/send ordering**: Send `send_message` without prior subscribe → auto-subscribe and start stream; `interrupt` without subscribe → `NOT_SUBSCRIBED`.
- **Reconnect catch-up**: Disconnect mid-stream, reconnect, verify buffer replay + live events with no gaps.
- **Dedup/order**: Ensure `turnId` + `seq` ordering, drop duplicates on resubscribe.
- **Interrupt**: Interrupt mid-stream, verify partial save, `session_stopped` reason, and no stuck UI.
- **Queue semantics**: Send while streaming, verify `message_queued` (no DB write), auto-dequeue and persist on next turn.
- **History reconciliation**: Load history, subscribe, detect `historyCursor` newer than `lastMessageId`, fetch gap.
- **Backpressure**: Simulate slow client; ensure stream ingestion does not stall other subscribers.

### Key Benefits

1. **Reuses AI SDK**: State management, message accumulation, tool handling all work
2. **Single connection**: One WebSocket for all sessions reduces overhead
3. **Clean separation**: Transport is swappable, business logic unchanged
4. **Type safety**: `UIMessageChunk` types flow through the entire pipeline
5. **Reconnection**: Manager handles reconnect, re-subscribes automatically

---

## Summary

| Concern | Solution |
|---------|----------|
| Real-time delivery | WebSocket with per-session PubSub |
| Multi-client sync | Server broadcasts to all subscribers |
| Mid-stream catch-up | Buffer stores current turn events with `turnId` + `seq` |
| Message queuing | FIFO queue with auto-send on idle |
| Interruption | `QueryObject.interrupt()` + partial save |
| Client subscriptions | Client-side LRU (max 3) |
| History loading | RPC separate from WebSocket |
| Error handling | Best-effort save, no retry |
| Frontend state | AI SDK `useChat()` with custom `ChatTransport` |
| WS multiplexing | Single connection, `sessionId`-based routing |

### Key Principles

1. **WebSocket for real-time only**: History comes from RPC
2. **Buffer is ephemeral**: Cleared on turn completion
3. **Server is stateless per-client**: Only connection-scoped state
4. **Simple over clever**: Last-write-wins, no conflict resolution
5. **Effect.ts patterns**: PubSub, Fibers, Streams throughout
6. **Leverage existing libraries**: AI SDK handles message accumulation, tool correlation
7. **Single multiplexed connection**: One WebSocket per client, events routed by sessionId
8. **Serialized session updates**: Per-session command loop avoids races
9. **Ordered stream events**: `turnId` + `seq` enforce deterministic replay
10. **Trusted deployment**: No auth; rely on local/VPN access control
