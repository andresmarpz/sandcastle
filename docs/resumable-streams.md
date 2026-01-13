# Resumable Multi-Client Streaming Architecture

## Overview

This document describes the architecture for implementing resumable, multi-client streaming for Claude chat sessions in Sandcastle. The goal is to allow multiple devices (desktop, mobile) to view and interact with the same chat session simultaneously, with support for mid-stream joining and graceful reconnection.

## Requirements

### Functional Requirements

1. **Multi-client sync** - Multiple devices viewing the same chat session simultaneously
2. **Mid-stream join** - New clients can join an active stream and get caught up with full history
3. **Message broadcast** - When one client sends a message, all other clients see it instantly
4. **Resumable streams** - Page refresh or disconnect doesn't lose the conversation
5. **Stop/interrupt** - Any connected client can stop an active stream

### Non-Functional Requirements

1. **No external dependencies** - Use Effect PubSub + SQLite only (no Redis)
2. **Effect-native** - Use Effect.ts patterns throughout
3. **Backward compatible** - Existing `chat.history` RPC continues to work

## Design Decisions

### Q: Who controls the conversation?

**Decision**: Any client can send messages, but only when Claude is idle.

- If Claude is streaming, the UI disables the input for ALL clients
- Any client can click "stop" to interrupt the stream
- Once stopped/finished, any client can send the next message

### Q: How to handle messages sent while streaming?

**Decision**: Reject with error.

- Server returns error if `chat.send` called while `status === "streaming"`
- UI should proactively disable input based on session state events
- This keeps the implementation simple and avoids message queue complexity

### Q: How to bootstrap history for new subscribers?

**Decision**: Subscribe-first with buffered merge (race-safe).

- Client opens `chat.subscribe` immediately (no history call yet)
- Server sends a `SessionSnapshotEvent` with epoch + buffer range + `needsHistory`
- Client buffers incoming sequenced events locally until history is loaded
- Client calls `chat.history` once and renders it once
- Client applies buffered events in seq order and dedups by `messageId`
- If `needsHistory` or epoch mismatch, reset local state before applying buffered events

This avoids history flashing, missing late turns, and "load then disappear" glitches.

### Q: How do we reconcile streaming message IDs with persisted history?

**Decision**: Use stable IDs across stream + storage.

- `UserMessageEvent.messageId` is the DB id from `chatMessages.create`
- `StreamEventStart.messageId` becomes the final persisted assistant id
- Persist assistant messages using that id (extend storage create to accept optional id)
- Client dedups/merges by `messageId` to avoid duplicates after history load

### Q: How to handle stale sessions?

**Decision**: Auto-cleanup in-memory ActiveSession.

- When `subscriberCount === 0` and `status === "idle"`, cleanup ActiveSession after timeout
- The `claudeSessionId` is persisted in the database (Session entity)
- On reconnect, server loads `claudeSessionId` from DB for SDK resume
- New ActiveSession epoch ensures clients reload history after cleanup
- This is essentially manual garbage collection of the in-memory state

### Q: Should we track client identity?

**Decision**: No.

- No "client is typing" indicators needed
- Messages don't need attribution beyond user/assistant role
- Simplifies implementation

### Q: How does autonomous mode work with multi-client?

**Decision**: Autonomous is per-message, not per-session.

- The `autonomous` flag is passed with `chat.send`
- It appends extra instructions to the system prompt for that turn
- Multiple clients can still observe autonomous sessions
- Useful for "fire and forget" tasks that you want to monitor from another device

### Q: What should the event buffer contain?

**Decision**: Current turn only (Option A).

- Buffer contains events from the current streaming turn only
- Historical messages (completed turns) are loaded via `chat.history` from SQLite
- This avoids memory bloat and duplication
- On turn completion, buffer is cleared, messages persisted to DB
- Client flow: `chat.subscribe` (buffer) → `chat.history` → apply buffered events
- If the buffer drops events (size cap), mark a gap so new subscribers reload history

