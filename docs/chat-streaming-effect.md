# Chat Streaming Architecture (Effect RPC)

This document describes Sandcastle's real-time chat streaming architecture using `@effect/rpc` over WebSockets. It covers the RPC schema design, state management, and implementation approach for enabling multiple clients to observe and interact with AI agent sessions.

**Note**: This document supersedes the raw WebSocket approach in `chat-streaming.md`. By using `@effect/rpc`, we eliminate manual protocol handling (seq numbers, reconnection, heartbeat) while keeping the same business logic.

## Table of Contents

- [Overview](#overview)
- [Requirements](#requirements)
- [Architecture](#architecture)
- [RPC Schema](#rpc-schema)
- [Session State Machine](#session-state-machine)
- [Buffer and Catch-up](#buffer-and-catch-up)
- [Message Queue](#message-queue)
- [Client Subscription Model](#client-subscription-model)
- [Interruption Handling](#interruption-handling)
- [User Message Flow](#user-message-flow)
- [Error Handling](#error-handling)
- [Edge Cases](#edge-cases)
- [Server Implementation](#server-implementation)
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

### Why @effect/rpc Over Raw WebSocket

| Concern | Raw WebSocket | @effect/rpc |
|---------|---------------|-------------|
| Protocol definition | Manual message types | Type-safe `Schema.TaggedRequest` |
| Message ordering | Manual `seq` numbers | Handled by RPC protocol |
| Reconnection | Manual exponential backoff | Built-in `retrySchedule` |
| Heartbeat | Manual ping/pong | Built-in 10s interval |
| Serialization | Manual JSON encode/decode | `RpcSerialization.layerNdjson` |
| Streaming | Manual fan-out | `RpcSchema.Stream` + `Mailbox` |
| Type safety | Runtime validation | Compile-time via Schema |
| Backpressure | Manual buffering | `Mailbox` with ack support |

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
2. **Effect.ts native**: Use Effect patterns (RPC, PubSub, Fibers, Mailbox)
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
│  │  RpcClient    │  │  RpcClient    │  │  RpcClient    │                    │
│  │  (auto-retry) │  │  (auto-retry) │  │  (auto-retry) │                    │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                    │
│          │                  │                  │                             │
│          └──────────────────┼──────────────────┘                             │
│                             │ WebSocket (one per client)                     │
│                             │ Protocol: NDJSON-encoded RPC                   │
└─────────────────────────────┼───────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                          │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         RPC Router                                     │  │
│  │                                                                        │  │
│  │  SendMessage      → Effect<SendMessageResult>                         │  │
│  │  SubscribeSession → Effect<Stream<SessionEvent>>   (streaming)        │  │
│  │  Interrupt        → Effect<void>                                      │  │
│  │  DequeueMessage   → Effect<void>                                      │  │
│  │  GetSessionState  → Effect<SessionSnapshot>                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                               │
│                              ▼                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         SessionHub                                     │  │
│  │  sessions: Map<SessionId, SessionState>                                │  │
│  │                                                                        │  │
│  │  SessionState = {                                                      │  │
│  │    status: "idle" | "streaming",                                       │  │
│  │    buffer: ChatStreamEvent[],     // Current turn events               │  │
│  │    queue: QueuedMessage[],        // Pending messages                  │  │
│  │    pubsub: PubSub<SessionEvent>,  // Fan-out to subscribers            │  │
│  │    fiber: Fiber | null,           // Running Claude stream             │  │
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
| **RPC Router** | Request routing, streaming responses, type-safe protocol |
| **SessionHub** | Session state, subscriptions, event fan-out via PubSub |
| **Claude Adapter** | SDK translation (see `docs/agent-protocol.md`) |
| **SQLite** | Persistent storage for completed turns |

### What @effect/rpc Handles Automatically

- **Connection lifecycle**: Open, close, reconnect
- **Heartbeat**: 10-second ping/pong interval
- **Reconnection**: Exponential backoff (500ms initial, 1.5x multiplier, 5s max)
- **Serialization**: NDJSON framing for streaming
- **Request correlation**: Request IDs for matching responses
- **Stream chunking**: Efficient batching of stream events
- **Backpressure**: Acknowledgment-based flow control

---

## RPC Schema

### Request Definitions

```typescript
// packages/schemas/src/rpc/session.ts
import { Schema } from "effect"
import { RpcSchema } from "@effect/rpc"

// ═══════════════════════════════════════════════════════════════════════════
// Data Types
// ═══════════════════════════════════════════════════════════════════════════

export class QueuedMessage extends Schema.Class<QueuedMessage>("QueuedMessage")({
  id: Schema.String,
  content: Schema.String,
  parts: Schema.optional(Schema.Array(MessagePart)),
  queuedAt: Schema.String,  // ISO timestamp
  clientMessageId: Schema.optional(Schema.String),
}) {}

export class HistoryCursor extends Schema.Class<HistoryCursor>("HistoryCursor")({
  lastMessageId: Schema.NullOr(Schema.String),
  lastMessageAt: Schema.NullOr(Schema.String),
}) {}

export class SessionSnapshot extends Schema.Class<SessionSnapshot>("SessionSnapshot")({
  status: Schema.Literal("idle", "streaming"),
  activeTurnId: Schema.NullOr(Schema.String),
  queue: Schema.Array(QueuedMessage),
  historyCursor: HistoryCursor,
}) {}

// ═══════════════════════════════════════════════════════════════════════════
// Session Events (streamed to clients)
// ═══════════════════════════════════════════════════════════════════════════

export const SessionEvent = Schema.Union(
  // Initial state sent at subscription start
  Schema.Struct({
    _tag: Schema.Literal("InitialState"),
    snapshot: SessionSnapshot,
    buffer: Schema.Array(ChatStreamEvent),  // Current turn events for catch-up
  }),

  // Session lifecycle
  Schema.Struct({
    _tag: Schema.Literal("SessionStarted"),
    turnId: Schema.String,
    messageId: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal("SessionStopped"),
    turnId: Schema.String,
    reason: Schema.Literal("completed", "interrupted", "error"),
  }),

  // Stream event from Claude adapter
  Schema.Struct({
    _tag: Schema.Literal("StreamEvent"),
    turnId: Schema.String,
    event: ChatStreamEvent,
  }),

  // Queue events
  Schema.Struct({
    _tag: Schema.Literal("MessageQueued"),
    message: QueuedMessage,
  }),
  Schema.Struct({
    _tag: Schema.Literal("MessageDequeued"),
    messageId: Schema.String,
  }),

  // User message accepted
  Schema.Struct({
    _tag: Schema.Literal("UserMessage"),
    message: Schema.Struct({
      id: Schema.String,
      content: Schema.String,
      parts: Schema.optional(Schema.Array(MessagePart)),
      clientMessageId: Schema.String,
    }),
  }),
)

export type SessionEvent = Schema.Schema.Type<typeof SessionEvent>

// ═══════════════════════════════════════════════════════════════════════════
// RPC Requests
// ═══════════════════════════════════════════════════════════════════════════

// Subscribe to session events (streaming)
export class SubscribeSession extends Schema.TaggedRequest<SubscribeSession>()(
  "SubscribeSession",
  {
    success: RpcSchema.Stream({
      success: SessionEvent,
      failure: Schema.Never,
    }),
    failure: Schema.String,  // SessionNotFound, etc.
    payload: {
      sessionId: Schema.String,
    },
  }
) {}

// Send a message to a session
export class SendMessage extends Schema.TaggedRequest<SendMessage>()(
  "SendMessage",
  {
    success: Schema.Struct({
      // Returns immediately with status
      status: Schema.Literal("started", "queued"),
      messageId: Schema.optional(Schema.String),  // Present if started
      queuedMessage: Schema.optional(QueuedMessage),  // Present if queued
    }),
    failure: Schema.String,
    payload: {
      sessionId: Schema.String,
      content: Schema.String,
      parts: Schema.optional(Schema.Array(MessagePart)),
      clientMessageId: Schema.String,
    },
  }
) {}

// Interrupt a streaming session
export class Interrupt extends Schema.TaggedRequest<Interrupt>()(
  "Interrupt",
  {
    success: Schema.Struct({
      interrupted: Schema.Boolean,  // false if not streaming
    }),
    failure: Schema.String,
    payload: {
      sessionId: Schema.String,
    },
  }
) {}

// Remove a message from the queue
export class DequeueMessage extends Schema.TaggedRequest<DequeueMessage>()(
  "DequeueMessage",
  {
    success: Schema.Struct({
      removed: Schema.Boolean,  // false if not found
    }),
    failure: Schema.String,
    payload: {
      sessionId: Schema.String,
      messageId: Schema.String,
    },
  }
) {}

// Get current session state (non-streaming, for initial load)
export class GetSessionState extends Schema.TaggedRequest<GetSessionState>()(
  "GetSessionState",
  {
    success: SessionSnapshot,
    failure: Schema.String,
    payload: {
      sessionId: Schema.String,
    },
  }
) {}
```

### ChatStreamEvent (from @sandcastle/schemas)

```typescript
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
  | StreamEventFinish
```

### Why This Schema Design

1. **Single streaming endpoint**: `SubscribeSession` returns all session events through one stream
2. **Initial state in stream**: First event is `InitialState` with snapshot + buffer for catch-up
3. **Non-streaming actions**: `SendMessage`, `Interrupt`, `DequeueMessage` are request/response
4. **Type-safe events**: All events are tagged unions, fully typed at compile time
5. **No manual seq numbers**: RPC protocol handles ordering internally

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
                   │ SendMessage (queue empty)                │
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
         │  SendMessage        │──▶ Queue message
         │  Interrupt          │──▶ Stop stream, save partial
         │  DequeueMessage     │──▶ Remove from queue
         └─────────────────────┘
```

### State Transitions

| Current State | RPC Request | Action | New State |
|--------------|-------------|--------|-----------|
| IDLE | `SendMessage` (queue empty) | Save user message, start Claude stream, return `{ status: "started" }` | STREAMING |
| IDLE | `SendMessage` (queue has items) | Append to queue, return `{ status: "queued" }` | IDLE |
| STREAMING | `SendMessage` | Queue message, return `{ status: "queued" }` | STREAMING |
| STREAMING | `Interrupt` | Interrupt fiber, save partial, publish `SessionStopped` | IDLE |
| STREAMING | stream completes | Save messages to DB, clear buffer, publish `SessionStopped` | IDLE |
| STREAMING | stream errors | Best-effort save, clear buffer, publish `SessionStopped` | IDLE |
| IDLE (after streaming) | queue not empty | Auto-send first queued message | STREAMING |

### Auto-Send from Queue

When a stream ends (completed, interrupted, or error) and the queue is not empty:

1. Remove first message from queue
2. Publish `MessageDequeued` to all subscribers
3. Process as new `SendMessage`
4. Transition to STREAMING

This creates a seamless flow where queued messages are processed in order.

### Serialized Session Updates (Atomicity)

All session state changes (status, queue, buffer, fiber, active turn) must be **serialized per session**. This avoids races between `SendMessage`, `Interrupt`, stream completion, and auto-send. Practically, this means:

- Each session has a single "command loop" that processes actions one at a time.
- All transitions happen within that loop, so updates are atomic from the perspective of other commands.
- External events (stream events, disconnects) enqueue commands instead of mutating state directly.

---

## Buffer and Catch-up

### Buffer Purpose

The buffer stores `ChatStreamEvent[]` for the **current turn only**. It enables:

1. **Mid-stream catch-up**: New subscribers receive all events from turn start
2. **Reconnection recovery**: Disconnected clients can catch up

### Buffer Lifecycle

```
Turn Start (SendMessage accepted)
         │
         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                         BUFFER                               │
    │  [start, text-start, text-delta, text-delta, text-end, ...] │
    │                                                              │
    │  - Append each ChatStreamEvent as it's produced             │
    │  - New subscribers receive buffer in InitialState event     │
    │  - Live events published to PubSub                          │
    └─────────────────────────────────────────────────────────────┘
         │
         ▼
Turn End (completed/interrupted/error)
         │
         ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  1. Accumulator.getMessages() → SQLite                      │
    │  2. Buffer cleared                                          │
    │  3. SessionStopped published                                │
    └─────────────────────────────────────────────────────────────┘
```

### Catch-up Flow with RPC Streaming

When a client calls `SubscribeSession`:

```
Client: client(new SubscribeSession({ sessionId: "abc" }))
                    │
                    ▼
Server: Create Mailbox, check session status
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
Server: Yield InitialState event with snapshot + buffer
                    │
                    ▼
Server: Subscribe to PubSub, forward events to Mailbox
                    │
                    ▼
Client: Receives Stream<SessionEvent>
        - First event: InitialState (render buffer for catch-up)
        - Subsequent events: Live events from PubSub
```

### No Manual Deduplication Needed

Unlike the raw WebSocket approach, we don't need manual `seq` numbers:

- **Buffer is snapshot**: On subscribe, client receives current buffer in `InitialState`
- **Live events follow**: PubSub subscription starts after snapshot
- **RPC handles ordering**: Protocol guarantees in-order delivery
- **Reconnection**: Client re-subscribes, gets fresh `InitialState` with current buffer

### History Loading

The buffer only contains the current turn. For full conversation history:

1. Client calls RPC: `GET /api/sessions/:id/messages` (HTTP endpoint)
2. Returns `ChatMessage[]` from SQLite (completed turns)
3. Client renders history and remembers `lastMessageId`
4. Client subscribes via RPC for current turn + live events
5. `InitialState.snapshot.historyCursor.lastMessageId` indicates latest persisted
6. If newer than client's `lastMessageId`, fetch the gap

This separation keeps RPC streaming focused on real-time events.

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
| Session IDLE, queue empty | Message sent immediately (bypass queue), return `{ status: "started" }` |
| Session STREAMING | Message added to queue, return `{ status: "queued" }`, publish `MessageQueued` |
| Stream completes, queue not empty | Dequeue first, persist as user message, publish `MessageDequeued` + `UserMessage` + `SessionStarted` |
| `DequeueMessage` received | Remove from queue, publish `MessageDequeued`, return `{ removed: true }` |

### Queue Properties

- **FIFO**: First in, first out
- **Shared**: All subscribers see the same queue via `MessageQueued`/`MessageDequeued` events
- **No reordering**: Remove and re-add to change order
- **Any client can modify**: Any subscriber can add or remove messages
- **Not persisted**: Only persisted when a queued message begins execution
- **UI correlation**: Include `clientMessageId` for optimistic UI

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
│  │    1. Interrupt stream for session_3 (oldest)                         │  │
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

Client-side is simpler: the server only knows "this connection has N active RPC streams."

### Reconnection with @effect/rpc

The RPC client handles reconnection automatically:

1. WebSocket disconnects
2. RPC client retries with exponential backoff (500ms → 5s max)
3. On reconnect, client re-subscribes to sessions in its LRU
4. Each `SubscribeSession` receives fresh `InitialState` with current buffer
5. Client renders buffer events (catch-up), continues with live events

No manual reconnection logic needed on the client.

---

## Interruption Handling

### Interrupt Flow

```
Client A: client(new Interrupt({ sessionId: "abc" }))
                    │
                    ▼
Server: session.status === "streaming" ?
                    │
        ┌───────────┴───────────┐
        │ No                    │ Yes
        ▼                       ▼
Return { interrupted: false }  Fiber.interrupt(session.fiber)
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
                             Publish: SessionStopped { reason: "interrupted" }
                                    │
                                    ▼
                             Return { interrupted: true }
                                    │
                                    ▼
                             Queue not empty?
                                    │
                    ┌───────────────┴───────────┐
                    │ No                        │ Yes
                    ▼                           ▼
               Stay IDLE                   Auto-send first
                                           queued message
```

### Key Points

- **Cannot interrupt IDLE session**: Returns `{ interrupted: false }`
- **Partial progress saved**: Whatever the agent produced is persisted
- **Queue continues**: Interrupting doesn't clear the queue
- **All subscribers notified**: Everyone receives `SessionStopped` event

---

## User Message Flow

### Sending a Message

Server persists the full user payload (`content` + `parts`) and uses `content` as the model input fallback.

```
Client A: client(new SendMessage({
  sessionId: "abc",
  content: "Hello",
  parts: [{ type: "text", text: "Hello" }],
  clientMessageId: "temp_123"
}))
                    │
                    ▼
Server: session.status === "idle" ?
                    │
        ┌───────────┴───────────┐
        │ No (streaming)        │ Yes (idle)
        ▼                       ▼
Queue message (in-memory)  Persist user message to SQLite
Return { status: "queued" }  Publish: UserMessage + SessionStarted
Publish: MessageQueued       Return { status: "started", messageId }
        │                           │
        ▼                           ▼
(later) Dequeued               Start Claude stream
Persist user message
Publish: MessageDequeued + UserMessage + SessionStarted
        │
        ▼
Client A: Replace temp_123 with msg_456 in UI
Client B: Add new message msg_456 to UI (via UserMessage event)
```

### Optimistic UI

1. Client generates a temporary `clientMessageId`
2. Client shows message immediately in UI (optimistic)
3. `SendMessage` returns `{ status: "started" | "queued" }`
4. Client receives `UserMessage` event with real `id` and `clientMessageId`
5. Client replaces temporary ID with server ID
6. All clients now have consistent message IDs

---

## Error Handling

### Stream Errors

When the Claude agent stream errors:

1. **Best-effort save**: Accumulator extracts whatever messages exist
2. **Save to SQLite**: Partial turn is persisted
3. **Clear buffer**: Buffer is emptied
4. **Notify subscribers**: Publish `SessionStopped { reason: "error" }`
5. **No retry**: User must send a new message to continue

**Finish semantics**: `StreamEventFinish` is the canonical per-turn finish signal for the UI. `SessionStopped` is a session lifecycle event and should not be mapped to a UI "finish" if one already arrived for the same `turnId`.

### RPC Errors

| Error | Handling |
|-------|----------|
| Client disconnects | RPC protocol cleans up, Mailbox scope closes |
| Subscribe to non-existent session | RPC returns failure: `"SESSION_NOT_FOUND"` |
| SendMessage to non-existent session | RPC returns failure: `"SESSION_NOT_FOUND"` |
| Interrupt non-existent session | RPC returns failure: `"SESSION_NOT_FOUND"` |

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
| Reconnection with stale state | Client clears local state, re-subscribes, receives fresh `InitialState` |
| Server restart mid-stream | Acceptable loss, user sends new message |
| Session deleted while subscribed | Publish `SessionDeleted` event (future: add to schema) |
| Message sent to IDLE session | Bypass queue, send immediately |
| Interrupt race with queue | Acceptable, queue order preserved |
| Multiple sessions streaming | Fully supported, independent streams |
| Multiple browser tabs | Independent RPC clients, independent subscriptions |
| History gap on initial load | Use `historyCursor` and fetch `/messages?after=<lastMessageId>` |
| Slow client backpressure | Mailbox with bounded capacity, RPC ack support |

---

## Server Implementation

### RPC Router Setup

```typescript
// apps/http/src/rpc/session-router.ts
import { Effect, Stream, PubSub, Mailbox } from "effect"
import { Rpc, RpcRouter } from "@effect/rpc"
import {
  SubscribeSession,
  SendMessage,
  Interrupt,
  DequeueMessage,
  GetSessionState,
  SessionEvent,
} from "@sandcastle/schemas/rpc/session"
import { SessionHub } from "../services/session-hub"

export const sessionRouter = RpcRouter.make(
  // ═══════════════════════════════════════════════════════════════════════════
  // Subscribe to session events (streaming)
  // ═══════════════════════════════════════════════════════════════════════════
  Rpc.effect(SubscribeSession, (req) =>
    Effect.gen(function* () {
      const hub = yield* SessionHub
      const session = yield* hub.getSession(req.sessionId)

      // Create mailbox for this subscriber
      const mailbox = yield* Mailbox.make<SessionEvent>()

      // Send initial state with buffer for catch-up
      yield* mailbox.offer({
        _tag: "InitialState",
        snapshot: {
          status: session.status,
          activeTurnId: session.activeTurnId,
          queue: session.queue,
          historyCursor: session.historyCursor,
        },
        buffer: session.buffer,
      })

      // Subscribe to session PubSub and forward to mailbox
      yield* PubSub.subscribe(session.pubsub).pipe(
        Stream.fromQueue,
        Stream.runForEach((event) => mailbox.offer(event)),
        Effect.forkScoped  // Runs until client disconnects
      )

      // Return mailbox - RPC streams its contents
      return mailbox
    })
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // Send a message
  // ═══════════════════════════════════════════════════════════════════════════
  Rpc.effect(SendMessage, (req) =>
    Effect.gen(function* () {
      const hub = yield* SessionHub
      return yield* hub.sendMessage(
        req.sessionId,
        req.content,
        req.clientMessageId,
        req.parts
      )
    })
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // Interrupt streaming
  // ═══════════════════════════════════════════════════════════════════════════
  Rpc.effect(Interrupt, (req) =>
    Effect.gen(function* () {
      const hub = yield* SessionHub
      const interrupted = yield* hub.interrupt(req.sessionId)
      return { interrupted }
    })
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // Remove from queue
  // ═══════════════════════════════════════════════════════════════════════════
  Rpc.effect(DequeueMessage, (req) =>
    Effect.gen(function* () {
      const hub = yield* SessionHub
      const removed = yield* hub.dequeueMessage(req.sessionId, req.messageId)
      return { removed }
    })
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // Get current state (non-streaming)
  // ═══════════════════════════════════════════════════════════════════════════
  Rpc.effect(GetSessionState, (req) =>
    Effect.gen(function* () {
      const hub = yield* SessionHub
      const session = yield* hub.getSession(req.sessionId)
      return {
        status: session.status,
        activeTurnId: session.activeTurnId,
        queue: session.queue,
        historyCursor: session.historyCursor,
      }
    })
  ),
)
```

### SessionHub Service

```typescript
// apps/http/src/services/session-hub.ts
import { Effect, Context, PubSub, Fiber, Ref } from "effect"
import type { SessionEvent, QueuedMessage, HistoryCursor } from "@sandcastle/schemas"

interface SessionState {
  status: "idle" | "streaming"
  activeTurnId: string | null
  buffer: ChatStreamEvent[]
  queue: QueuedMessage[]
  historyCursor: HistoryCursor
  pubsub: PubSub.PubSub<SessionEvent>
  fiber: Fiber.RuntimeFiber<void, Error> | null
}

interface SessionHub {
  getSession(sessionId: string): Effect.Effect<SessionState, SessionNotFoundError>

  sendMessage(
    sessionId: string,
    content: string,
    clientMessageId: string,
    parts?: MessagePart[]
  ): Effect.Effect<{ status: "started" | "queued"; messageId?: string; queuedMessage?: QueuedMessage }>

  interrupt(sessionId: string): Effect.Effect<boolean>

  dequeueMessage(sessionId: string, messageId: string): Effect.Effect<boolean>

  // Internal: publish event to all subscribers
  broadcast(sessionId: string, event: SessionEvent): Effect.Effect<void>
}

export class SessionHub extends Context.Tag("SessionHub")<SessionHub, SessionHub>() {}
```

### WebSocket Server Setup (Bun)

```typescript
// apps/http/src/websocket.ts
import { Effect, Layer } from "effect"
import { RpcServer, RpcSerialization } from "@effect/rpc"
import { BunSocket } from "@effect/platform-bun"
import { sessionRouter } from "./rpc/session-router"

export const createWebSocketHandler = Effect.gen(function* () {
  // Create RPC protocol handler
  const { onSocket } = yield* RpcServer.makeSocketProtocol(sessionRouter)

  return {
    open(ws: ServerWebSocket) {
      // Wrap Bun WebSocket in Effect Socket
      const socket = BunSocket.fromWebSocket(ws)

      // Run RPC protocol - handles entire lifecycle
      Effect.runFork(
        Effect.scoped(onSocket(socket)).pipe(
          Effect.provide(RpcSerialization.layerNdjson),
          Effect.provide(SessionHubLive),
          Effect.provide(StorageLive),
          Effect.provide(ClaudeServiceLive),
        )
      )
    },

    message(ws: ServerWebSocket, data: string | Buffer) {
      // Socket adapter handles this internally
    },

    close(ws: ServerWebSocket, code: number, reason: string) {
      // Socket adapter handles cleanup
    },
  }
})

// Bun.serve integration
Bun.serve({
  port: 3000,
  websocket: await Effect.runPromise(createWebSocketHandler),
  fetch(req, server) {
    if (req.url.endsWith("/ws")) {
      const upgraded = server.upgrade(req)
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 })
      }
      return undefined
    }
    // Handle HTTP routes...
  },
})
```

---

## Frontend Implementation

This section describes the React frontend implementation using `@effect/rpc` client with the Vercel AI SDK's `useChat()` hook.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         React App                                            │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │    useChat()     │  │    useChat()     │  │    useChat()     │           │
│  │   session_abc    │  │   session_def    │  │   session_ghi    │           │
│  │                  │  │                  │  │                  │           │
│  │ RpcChatTransport │  │ RpcChatTransport │  │ RpcChatTransport │           │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘           │
│           │                     │                     │                      │
│           └─────────────────────┼─────────────────────┘                      │
│                                 │                                            │
│  ┌──────────────────────────────▼───────────────────────────────────────┐   │
│  │                    RpcClient (singleton)                              │   │
│  │                                                                       │   │
│  │  - Single WebSocket to server                                        │   │
│  │  - Auto reconnection (exponential backoff)                           │   │
│  │  - Heartbeat (10s ping/pong)                                         │   │
│  │  - Multiple concurrent streams (one per session)                     │   │
│  └───────────────────────────────┬───────────────────────────────────────┘   │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │ WebSocket (NDJSON-RPC)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Server (RPC Router)                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### RPC Client Setup

```typescript
// lib/rpc-client.ts
import { Effect, Layer, Stream } from "effect"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { WebSocket } from "@effect/platform-browser"

// Singleton RPC client
let clientPromise: Promise<RpcClientType> | null = null

export const getRpcClient = async () => {
  if (clientPromise) return clientPromise

  clientPromise = Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* RpcClient.makeProtocolSocket({
        retryTransientErrors: true,
        // Default: exponential backoff 500ms → 5s
      })
      return client
    }).pipe(
      Effect.provide(RpcSerialization.layerNdjson),
      Effect.provide(
        WebSocket.layerWebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`)
      ),
      Effect.scoped,
    )
  )

  return clientPromise
}

// Type for the client
type RpcClientType = Awaited<ReturnType<typeof RpcClient.makeProtocolSocket>>
```

### RPC Chat Transport

```typescript
// lib/rpc-chat-transport.ts
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai"
import { Effect, Stream } from "effect"
import { getRpcClient } from "./rpc-client"
import {
  SubscribeSession,
  SendMessage,
  Interrupt,
  type SessionEvent,
} from "@sandcastle/schemas/rpc/session"

export class RpcChatTransport implements ChatTransport<UIMessage> {
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async sendMessages({
    messages,
    abortSignal,
  }: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    const client = await getRpcClient()

    // Extract content from the last message
    const lastMessage = messages[messages.length - 1]
    const content = lastMessage.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")

    // Send the message (returns immediately with status)
    await Effect.runPromise(
      client(new SendMessage({
        sessionId: this.sessionId,
        content,
        parts: lastMessage.parts,
        clientMessageId: lastMessage.id,
      }))
    )

    // Subscribe to session events
    const eventStream = await Effect.runPromise(
      client(new SubscribeSession({ sessionId: this.sessionId }))
    )

    // Convert Effect Stream to ReadableStream<UIMessageChunk>
    return this.streamToReadable(eventStream, abortSignal)
  }

  private streamToReadable(
    stream: Stream.Stream<SessionEvent>,
    abortSignal?: AbortSignal
  ): ReadableStream<UIMessageChunk> {
    let sawFinish = false
    let currentTurnId: string | null = null

    return new ReadableStream<UIMessageChunk>({
      start: (controller) => {
        // Handle abort signal
        abortSignal?.addEventListener("abort", async () => {
          const client = await getRpcClient()
          await Effect.runPromise(
            client(new Interrupt({ sessionId: this.sessionId }))
          )
          controller.close()
        })

        // Process stream events
        Effect.runPromise(
          stream.pipe(
            Stream.tap((event) =>
              Effect.sync(() => {
                switch (event._tag) {
                  case "InitialState":
                    // Replay buffer for catch-up
                    currentTurnId = event.snapshot.activeTurnId
                    for (const bufferEvent of event.buffer) {
                      const chunk = this.mapToChunk(bufferEvent)
                      if (chunk) {
                        if (chunk.type === "finish") sawFinish = true
                        controller.enqueue(chunk)
                      }
                    }
                    break

                  case "SessionStarted":
                    currentTurnId = event.turnId
                    break

                  case "SessionStopped":
                    if (!sawFinish) {
                      controller.enqueue({
                        type: "finish",
                        finishReason: event.reason === "completed" ? "stop" : "error",
                      })
                    }
                    controller.close()
                    break

                  case "StreamEvent":
                    if (event.turnId === currentTurnId) {
                      const chunk = this.mapToChunk(event.event)
                      if (chunk) {
                        if (chunk.type === "finish") sawFinish = true
                        controller.enqueue(chunk)
                      }
                    }
                    break

                  // Queue events, UserMessage, etc. handled by separate hooks
                }
              })
            ),
            Stream.runDrain
          )
        )
      },
    })
  }

  private mapToChunk(event: ChatStreamEvent): UIMessageChunk | null {
    // Map ChatStreamEvent to UIMessageChunk
    // See docs/agent-protocol.md for full mapping
    switch (event.type) {
      case "start":
        return { type: "start", messageId: event.messageId }
      case "text-start":
        return { type: "text-start", id: event.id }
      case "text-delta":
        return { type: "text-delta", id: event.id, delta: event.delta }
      case "text-end":
        return { type: "text-end", id: event.id }
      case "finish":
        return { type: "finish", finishReason: event.finishReason }
      // ... other event types
      default:
        return null
    }
  }

  async reconnectToStream({
    chatId,
  }: Parameters<ChatTransport<UIMessage>["reconnectToStream"]>[0]
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // Subscribe to session - InitialState will contain buffer if streaming
    const client = await getRpcClient()

    try {
      const eventStream = await Effect.runPromise(
        client(new SubscribeSession({ sessionId: this.sessionId }))
      )

      // Check first event for streaming state
      // If idle with empty buffer, return null (no active stream)
      return this.streamToReadable(eventStream)
    } catch {
      return null
    }
  }
}
```

### React Hook Usage

```typescript
// components/ChatSession.tsx
import { useChat } from "@ai-sdk/react"
import { useMemo, useEffect, useState } from "react"
import { RpcChatTransport } from "@/lib/rpc-chat-transport"
import { useSessionEvents } from "@/hooks/use-session-events"

interface ChatSessionProps {
  sessionId: string
}

export function ChatSession({ sessionId }: ChatSessionProps) {
  // Create transport for this specific session (memoized)
  const transport = useMemo(
    () => new RpcChatTransport(sessionId),
    [sessionId]
  )

  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
  } = useChat({
    id: sessionId,
    transport,
    onFinish: ({ message, finishReason }) => {
      console.log("Stream finished:", finishReason)
    },
    onError: (error) => {
      console.error("Stream error:", error)
    },
  })

  // Subscribe to session events for queue updates, etc.
  const { queue, sessionStatus } = useSessionEvents(sessionId)

  const handleSubmit = (content: string) => {
    sendMessage({ content })
  }

  const handleInterrupt = () => {
    stop()  // Triggers abort signal → sends Interrupt RPC
  }

  return (
    <div>
      {/* Status indicator */}
      {status === "streaming" && <span>Streaming...</span>}
      {error && <span>Error: {error.message}</span>}

      {/* Messages */}
      {messages.map((msg) => (
        <div key={msg.id}>
          <strong>{msg.role}:</strong>
          {msg.parts.map((part, i) => (
            <div key={i}>
              {part.type === "text" && <p>{part.text}</p>}
              {part.type === "tool-invocation" && (
                <div>
                  Tool: {part.toolInvocation.toolName}
                  {part.toolInvocation.state === "result" && (
                    <pre>{JSON.stringify(part.toolInvocation.result)}</pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Queue indicator */}
      {queue.length > 0 && (
        <div>
          <p>Queued messages: {queue.length}</p>
          {queue.map((m) => (
            <div key={m.id}>{m.content}</div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={(e) => {
        e.preventDefault()
        const input = e.currentTarget.elements.namedItem("message") as HTMLInputElement
        handleSubmit(input.value)
        input.value = ""
      }}>
        <input name="message" placeholder="Type a message..." />
        <button type="submit" disabled={status === "streaming"}>Send</button>
        {status === "streaming" && (
          <button type="button" onClick={handleInterrupt}>Stop</button>
        )}
      </form>
    </div>
  )
}
```

### Session Events Hook

```typescript
// hooks/use-session-events.ts
import { useEffect, useState } from "react"
import { Effect, Stream } from "effect"
import { getRpcClient } from "@/lib/rpc-client"
import {
  SubscribeSession,
  type SessionEvent,
  type QueuedMessage,
} from "@sandcastle/schemas/rpc/session"

export function useSessionEvents(sessionId: string) {
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const [sessionStatus, setSessionStatus] = useState<"idle" | "streaming">("idle")

  useEffect(() => {
    let cancelled = false

    const subscribe = async () => {
      const client = await getRpcClient()
      const stream = await Effect.runPromise(
        client(new SubscribeSession({ sessionId }))
      )

      await Effect.runPromise(
        stream.pipe(
          Stream.tap((event) =>
            Effect.sync(() => {
              if (cancelled) return

              switch (event._tag) {
                case "InitialState":
                  setQueue(event.snapshot.queue)
                  setSessionStatus(event.snapshot.status)
                  break

                case "SessionStarted":
                  setSessionStatus("streaming")
                  break

                case "SessionStopped":
                  setSessionStatus("idle")
                  break

                case "MessageQueued":
                  setQueue((q) => [...q, event.message])
                  break

                case "MessageDequeued":
                  setQueue((q) => q.filter((m) => m.id !== event.messageId))
                  break
              }
            })
          ),
          Stream.runDrain
        )
      )
    }

    subscribe()

    return () => {
      cancelled = true
    }
  }, [sessionId])

  return { queue, sessionStatus }
}
```

### LRU Subscription Manager

```typescript
// lib/subscription-manager.ts
const MAX_SUBSCRIPTIONS = 3

class SubscriptionManager {
  private lru: string[] = []  // Most recent first
  private abortControllers = new Map<string, AbortController>()

  visit(sessionId: string) {
    // Remove from current position if exists
    const index = this.lru.indexOf(sessionId)
    if (index !== -1) {
      this.lru.splice(index, 1)
    }

    // Add to front (most recent)
    this.lru.unshift(sessionId)

    // Evict oldest if over capacity
    if (this.lru.length > MAX_SUBSCRIPTIONS) {
      const evicted = this.lru.pop()!
      this.abortControllers.get(evicted)?.abort()
      this.abortControllers.delete(evicted)
    }
  }

  leave(sessionId: string) {
    const index = this.lru.indexOf(sessionId)
    if (index !== -1) {
      this.lru.splice(index, 1)
      this.abortControllers.get(sessionId)?.abort()
      this.abortControllers.delete(sessionId)
    }
  }

  getSubscribed(): string[] {
    return [...this.lru]
  }
}

export const subscriptionManager = new SubscriptionManager()
```

---

## Summary

| Concern | Solution |
|---------|----------|
| Real-time delivery | `@effect/rpc` over WebSocket with `RpcSchema.Stream` |
| Multi-client sync | Server broadcasts via `PubSub`, each client has `Mailbox` |
| Mid-stream catch-up | Buffer sent in `InitialState` event on subscribe |
| Message queuing | FIFO queue with auto-send on idle |
| Interruption | `Fiber.interrupt()` + partial save |
| Client subscriptions | Client-side LRU (max 3) |
| History loading | HTTP RPC separate from streaming |
| Error handling | Best-effort save, no retry |
| Frontend state | AI SDK `useChat()` with custom `ChatTransport` |
| Reconnection | Built-in RPC client retry (500ms → 5s exponential backoff) |
| Heartbeat | Built-in RPC protocol (10s ping/pong) |
| Type safety | `Schema.TaggedRequest` with compile-time validation |

### Key Principles

1. **RPC for protocol**: Let `@effect/rpc` handle transport concerns
2. **Buffer is ephemeral**: Cleared on turn completion, sent in `InitialState`
3. **Server is stateless per-client**: Only tracks active `Mailbox` instances
4. **Simple over clever**: Last-write-wins, no conflict resolution
5. **Effect.ts patterns**: RPC, PubSub, Mailbox, Fibers throughout
6. **Leverage existing libraries**: AI SDK handles message accumulation, RPC handles protocol
7. **Single multiplexed connection**: One WebSocket per client, multiple concurrent streams
8. **Serialized session updates**: Per-session command loop avoids races
9. **Automatic reconnection**: RPC client handles retry with no manual code
10. **Trusted deployment**: No auth; rely on local/VPN access control

### Reference Documents

- `docs/effect-rpc-stream.md` - Full `@effect/rpc` reference
- `docs/agent-protocol.md` - Claude adapter and ChatStreamEvent definitions
