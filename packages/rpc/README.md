# @sandcastle/rpc

Type-safe RPC schema and handlers for Sandcastle worktree management using [Effect RPC](https://github.com/Effect-TS/effect/tree/main/packages/rpc).

This package provides the shared RPC definitions that can be used by both server and client implementations.

## Installation

```bash
bun add @sandcastle/rpc
```

## Usage

### Server-Side (with @sandcastle/http)

```typescript
import { RpcServer } from "@effect/rpc";

import { WorktreeRpc, WorktreeRpcHandlersLive } from "@sandcastle/rpc";

// Create HTTP app with handlers
const app = RpcServer.toHttpApp(WorktreeRpc).pipe(Effect.provide(WorktreeRpcHandlersLive));
```

### Client-Side

```typescript
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer } from "effect";

import { WorktreeRpc } from "@sandcastle/rpc";

// Create protocol layer
const RpcProtocol = RpcClient.layerProtocolHttp({
  url: "http://localhost:3000/rpc"
}).pipe(Layer.provide(FetchHttpClient.layer), Layer.provide(RpcSerialization.layerNdjson));

// Use the client
const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(WorktreeRpc);

  // List worktrees
  const worktrees = yield* client["worktree.list"]({
    repoPath: "/path/to/repo"
  });

  return worktrees;
}).pipe(Effect.provide(RpcProtocol));

Effect.runPromise(program).then(console.log);
```

## Dependencies

- `effect` - Core Effect library
- `@effect/rpc` - RPC functionality
- `@effect/platform` - HTTP abstractions
- `@sandcastle/worktree` - Worktree service implementation

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