### Q: How should sequence numbers work?

**Decision**: Per-session epoch, monotonic within epoch.

- Sequence numbers increase monotonically within a single ActiveSession epoch
- Epoch is a random token generated when ActiveSession is created (or after cleanup)
- Sequence numbers reset when epoch changes
- Clients store `{epoch, lastSeenSeq}` and send both on reconnect
- Server sets `needsHistory` when epoch mismatches or `lastSeenSeq` is outside buffer range

### Q: How to handle errors during streaming?

**Decision**: Broadcast error, return to idle.

- On Claude SDK error, broadcast `StreamEventError` to all clients
- Set status back to `"idle"`
- Persist partial assistant message if any content was generated
- Clients can retry by sending a new message
- Keep it simple; we can add retry logic later if needed

### Q: How to handle race conditions on send?

**Decision**: First request wins, acceptable UX.

- If two clients send at nearly the same time, first to reach server wins
- Second client receives `SessionBusyRpcError`
- By the time error arrives, client will also receive `SessionStateEvent(streaming)`
- UI will disable input anyway; error is just a confirmation

### Q: What's the cleanup timeout for idle sessions?

**Decision**: 5 minutes.

- When `subscriberCount === 0` and `status === "idle"`, start 5-minute timer
- If a client reconnects before timeout, cancel cleanup
- After timeout, remove `ActiveSession` from memory
- `claudeSessionId` remains in SQLite for future SDK resume

### Q: Is claudeSessionId already persisted?

**Answer**: Yes.

- `packages/storage/src/sessions.ts` already has `claudeSessionId` field
- Stored as `claude_session_id` in SQLite
- Updated via `storage.sessions.update()` when received from SDK
- Available for resume on reconnection

---

## Architecture

### Event Model

#### Existing Events (ChatStreamEvent)

From `packages/rpc/src/chat/schema.ts`:

```typescript
type ChatStreamEvent =
  | StreamEventStart          // { type: "start", messageId, claudeSessionId? }
  | StreamEventTextStart      // { type: "text-start", id }
  | StreamEventTextDelta      // { type: "text-delta", id, delta }
  | StreamEventTextEnd        // { type: "text-end", id }
  | StreamEventToolInputStart // { type: "tool-input-start", toolCallId, toolName }
  | StreamEventToolInputAvailable  // { type: "tool-input-available", toolCallId, toolName, input }
  | StreamEventToolOutputAvailable // { type: "tool-output-available", toolCallId, output }
  | StreamEventReasoningStart // { type: "reasoning-start", id }
  | StreamEventReasoningDelta // { type: "reasoning-delta", id, delta }
  | StreamEventReasoningEnd   // { type: "reasoning-end", id }
  | StreamEventFinish         // { type: "finish", finishReason, metadata? }
  | StreamEventError          // { type: "error", errorText }
```

Note: `StreamEventStart.messageId` should be used as the persisted assistant
message id so history + stream can dedup cleanly.

#### New Events for Multi-Client

```typescript
// User sent a message (broadcast to all clients)
interface UserMessageEvent {
  type: "user-message";
  messageId: string; // DB id for dedup with history
  text: string;
  timestamp: string;
}

// Initial snapshot for a new subscription (not sequenced, per-subscriber only)
interface SessionSnapshotEvent {
  type: "session-snapshot";
  epoch: string;
  status: "idle" | "streaming";
  claudeSessionId: string | null;
  bufferMinSeq: number | null;
  bufferMaxSeq: number | null;
  latestSeq: number;
  needsHistory: boolean;
}

// Session state changed
interface SessionStateEvent {
  type: "session-state";
  status: "idle" | "streaming";
  claudeSessionId: string | null;
}

// Union of all session events
type SessionEvent =
  | ChatStreamEvent
  | UserMessageEvent
  | SessionStateEvent;

// Wrapper with sequence number for replay/ordering
interface SequencedEvent {
  seq: number;
  timestamp: string;
  event: SessionEvent;
}

// Events emitted on chat.subscribe
type SubscribeEvent = SessionSnapshotEvent | SequencedEvent;
```

