# Effect RPC Streaming and WebSocket Reference

This document captures comprehensive knowledge about `@effect/rpc` streaming capabilities and `@effect/platform` WebSocket primitives, extracted from the Effect source code at `~/.local/share/effect-solutions/effect`.

## Table of Contents

- [Overview](#overview)
- [RPC Streaming Support](#rpc-streaming-support)
- [WebSocket Protocol](#websocket-protocol)
- [Reconnection and Retry](#reconnection-and-retry)
- [Serialization](#serialization)
- [Server Implementation](#server-implementation)
- [Client Implementation](#client-implementation)
- [Mailbox for Streaming](#mailbox-for-streaming)
- [Protocol Message Types](#protocol-message-types)
- [Integration Patterns](#integration-patterns)
- [Source File Reference](#source-file-reference)

---

## Overview

`@effect/rpc` provides a type-safe RPC framework with first-class streaming support. Combined with `@effect/platform`'s Socket abstraction, it offers:

- **Bidirectional streaming** over WebSockets
- **Automatic reconnection** with configurable retry schedules
- **Heartbeat/ping-pong** for connection health
- **Backpressure handling** via Mailbox and acknowledgments
- **Multiple serialization formats** (NDJSON, JSON, JSON-RPC)
- **Span propagation** for distributed tracing

### Package Structure

```
@effect/rpc
├── Rpc.ts              # Core RPC definitions
├── RpcSchema.ts        # Schema types including Stream
├── RpcRouter.ts        # Server-side routing
├── RpcClient.ts        # Client-side protocol handling
├── RpcServer.ts        # Server-side protocol handling
├── RpcSerialization.ts # Serialization formats
└── RpcMiddleware.ts    # Request/response middleware

@effect/platform
├── Socket.ts           # Abstract socket interface
├── SocketServer.ts     # Server socket management
└── (platform-specific implementations)
```

---

## RPC Streaming Support

### RpcSchema.Stream

The `RpcSchema.Stream` type enables streaming responses from RPC handlers.

**Source**: `packages/rpc/src/RpcSchema.ts`

```typescript
// Definition
export interface Stream<A extends Schema.Schema.All, E extends Schema.Schema.All>
  extends Schema.Schema<
    Effect.Stream<Schema.Schema.Type<A>, Schema.Schema.Type<E>>,
    Effect.Stream<Schema.Schema.Encoded<A>, Schema.Schema.Encoded<E>>,
    Schema.Schema.Context<A> | Schema.Schema.Context<E>
  > {
  readonly success: A
  readonly failure: E
}

// Constructor
export const Stream = <A extends Schema.Schema.All, E extends Schema.Schema.All>(options: {
  readonly success: A
  readonly failure: E
}): Stream<A, E>
```

### Defining Streaming Requests

```typescript
import { Schema } from "effect"
import { RpcSchema } from "@effect/rpc"

// Define the event schema
class ChatEvent extends Schema.Class<ChatEvent>("ChatEvent")({
  type: Schema.String,
  content: Schema.String,
  timestamp: Schema.DateTimeUtc,
}) {}

// Define a streaming request
class SubscribeToChat extends Schema.TaggedRequest<SubscribeToChat>()(
  "SubscribeToChat",
  {
    // Use RpcSchema.Stream for streaming responses
    success: RpcSchema.Stream({
      success: ChatEvent,
      failure: Schema.Never,
    }),
    failure: Schema.String,
    payload: {
      chatId: Schema.String,
    },
  }
) {}
```

### Handler Return Types

Handlers for streaming requests can return:

1. **`Effect.Stream<A, E, R>`** - Direct stream
2. **`Mailbox<A, E>`** - Queue-based streaming with backpressure

**Source**: `packages/rpc/src/RpcRouter.ts`

```typescript
// From the source - handler type resolution
type Handler<Req> = Req extends Schema.TaggedRequest<...>
  ? Req["success"] extends RpcSchema.Stream<infer A, infer E>
    ? Effect.Effect<Stream<A, E> | Mailbox<A, E>, ...>
    : Effect.Effect<Req["success"], ...>
  : never
```

---

## WebSocket Protocol

### Socket Abstraction

`@effect/platform` provides an abstract `Socket` interface that works across environments.

**Source**: `packages/platform/src/Socket.ts`

```typescript
export interface Socket {
  // Run the socket with a handler for incoming data
  readonly run: <R, E, _>(
    handler: (_: Uint8Array) => Effect.Effect<_, E, R>
  ) => Effect.Effect<void, SocketError | E, R>

  // Run without transforming data
  readonly runRaw: <R, E, _>(
    handler: (_: Uint8Array | CloseEvent) => Effect.Effect<_, E, R>
  ) => Effect.Effect<void, SocketError | E, R>

  // Get a writer for sending data
  readonly writer: Effect.Effect<
    (chunk: Uint8Array | CloseEvent) => Effect.Effect<void, SocketError>,
    never,
    Scope.Scope
  >
}
```

### Socket Error Types

```typescript
export type SocketError =
  | SocketCloseError      // Connection closed
  | SocketGenericError    // Generic error with cause
  | SocketOpenError       // Failed to open connection
  | SocketOpenTimeoutError // Open timed out

export class SocketCloseError {
  readonly reason: string
  readonly code: number
}
```

### Platform-Specific Implementations

- **Browser**: `@effect/platform-browser` - Uses native WebSocket
- **Node.js**: `@effect/platform-node` - Uses `ws` package
- **Bun**: `@effect/platform-bun` - Uses Bun's native WebSocket

---

## Reconnection and Retry

### Client-Side Reconnection

**Source**: `packages/rpc/src/RpcClient.ts`

The `makeProtocolSocket` function provides automatic reconnection:

```typescript
export const makeProtocolSocket = (options?: {
  // Retry on transient errors (Open, OpenTimeout)
  readonly retryTransientErrors?: boolean | undefined
  // Custom retry schedule
  readonly retrySchedule?: Schedule.Schedule<any, Socket.SocketError> | undefined
}): Effect.Effect<Protocol["Type"], never, Scope.Scope | RpcSerialization | Socket.Socket>
```

### Default Retry Schedule

```typescript
// From source
const defaultRetrySchedule = Schedule.exponential(500, 1.5).pipe(
  Schedule.union(Schedule.spaced(5000))
)
```

This means:
- Initial delay: 500ms
- Multiplier: 1.5x each retry
- Maximum spacing: 5 seconds
- Retries indefinitely

### Transient vs Fatal Errors

```typescript
// Transient errors (will retry)
const isTransientError = (error: Socket.SocketError): boolean =>
  error._tag === "SocketOpenError" ||
  error._tag === "SocketOpenTimeoutError"

// Fatal errors (will not retry)
// - SocketCloseError (explicit close)
// - SocketGenericError (runtime error)
```

### Heartbeat Mechanism

**Source**: `packages/rpc/src/RpcClient.ts`

```typescript
// Ping interval and timeout
const pingInterval = 10_000  // 10 seconds
const pingTimeout = 5_000    // 5 seconds to respond

// Implementation pattern
const heartbeat = Effect.gen(function* () {
  const fiber = yield* Effect.fork(
    Effect.sleep(pingInterval).pipe(
      Effect.andThen(sendPing),
      Effect.andThen(
        Effect.raceFirst(
          receivePong,
          Effect.sleep(pingTimeout).pipe(Effect.andThen(Effect.fail("timeout")))
        )
      ),
      Effect.forever
    )
  )
  return fiber
})
```

---

## Serialization

### Available Formats

**Source**: `packages/rpc/src/RpcSerialization.ts`

#### 1. NDJSON (Newline-Delimited JSON)

```typescript
export const layerNdjson: Layer<RpcSerialization>

// Properties
{
  contentType: "application/x-ndjson",
  framing: true,  // Self-delimiting with newlines
}
```

Best for: Streaming HTTP, WebSockets

#### 2. JSON

```typescript
export const json: RpcSerialization

// Properties
{
  contentType: "application/json",
  framing: false,  // Single message
}
```

Best for: Single request/response HTTP

#### 3. JSON-RPC 2.0

```typescript
export const jsonRpc: RpcSerialization
export const ndJsonRpc: RpcSerialization  // Streaming variant

// Properties
{
  contentType: "application/json-rpc",
  // Follows JSON-RPC 2.0 spec with id correlation
}
```

Best for: Interoperability with JSON-RPC clients

### Serialization Interface

```typescript
export interface RpcSerialization {
  readonly contentType: string
  readonly framing: boolean  // Whether messages are self-delimiting
  readonly encode: (message: unknown) => Uint8Array
  readonly decode: (data: Uint8Array) => unknown
}
```

---

## Server Implementation

### RpcServer.makeSocketProtocol

**Source**: `packages/rpc/src/RpcServer.ts`

Creates a WebSocket protocol handler for the server:

```typescript
export const makeSocketProtocol = <R extends RpcRouter.RpcRouter<any, any>>(
  router: R
): Effect.Effect<
  {
    readonly protocol: Protocol
    readonly onSocket: (socket: Socket.Socket) => Effect.Effect<void, never, Scope.Scope>
  },
  never,
  RpcRouter.RpcRouter.Context<R> | RpcSerialization
>
```

### Server Protocol Flow

```typescript
const { protocol, onSocket } = yield* RpcServer.makeSocketProtocol(router)

// For each incoming WebSocket connection
const handleConnection = (socket: Socket.Socket) =>
  Effect.scoped(
    Effect.gen(function* () {
      // The protocol handles:
      // 1. Parsing incoming requests
      // 2. Routing to handlers
      // 3. Streaming responses back
      // 4. Managing client state
      yield* onSocket(socket)
    })
  )
```

### Multi-Client Management

The server protocol tracks multiple clients:

```typescript
// Internal state (from source)
interface ServerState {
  clients: Map<number, {
    write: (bytes: Uint8Array) => Effect.Effect<void>
    spans: Map<number, Span>  // For tracing
  }>
  nextClientId: number
}
```

### Acknowledgment Support

For backpressure control:

```typescript
// Server can request acks from clients
const supportsAck = true

// Message with ack request
{
  type: "ResponseChunk",
  requestId: 123,
  values: [...],
  ack: true,  // Client must acknowledge before more chunks
}
```

---

## Client Implementation

### RpcClient.makeProtocolSocket

**Source**: `packages/rpc/src/RpcClient.ts`

```typescript
export const makeProtocolSocket = (options?: {
  readonly retryTransientErrors?: boolean
  readonly retrySchedule?: Schedule.Schedule<any, Socket.SocketError>
}): Effect.Effect<
  Protocol["Type"],
  never,
  Scope.Scope | RpcSerialization | Socket.Socket
>
```

### Using the Client

```typescript
import { RpcClient } from "@effect/rpc"
import { Socket } from "@effect/platform"

const program = Effect.gen(function* () {
  // Create the client (handles connection, reconnection, heartbeat)
  const client = yield* RpcClient.makeProtocolSocket({
    retryTransientErrors: true,
  })

  // Single request
  const result = yield* client(new MyRequest({ data: "..." }))

  // Streaming request - returns Effect.Stream
  const stream = yield* client(new MyStreamRequest({ id: "..." }))

  yield* stream.pipe(
    Stream.tap((event) => Console.log(event)),
    Stream.runDrain
  )
})

// Provide dependencies
const runnable = program.pipe(
  Effect.provide(RpcSerialization.layerNdjson),
  Effect.provide(makeWebSocketLayer("wss://example.com/rpc")),
)
```

### Client Protocol Messages

```typescript
// Outgoing (client → server)
type ClientMessage =
  | { _tag: "Request"; id: number; request: EncodedRequest }
  | { _tag: "Ack"; id: number }  // Acknowledge chunk receipt
  | { _tag: "Ping" }
  | { _tag: "Interrupt"; id: number }  // Cancel streaming request

// Incoming (server → client)
type ServerMessage =
  | { _tag: "Response"; id: number; response: EncodedResponse }
  | { _tag: "ResponseChunk"; id: number; values: EncodedValue[]; ack?: boolean }
  | { _tag: "ResponseExit"; id: number; exit: Exit }
  | { _tag: "Pong" }
  | { _tag: "Defect"; message: string }
```

---

## Mailbox for Streaming

### What is Mailbox?

`Mailbox` is an Effect primitive for efficient producer-consumer streaming with backpressure.

**Source**: `packages/effect/src/Mailbox.ts`

```typescript
export interface Mailbox<A, E = never> {
  // Offer a value (may block if full)
  readonly offer: (value: A) => Effect.Effect<boolean>

  // Offer multiple values
  readonly offerAll: (values: Iterable<A>) => Effect.Effect<number>

  // Signal completion
  readonly end: Effect.Effect<boolean>

  // Signal failure
  readonly fail: (error: E) => Effect.Effect<boolean>

  // Take values (used internally by RPC)
  readonly take: Effect.Effect<Mailbox.Entry<A, E>>

  // Number of pending items
  readonly size: Effect.Effect<number>
}
```

### Creating a Mailbox

```typescript
import { Mailbox } from "effect"

// Unbounded mailbox
const unbounded = yield* Mailbox.make<MyEvent>()

// Bounded mailbox (backpressure when full)
const bounded = yield* Mailbox.make<MyEvent>(100)  // capacity: 100

// Dropping mailbox (drops oldest when full)
const dropping = yield* Mailbox.make<MyEvent>({ capacity: 100, strategy: "dropping" })
```

### Using Mailbox in RPC Handlers

```typescript
import { Mailbox, Effect, Stream } from "effect"
import { Rpc } from "@effect/rpc"

const handler = Rpc.effect(SubscribeToEvents, (req) =>
  Effect.gen(function* () {
    const mailbox = yield* Mailbox.make<Event>()

    // Producer: push events to mailbox
    yield* Effect.fork(
      Stream.runForEach(
        getEventStream(req.id),
        (event) => mailbox.offer(event)
      )
    )

    // Handle cleanup when client disconnects
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => console.log("Client disconnected"))
    )

    // Return mailbox - RPC will stream its contents
    return mailbox
  })
)
```

### Mailbox vs Stream

| Aspect | Mailbox | Stream |
|--------|---------|--------|
| Push vs Pull | Push-based | Pull-based |
| Backpressure | Built-in (bounded) | Via chunking |
| Multiple producers | Yes (thread-safe) | Requires merging |
| Cancellation | Automatic on scope close | Manual interrupt |
| RPC integration | First-class support | Also supported |

---

## Protocol Message Types

### Request Encoding

**Source**: `packages/rpc/src/internal/rpc.ts`

```typescript
// Encoded request structure
interface EncodedRequest {
  _tag: string           // Request type tag
  payload: unknown       // Encoded payload
  spanContext?: {        // For distributed tracing
    traceId: string
    spanId: string
    sampled: boolean
  }
}
```

### Response Types

```typescript
// Single value response
interface Response {
  _tag: "Response"
  id: number
  response: Either<EncodedFailure, EncodedSuccess>
}

// Streaming chunk
interface ResponseChunk {
  _tag: "ResponseChunk"
  id: number
  values: Array<Either<EncodedFailure, EncodedSuccess>>
  ack?: boolean  // Request acknowledgment
}

// Stream completion
interface ResponseExit {
  _tag: "ResponseExit"
  id: number
  exit: Exit<EncodedFailure, void>  // Success or failure
}
```

### Wire Format (NDJSON)

```
{"_tag":"Request","id":1,"request":{"_tag":"SubscribeToChat","payload":{"chatId":"abc"}}}
{"_tag":"ResponseChunk","id":1,"values":[{"_tag":"Right","value":{"type":"message","content":"Hello"}}]}
{"_tag":"ResponseChunk","id":1,"values":[{"_tag":"Right","value":{"type":"message","content":"World"}}]}
{"_tag":"ResponseExit","id":1,"exit":{"_tag":"Success"}}
```

---

## Integration Patterns

### Pattern 1: PubSub to Mailbox Bridge

For fan-out scenarios where multiple clients subscribe to the same events:

```typescript
import { PubSub, Mailbox, Effect, Stream } from "effect"

// Shared PubSub for all events
const eventPubSub = yield* PubSub.unbounded<Event>()

// RPC handler creates per-client Mailbox
const subscribeHandler = Rpc.effect(Subscribe, (req) =>
  Effect.gen(function* () {
    const mailbox = yield* Mailbox.make<Event>()

    // Subscribe to PubSub and forward to mailbox
    yield* PubSub.subscribe(eventPubSub).pipe(
      Stream.fromQueue,
      Stream.filter((event) => event.channelId === req.channelId),
      Stream.runForEach((event) => mailbox.offer(event)),
      Effect.forkScoped  // Runs until client disconnects
    )

    return mailbox
  })
)

// Publishing events (from elsewhere in the app)
yield* PubSub.publish(eventPubSub, newEvent)
```

### Pattern 2: Interrupt Handling

```typescript
// Client can send interrupt to cancel streaming
const client = yield* RpcClient.makeProtocolSocket()

// Start streaming request
const fiber = yield* Effect.fork(
  client(new StreamRequest({ id: "..." })).pipe(
    Stream.runForEach(handleEvent)
  )
)

// Later: interrupt the stream
yield* Fiber.interrupt(fiber)
// This sends an Interrupt message to server, which cleans up resources
```

### Pattern 3: Request Middleware

```typescript
import { RpcMiddleware } from "@effect/rpc"

// Add authentication header to all requests
const authMiddleware = RpcMiddleware.make((request, next) =>
  Effect.gen(function* () {
    const token = yield* getAuthToken()
    return yield* next({
      ...request,
      headers: { ...request.headers, Authorization: `Bearer ${token}` },
    })
  })
)

// Apply middleware to client
const client = yield* RpcClient.makeProtocolSocket().pipe(
  RpcClient.withMiddleware(authMiddleware)
)
```

### Pattern 4: Graceful Shutdown

```typescript
// Server-side graceful shutdown
const server = yield* RpcServer.makeSocketProtocol(router)

// On shutdown signal
yield* Effect.addFinalizer(() =>
  Effect.gen(function* () {
    // Close all client connections gracefully
    yield* server.protocol.shutdown()
    // Wait for in-flight requests to complete
    yield* Effect.sleep(Duration.seconds(5))
  })
)
```

---

## Source File Reference

### @effect/rpc Package

| File | Purpose | Key Exports |
|------|---------|-------------|
| `packages/rpc/src/Rpc.ts` | Core RPC definitions | `Rpc.effect`, `Rpc.stream` |
| `packages/rpc/src/RpcSchema.ts` | Schema types | `RpcSchema.Stream` |
| `packages/rpc/src/RpcRouter.ts` | Server routing | `RpcRouter.make` |
| `packages/rpc/src/RpcClient.ts` | Client protocol | `RpcClient.makeProtocolSocket` |
| `packages/rpc/src/RpcServer.ts` | Server protocol | `RpcServer.makeSocketProtocol` |
| `packages/rpc/src/RpcSerialization.ts` | Wire formats | `layerNdjson`, `json`, `jsonRpc` |
| `packages/rpc/src/RpcMiddleware.ts` | Middleware | `RpcMiddleware.make` |

### @effect/platform Package

| File | Purpose | Key Exports |
|------|---------|-------------|
| `packages/platform/src/Socket.ts` | Socket abstraction | `Socket`, `SocketError` |
| `packages/platform/src/SocketServer.ts` | Server sockets | `SocketServer` |

### Test Files (Good Examples)

| File | What It Demonstrates |
|------|---------------------|
| `packages/rpc/test/Router.test.ts` | Router setup, streaming handlers |
| `packages/rpc/test/Client.test.ts` | Client usage patterns |
| `packages/platform-node/test/fixtures/rpc-schemas.ts` | Schema definitions |

### Absolute Paths

```
Effect source code:
~/.local/share/effect-solutions/effect/

Key files:
~/.local/share/effect-solutions/effect/packages/rpc/src/Rpc.ts
~/.local/share/effect-solutions/effect/packages/rpc/src/RpcSchema.ts
~/.local/share/effect-solutions/effect/packages/rpc/src/RpcRouter.ts
~/.local/share/effect-solutions/effect/packages/rpc/src/RpcClient.ts
~/.local/share/effect-solutions/effect/packages/rpc/src/RpcServer.ts
~/.local/share/effect-solutions/effect/packages/rpc/src/RpcSerialization.ts
~/.local/share/effect-solutions/effect/packages/platform/src/Socket.ts
```

---

## Quick Reference

### Minimal Streaming Server

```typescript
import { Schema, Effect, Stream } from "effect"
import { Rpc, RpcRouter, RpcServer, RpcSchema, RpcSerialization } from "@effect/rpc"

// 1. Define request
class Subscribe extends Schema.TaggedRequest<Subscribe>()("Subscribe", {
  success: RpcSchema.Stream({ success: Schema.String, failure: Schema.Never }),
  failure: Schema.Never,
  payload: { channel: Schema.String },
}) {}

// 2. Create router
const router = RpcRouter.make(
  Rpc.effect(Subscribe, (req) =>
    Effect.succeed(
      Stream.fromIterable(["event1", "event2", "event3"]).pipe(
        Stream.tap(() => Effect.sleep(1000))
      )
    )
  )
)

// 3. Create protocol handler
const { onSocket } = yield* RpcServer.makeSocketProtocol(router).pipe(
  Effect.provide(RpcSerialization.layerNdjson)
)

// 4. Use with your WebSocket server
// onSocket(socket) handles the entire protocol
```

### Minimal Streaming Client

```typescript
import { Effect, Stream } from "effect"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { Socket } from "@effect/platform"

const program = Effect.gen(function* () {
  const client = yield* RpcClient.makeProtocolSocket({
    retryTransientErrors: true,
  })

  const stream = yield* client(new Subscribe({ channel: "test" }))

  yield* stream.pipe(
    Stream.tap((event) => Effect.log(`Received: ${event}`)),
    Stream.runDrain
  )
})

// Run with WebSocket and serialization layers
program.pipe(
  Effect.provide(RpcSerialization.layerNdjson),
  Effect.provide(WebSocketLayer),  // Platform-specific
  Effect.runPromise
)
```

---

## Comparison: Manual WebSocket vs @effect/rpc

| Concern | Manual Implementation | @effect/rpc |
|---------|----------------------|-------------|
| Message ordering | Manual `seq` numbers | Protocol handles internally |
| Reconnection | Manual exponential backoff | Built-in with `retrySchedule` |
| Heartbeat | Manual ping/pong | Built-in 10s interval |
| Serialization | Manual encode/decode | `RpcSerialization` layers |
| Type safety | Manual schema validation | Automatic via `Schema` |
| Backpressure | Manual buffering | `Mailbox` with ack support |
| Tracing | Manual span propagation | Automatic span context |
| Error handling | Manual error types | Typed failures in schema |
| Multi-client | Manual client tracking | Server protocol handles |
| Cleanup | Manual resource management | Scoped effects |

---

## Notes and Caveats

1. **Platform-specific Socket layers**: You need to provide the appropriate Socket layer for your platform (Node, Bun, Browser).

2. **Bun integration**: Bun's native WebSocket needs an adapter to conform to Effect's Socket interface. This is available in `@effect/platform-bun`.

3. **HTTP fallback**: `@effect/rpc` also supports HTTP streaming via `layerProtocolHttp` for environments where WebSocket isn't available.

4. **Worker protocol**: For CPU-intensive operations, `layerProtocolWorker` offloads RPC to Web Workers or Node.js Worker Threads.

5. **Schema evolution**: Request/response schemas support versioning through tagged unions. Add new request types without breaking existing clients.
