# Chat Streaming Plan (Effect RPC)

Goal: implement the RPC-based streaming architecture described in `docs/chat-streaming-effect.md` with clear ownership across packages.

## Backend (apps/http/)

- Wire the WebSocket upgrade route (`/ws`) and Bun server integration for `@effect/rpc` socket protocol.
- Compose Effect layers (RPC router, SessionHub, storage, Claude adapter) into the server runtime.
- Add non-streaming HTTP endpoints needed for initial history/snapshot loading (if not already present).
- Define server-level error handling and logging for stream failures and interruptions.
- Ensure server lifecycle cleanly scopes sockets, fibers, and per-session resources.

## RPC schema declaration (packages/rpc/)

- [x] Define the RPC request/response types (`chat.subscribe`, `chat.send`, `chat.interrupt`, `chat.dequeue`, `chat.getState`).
- [x] Define the stream event union (`SessionEvent`) and payload shapes (`QueuedMessage`, `SessionSnapshot`, `HistoryCursor`).
- [x] Export a single, shared entrypoint that both client and server import from.
- [x] Align errors and tagged variants with the documented reasons (completed/interrupt/error, not-found, etc.).

## Shared schemas and protocol types (packages/schemas/)

- [x] Verify `ChatStreamEvent` and `MessagePart` shapes match `docs/agent-protocol.md`.
- [x] Provide stable type exports used by RPC schema, Claude adapter, and UI mapping.

## Session state + streaming core (apps/http/)

- [x] Implement the `SessionHub` service (in-memory session map, per-session PubSub, current buffer, queue).
- [x] Enforce the session state machine (idle/streaming transitions, queueing rules, interruption handling).
- [x] Implement buffer behavior: capture only current turn events, flush on completion, send on subscribe.
- [x] Guarantee ordered broadcast of `SessionEvent` for all subscribers, with backpressure handled by mailboxes.
- [x] Implement message queue semantics (enqueue during streaming, auto-dequeue and start when idle).

## Claude adapter (apps/http/)

- [x] Translate provider SDK events to `ChatStreamEvent` variants.
- [x] Accumulate messages/tool calls for persistence on completion (or partial save on interrupt).
- [x] Expose unified adapter interface with `translateStream` and `createAccumulator` methods.
- [x] Add `processMessageDual` helper for SessionHub to process both streaming and accumulation.
- [x] Emit `SessionStarted`, `StreamEvent`, and `SessionStopped` appropriately during streaming (SessionHub responsibility).
- [x] Ensure interruption interrupts the streaming fiber and triggers cleanup/broadcast (SessionHub responsibility).

## SQLite storage (packages/storage/)

- [x] Define tables and migrations for sessions, messages, and any cursor metadata.
- [x] Implement storage service interfaces used by `SessionHub` (save completed turn, save partial on interrupt).
- [x] Provide query APIs for session history and snapshot loading.
- [x] Handle idempotency and ordering guarantees when persisting streamed content.

## Frontend (packages/ui/)

- Create a singleton RPC client with NDJSON WebSocket transport and auto-retry.
- Implement a `ChatTransport` that maps `SessionEvent`/`ChatStreamEvent` into `useChat()` chunks.
- Build a `useSessionEvents` hook to sync queue and session status UI from the stream.
- Add an LRU subscription manager to cap concurrent live subscriptions.
- Handle reconnection and mid-stream catch-up (use `InitialState` buffer and active turn id).

## Testing and validation (cross-package)

- Add unit tests for session state transitions, queue behavior, and buffer/catch-up logic.
- Add integration tests for RPC stream ordering, interruption, and reconnection behavior.
- Verify persistence correctness (completed vs interrupted turns) against SQLite store.
- Add a manual smoke test checklist for multi-client streaming and queueing.

## Docs and operational notes (docs/)

- Update or add a quick-start section that explains local-only trust boundary and deployment assumptions.
- Document how to run the server and verify streaming from multiple clients.
- Keep `docs/chat-streaming-effect.md` and any follow-up guides in sync with implementation details.