### ActiveSession Structure

Enhanced in-memory session state:

```typescript
interface ActiveSession {
  // === Existing fields ===
  queryHandle: QueryHandle | null;      // null when idle
  abortController: AbortController | null;
  claudeSessionId: string | null;

  // === New fields for multi-client ===
  pubsub: PubSub.PubSub<SequencedEvent>;
  eventBuffer: Ref<SequencedEvent[]>;   // Ring buffer for replay
  lastSeq: Ref<number>;                 // Monotonic sequence counter (per epoch)
  epoch: string;                        // Random token per ActiveSession lifetime
  bufferHasGap: Ref<boolean>;           // True if buffer dropped events
  subscriberCount: Ref<number>;         // Active client count
  status: Ref<SessionStatus>;           // Current session state
}

type SessionStatus = "idle" | "streaming";
```

### RPC Endpoints

#### New Endpoints

```typescript
// Subscribe to session events (read-only stream)
Rpc.make("chat.subscribe", {
  payload: {
    sessionId: Schema.String,
    // Client's last seen sequence number for replay
    // If omitted, server replays current buffer
    lastSeenSeq: Schema.optional(Schema.Number),
    // Last known epoch token (for gap detection)
    epoch: Schema.optional(Schema.String),
  },
  success: SubscribeEvent, // first event is SessionSnapshotEvent
  error: Schema.Union(ChatRpcError, ChatSessionNotFoundRpcError),
  stream: true,
});

// Send a user message (triggers Claude query)
Rpc.make("chat.send", {
  payload: {
    sessionId: Schema.String,
    worktreeId: Schema.String,
    prompt: Schema.String,
    // Optional: enable autonomous mode with extended system prompt
    autonomous: Schema.optional(Schema.Boolean),
    // Optional: override stored claudeSessionId (server defaults to DB value)
    claudeSessionId: Schema.optional(Schema.NullOr(Schema.String)),
  },
  success: Schema.Void,  // Events delivered via subscription
  error: Schema.Union(
    ChatRpcError,
    ChatSessionNotFoundRpcError,
    SessionBusyRpcError,  // NEW: returned if status !== "idle"
  ),
});

// Get current session state (useful for initial UI setup)
Rpc.make("chat.getSessionState", {
  payload: { sessionId: Schema.String },
  success: Schema.Struct({
    status: SessionStatus,
    claudeSessionId: Schema.NullOr(Schema.String),
    epoch: Schema.String,
    subscriberCount: Schema.Number,
    bufferMinSeq: Schema.NullOr(Schema.Number),
    bufferMaxSeq: Schema.NullOr(Schema.Number),
    latestSeq: Schema.Number,
    bufferHasGap: Schema.Boolean,
  }),
  error: Schema.Union(ChatRpcError, ChatSessionNotFoundRpcError),
});

```

Notes:
- `chat.subscribe` always emits a snapshot first; if `needsHistory` is true, clients should
  reload history and then apply buffered events.
- `needsHistory` is true for brand-new clients (no `lastSeenSeq`) and when a gap is detected.
- Even when `needsHistory` is true, the server still replays the current buffer so new
  subscribers can see the in-flight stream while history loads.

#### Modified Existing Endpoints

```typescript
// chat.interrupt - unchanged, but now broadcasts SessionStateEvent
"chat.interrupt": (params) => {
  // ... existing interrupt logic ...
  // NEW: broadcast state change to all subscribers
  yield* publishEvent(session, { type: "session-state", status: "idle", ... });
}

// chat.history - unchanged, still returns persisted messages from SQLite
"chat.history": (params) => storage.chatMessages.listBySession(params.sessionId)

// chat.stream - DEPRECATED or kept for backwards compatibility
// New clients should use chat.subscribe + chat.send
```

---

## Flow Diagrams

### Flow 1: First Client Connects

```text
Client A                          Server
────────                          ──────
    │                                │
    │  chat.subscribe(sessionId)     │
    │───────────────────────────────▶│
    │                                │  ActiveSession exists?
    │                                │  NO → Create new:
    │                                │    - pubsub = PubSub.unbounded()
    │                                │    - eventBuffer = Ref([])
    │                                │    - status = Ref("idle")
    │                                │    - subscriberCount = Ref(1)
    │                                │
    │  {session-snapshot}            │  Include epoch + buffer range
    │◀───────────────────────────────│  (client may load history now)
    │  chat.history(sessionId)       │  if needsHistory
    │───────────────────────────────▶│
    │                                │
    │  Stream<SequencedEvent>        │  Subscribe to pubsub
    │◀───────────────────────────────│  (client buffers until history done)
    │                                │
    │  chat.send(prompt)             │
    │───────────────────────────────▶│
    │                                │  status == "idle"? YES
    │                                │  1. Store user msg in DB (get id)
    │                                │  2. Publish UserMessageEvent with id
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│  (client receives via sub)
    │                                │  3. Set status = "streaming"
    │                                │  4. Publish SessionStateEvent
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                                │  5. Start Claude query
    │                                │  6. Pipe stream → pubsub
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│  (text-delta, tool events...)
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                                │  7. On finish:
    │                                │     - Store assistant msg (use stream messageId)
    │                                │     - Set status = "idle"
    │                                │     - Publish SessionStateEvent
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
    │                                │
```

### Flow 2: Second Client Joins Mid-Stream

```text
Client A                Server                          Client B
────────                ──────                          ────────
    │                      │                                │
    │  (streaming...)      │                                │
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│                                │
    │                      │   chat.subscribe(sessionId)    │
    │                      │◀───────────────────────────────│
    │                      │                                │
    │                      │   ActiveSession exists? YES    │
    │                      │   1. Send session-snapshot     │
    │                      │──────────────────────────────▶ │ (epoch + buffer range)
    │                      │   2. Replay eventBuffer        │
    │                      │──────────────────────────────▶ │ (gets all past events)
    │                      │   3. Subscribe to pubsub       │
    │                      │   4. subscriberCount++         │
    │                      │                                │
    │  (more streaming)    │                                │
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│ (both receive)
    │                      │                                │
```

### Flow 3: Client Interrupts Stream

```text
Client A                Server                          Client B
────────                ──────                          ────────
    │                      │                                │
    │  (streaming...)      │                   (streaming...)
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│
    │                      │                                │
    │                      │        chat.interrupt()        │
    │                      │◀───────────────────────────────│
    │                      │                                │
    │                      │   1. abortController.abort()   │
    │                      │   2. queryHandle.interrupt     │
    │                      │   3. status = "idle"           │
    │                      │   4. Publish SessionStateEvent │
    │  {status: "idle"}    │                {status: "idle"}│
    │◀─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│
    │                      │                                │
    │                      │   Both clients can now send    │
```

### Flow 4: All Clients Disconnect, Then Reconnect

```text
Client A                Server
────────                ──────
    │                      │
    │  (disconnect)        │
    │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶│  subscriberCount--
    │                      │  subscriberCount == 0
    │                      │  status == "idle"
    │                      │  → Start cleanup timer
    │                      │
    │                      │  ... 5 minutes pass ...
    │                      │
    │                      │  → Remove ActiveSession
    │                      │  → claudeSessionId still in DB
    │                      │
    │  chat.subscribe()    │
    │─────────────────────▶│
    │                      │  ActiveSession exists? NO
    │                      │  → Create new ActiveSession
    │                      │  → New epoch token generated
    │                      │  → Load claudeSessionId from DB
    │                      │  → Snapshot marks needsHistory
```

---

## PubSub Architecture

### Event Flow Through the System

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER                                        │
│                                                                         │
│   ┌─────────────┐                                                       │
│   │ chat.send() │──┐                                                    │
│   └─────────────┘  │                                                    │
│                    ▼                                                    │
│              ┌───────────────┐     ┌───────────────────────────────┐    │
│              │ UserMessage   │────▶│                               │    │
│              │ Event         │     │                               │    │
│              └───────────────┘     │      publishEvent()           │    │
│                                    │                               │    │
│   ┌─────────────┐                  │   1. Increment lastSeq        │    │
│   │ Claude SDK  │──┐               │   2. Wrap in SequencedEvent   │    │
│   │ Stream      │  │               │   3. Add to eventBuffer       │    │
│   └─────────────┘  │               │   4. Publish to PubSub        │    │
│                    ▼               │                               │    │
│              ┌───────────────┐     │                               │    │
│              │ ChatStream    │────▶│                               │    │
│              │ Events        │     └───────────────┬───────────────┘    │
│              └───────────────┘                     │                    │
│                                                    ▼                    │
│                                           ┌───────────────┐             │
│                                           │    PubSub     │             │
│                                           │  (fan-out)    │             │
│                                           └───────┬───────┘             │
│                                                   │                     │
│                    ┌──────────────────────────────┼──────────────┐      │
│                    │                              │              │      │
│                    ▼                              ▼              ▼      │
│            ┌─────────────┐                ┌─────────────┐ ┌───────────┐ │
│            │ Subscriber  │                │ Subscriber  │ │Subscriber │ │
│            │ Stream A    │                │ Stream B    │ │ Stream C  │ │
│            └──────┬──────┘                └──────┬──────┘ └─────┬─────┘ │
│                   │                              │              │       │
└───────────────────┼──────────────────────────────┼──────────────┼───────┘
                    │                              │              │
                    ▼                              ▼              ▼
              ┌──────────┐                  ┌──────────┐    ┌──────────┐
              │ Client A │                  │ Client B │    │ Client C │
              │ (Desktop)│                  │ (Mobile) │    │  (New)   │
              └──────────┘                  └──────────┘    └──────────┘
```

### PubSub Subscription Management

```typescript
// Creating subscriber stream for a client (pseudocode; read Refs with Effect.gen)
const createSubscriberStream = (
  session: ActiveSession,
  lastSeenSeq: number | undefined,
  epoch: string | undefined
): Stream.Stream<SubscribeEvent, never, never> => {
  // 1. Subscribe to live PubSub first to avoid gaps
  const liveStream = Stream.fromPubSub(session.pubsub);

  // 2. Build snapshot (includes epoch + buffer range + needsHistory)
  // Snapshot is per-subscriber only (not buffered, not broadcast)
  const snapshot = buildSnapshot(session, lastSeenSeq, epoch);

  // 3. Compute replay events (from buffer only)
  const buffer = Ref.get(session.eventBuffer);
  const replayFromSeq = snapshot.needsHistory ? 0 : (lastSeenSeq ?? 0);
  const replayEvents = replayBuffer(buffer, replayFromSeq);

  // 4. Emit snapshot, then replay, then live
  return Stream.concat(
    Stream.fromIterable([snapshot]),
    Stream.fromIterable(replayEvents),
    liveStream
  );
};
```

### Key PubSub Properties

- **Unbounded**: Using `PubSub.unbounded()` - no backpressure, events never dropped
- **Multiple subscribers**: Each `chat.subscribe` call creates a new subscription
- **Late join support**: Buffer allows replay for clients joining mid-stream
- **Gap detection**: Snapshot includes epoch + buffer range for safe history reloads
- **Automatic cleanup**: Subscriptions cleaned up when stream closes

---

## Buffer Management

### Ring Buffer Implementation

```typescript
const MAX_BUFFER_SIZE = 2000;

const addToBuffer = (
  bufferRef: Ref<SequencedEvent[]>,
  gapRef: Ref<boolean>,
  event: SequencedEvent
): Effect<void> =>
  Ref.updateEffect(bufferRef, (buffer) => {
    const newBuffer = [...buffer, event];
    // Sliding window - keep last MAX_BUFFER_SIZE events
    if (newBuffer.length > MAX_BUFFER_SIZE) {
      // Mark a gap so new subscribers reload history
      return Effect.as(Ref.set(gapRef, true), newBuffer.slice(-MAX_BUFFER_SIZE));
    }
    return Effect.succeed(newBuffer);
  });
```

### Replay Logic

```typescript
const replayBuffer = (
  buffer: SequencedEvent[],
  lastSeenSeq: number
): SequencedEvent[] => {
  // Find events after client's last seen sequence
  return buffer.filter(e => e.seq > lastSeenSeq);
};

// Pseudocode; use Effect.gen to read Refs in real code
const buildSnapshot = (
  session: ActiveSession,
  lastSeenSeq: number | undefined,
  epoch: string | undefined
): SessionSnapshotEvent => {
  const buffer = Ref.get(session.eventBuffer);
  const bufferMinSeq = buffer.length ? buffer[0].seq : null;
  const bufferMaxSeq = buffer.length ? buffer[buffer.length - 1].seq : null;
  const epochMismatch = epoch && epoch !== session.epoch;
  const hasGap = Ref.get(session.bufferHasGap);
  const latestSeq = Ref.get(session.lastSeq);
  const needsHistory =
    lastSeenSeq === undefined ||
    epochMismatch ||
    hasGap ||
    (bufferMinSeq !== null && lastSeenSeq < bufferMinSeq) ||
    (lastSeenSeq !== undefined && lastSeenSeq > latestSeq);

  return {
    type: "session-snapshot",
    epoch: session.epoch,
    status: Ref.get(session.status),
    claudeSessionId: session.claudeSessionId,
    bufferMinSeq,
    bufferMaxSeq,
    latestSeq,
    needsHistory,
  };
};
```

### Buffer Contents

The buffer contains events from the **current streaming turn only**:

- `UserMessageEvent` - when user sends message
- `SessionStateEvent` - status changes
- `ChatStreamEvent` - Claude's response events

Historical messages (previous turns) are loaded via `chat.history` from SQLite.
If `needsHistory` is true, clients should reload history and then re-apply buffered events.
Reset `bufferHasGap` when the buffer is cleared on turn completion.

---

## Client-Side Integration

### Subscription Flow

```typescript
const buffered: SequencedEvent[] = [];
const hasLocalState = false; // e.g. in-memory cache or persisted UI state
let historyLoaded = hasLocalState;

// 1. Subscribe first (start buffering immediately)
const stream = rpc.chat.subscribe({
  sessionId,
  lastSeenSeq,
  epoch,
});

// 2. Process events
for await (const item of stream) {
  if (item.type === "session-snapshot") {
    const shouldLoadHistory = !hasLocalState || item.needsHistory;
    localStorage.setItem(`epoch:${sessionId}`, item.epoch);

    if (shouldLoadHistory) {
      // Load history in parallel, then apply buffered events
      rpc.chat.history({ sessionId }).then((history) => {
        renderHistory(history);
        historyLoaded = true;
        applyBuffered(buffered); // sort by seq, dedup by messageId, then clear
      });
    }
    continue;
  }

  buffered.push(item);

  if (historyLoaded) {
    applyEvent(item); // dedup by messageId
  }

  localStorage.setItem(`lastSeq:${sessionId}`, item.seq.toString());
}
```

### Dedup Rules

- If a `UserMessageEvent.messageId` already exists in history, ignore it
- For assistant streams, treat `StreamEventStart.messageId` as canonical and attach deltas to that message
- On finish, merge persisted assistant data into the existing message with the same id

### Reconnection Logic

```typescript
// On page load
const lastSeq = localStorage.getItem(`lastSeq:${sessionId}`);
const epoch = localStorage.getItem(`epoch:${sessionId}`);

// Subscribe with last known seq + epoch
const stream = rpc.chat.subscribe({
  sessionId,
  lastSeenSeq: lastSeq ? parseInt(lastSeq, 10) : undefined,
  epoch: epoch ?? undefined,
});
```

If the snapshot reports `needsHistory: true`, clear local UI state and reload
`chat.history` before applying buffered events.

---

## Error Handling

### SessionBusyRpcError

New error for when client tries to send while streaming:

```typescript
export class SessionBusyRpcError extends Schema.TaggedError<SessionBusyRpcError>()(
  "SessionBusyRpcError",
  {
    sessionId: Schema.String,
    currentStatus: SessionStatus,
  },
) {}
```

### Subscriber Cleanup on Error

```typescript
Stream.ensuring(
  Effect.gen(function* () {
    yield* Ref.update(session.subscriberCount, n => n - 1);

    const count = yield* Ref.get(session.subscriberCount);
    const status = yield* Ref.get(session.status);

    if (count === 0 && status === "idle") {
      // Schedule cleanup after timeout
      yield* scheduleCleanup(sessionId, CLEANUP_TIMEOUT_MS);
    }
  })
)
```

---

## Open Questions - All Resolved

1. ✅ Who controls conversation? → Any client when idle
2. ✅ Message during streaming? → Reject with `SessionBusyRpcError`
3. ✅ History bootstrap? → Subscribe-first + buffered merge (`needsHistory` flag)
4. ✅ Stale session cleanup? → Auto-cleanup after 5 min, resume via `claudeSessionId`
5. ✅ Client identity tracking? → No
6. ✅ Autonomous mode? → Per-message flag, appends to prompt
7. ✅ Buffer scope? → Current turn only
8. ✅ Sequence numbers? → Per-epoch, monotonic with epoch token
9. ✅ Error recovery? → Broadcast error, return to idle
10. ✅ Race conditions? → First request wins, acceptable UX
11. ✅ Cleanup timeout? → 5 minutes
12. ✅ claudeSessionId storage? → Already in `packages/storage/src/sessions.ts`
13. ✅ Message IDs? → Stable IDs across stream + history for dedup

---

## Implementation Checklist

### Phase 1: Schema & Types

- [ ] Add `UserMessageEvent` schema (messageId + text + timestamp)
- [ ] Add `SessionStateEvent` schema (status + `claudeSessionId`)
- [ ] Add `SessionSnapshotEvent` schema (epoch + status + `claudeSessionId` + buffer range + `latestSeq` + `needsHistory`)
- [ ] Add `SequencedEvent` wrapper schema
- [ ] Add `SubscribeEvent` union for `chat.subscribe` stream
- [ ] Add input schemas for `chat.subscribe`, `chat.send`, `chat.getSessionState`
- [ ] Add new RPC definitions to `ChatRpc` group (and keep `chat.stream` for compatibility)
- [ ] Allow optional message id in `CreateChatMessageInput` (or add `createWithId`)
- [ ] Add `SessionBusyRpcError` error type
- [ ] Define `SessionStatus` type (`"idle" | "streaming"`)

### Phase 2: ActiveSession Enhancement

- [ ] Add `pubsub: PubSub<SequencedEvent>` field to `ActiveSession`
- [ ] Add `eventBuffer: Ref<SequencedEvent[]>` field
- [ ] Add `lastSeq: Ref<number>` field
- [ ] Add `epoch: string` field (random per ActiveSession lifetime)
- [ ] Add `bufferHasGap: Ref<boolean>` field (set when buffer drops events)
- [ ] Add `subscriberCount: Ref<number>` field
- [ ] Add `status: Ref<SessionStatus>` field
- [ ] Add `cleanupFiber: Fiber | null` field (for cancellable cleanup timer)
- [ ] Update `ActiveSessionsService` interface with new methods
- [ ] Initialize `epoch`, `lastSeq`, `bufferHasGap` on ActiveSession creation

### Phase 3: Server RPC Handlers

- [ ] Implement `chat.subscribe` handler
  - [ ] Create or get ActiveSession
  - [ ] Subscribe to PubSub first (capture live events)
  - [ ] Emit `SessionSnapshotEvent` first (epoch + buffer range + `needsHistory`)
  - [ ] Replay buffer for reconnecting clients (full buffer if `needsHistory`)
  - [ ] Stream live PubSub events after replay
  - [ ] Track subscriber count
  - [ ] Setup cleanup on disconnect and cancel cleanup on new subscriber
- [ ] Implement `chat.send` handler
  - [ ] Atomically check + set status to `"streaming"` (first request wins)
  - [ ] Store user message in DB and use DB id in `UserMessageEvent`
  - [ ] Publish `UserMessageEvent` with stable `messageId`
  - [ ] Publish `SessionStateEvent` for `"streaming"`
  - [ ] Load `claudeSessionId` from DB unless an override is provided
  - [ ] Start Claude query
  - [ ] Pipe events through PubSub
  - [ ] Track `StreamEventStart.messageId` so the persisted assistant message uses it
  - [ ] Handle finish/error: persist assistant message with stream `messageId`, set status to `"idle"`, clear buffer, publish `SessionStateEvent`
- [ ] Implement `chat.getSessionState` handler
- [ ] Update `chat.interrupt` to broadcast `SessionStateEvent`

### Phase 4: PubSub & Buffer Infrastructure

- [ ] Create helper: `publishEvent(session, event)` - assigns seq, buffers, publishes
- [ ] Create helper: `replayBuffer(buffer, lastSeenSeq)` - filters events for replay
- [ ] Create helper: `buildSnapshot(session, lastSeenSeq, epoch)` - computes `needsHistory`
- [ ] Create helper: `clearBuffer(session)` - called on turn completion
- [ ] Implement 5-minute cleanup timer with cancellation
- [ ] Implement buffer size limit (2000 events sliding window)
- [ ] Reset `bufferHasGap` when buffer is cleared
- [ ] Ensure `SessionSnapshotEvent` is never buffered or broadcast

### Phase 5: Client-Side Updates

- [ ] Update `rpc-transport.ts` to use `chat.subscribe` + `chat.send`
- [ ] Subscribe-first flow with local buffering, then `chat.history`
- [ ] Dedup by `messageId` to avoid history flash/duplicates
- [ ] Apply buffered events in seq order, then clear local buffer
- [ ] Persist `epoch` + `lastSeenSeq` in localStorage for reconnect
- [ ] Handle `SessionStateEvent` to enable/disable input
- [ ] Handle `UserMessageEvent` to show messages from other clients
- [ ] Update UI components to render session state

### Phase 6: Testing

- [ ] Unit tests for buffer management
- [ ] Unit tests for PubSub fan-out
- [ ] Integration tests for multi-client scenarios
- [ ] Test reconnection with epoch mismatch (forces history reload)
- [ ] Test history + stream merge without flashing
- [ ] Test interrupt from secondary client
- [ ] Test message ID dedup between history and live events

---

## References

### Existing Code

- `apps/http/src/handlers/chat.ts` - Current chat handler
- `apps/http/src/services/active-sessions.ts` - ActiveSession service
- `apps/http/src/agents/claude/live.ts` - Claude SDK wrapper
- `packages/rpc/src/chat/schema.ts` - RPC schema definitions
- `packages/ui/src/features/chat-v2/lib/rpc-transport.ts` - Client transport
- `packages/storage/` - SQLite storage layer

### Claude Agent SDK

- `resume` option in query options - Resume session by ID
- `resumeSessionAt` - Resume at specific message UUID
- `forkSession` - Fork instead of continue

### Effect Libraries

- `Effect.PubSub` - Fan-out messaging
- `Effect.Ref` - Mutable references
- `Effect.Stream` - Streaming primitives
