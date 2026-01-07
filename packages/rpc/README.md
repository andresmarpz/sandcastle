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

## API Reference

### RPC Operations

#### `worktree.list`

List all worktrees for a repository.

```typescript
client["worktree.list"]({ repoPath: "/path/to/repo" });
// Returns: WorktreeInfo[]
```

#### `worktree.get`

Get information about a specific worktree.

```typescript
client["worktree.get"]({
  repoPath: "/path/to/repo",
  worktreePath: "/path/to/worktree"
});
// Returns: WorktreeInfo
```

#### `worktree.create`

Create a new worktree.

```typescript
client["worktree.create"]({
  repoPath: "/path/to/repo",
  worktreePath: "/path/to/new-worktree",
  branch: "feature/my-feature",
  createBranch: true,
  fromRef: "main" // optional
});
// Returns: WorktreeInfo
```

#### `worktree.remove`

Remove a worktree.

```typescript
client["worktree.remove"]({
  repoPath: "/path/to/repo",
  worktreePath: "/path/to/worktree",
  force: false // optional
});
// Returns: void
```

#### `worktree.prune`

Clean up stale worktree references.

```typescript
client["worktree.prune"]({ repoPath: "/path/to/repo" });
// Returns: void
```

## Types

### `WorktreeInfo`

```typescript
class WorktreeInfo {
  path: string; // Absolute path to the worktree
  branch: string; // Branch name (or "HEAD" if detached)
  commit: string; // Current commit SHA
  isMain: boolean; // True if this is the main worktree
}
```

### `CreateWorktreeOptions`

```typescript
class CreateWorktreeOptions {
  repoPath: string; // Path to main repository
  worktreePath: string; // Path for new worktree
  branch: string; // Branch name
  createBranch: boolean; // Create new branch if true
  fromRef?: string; // Starting point for new branch
}
```

### `RemoveWorktreeOptions`

```typescript
class RemoveWorktreeOptions {
  repoPath: string; // Path to main repository
  worktreePath: string; // Path to worktree to remove
  force?: boolean; // Force removal
}
```

## Errors

All errors extend `Schema.TaggedError` for type-safe error handling:

| Error                      | Description             | Fields                          |
| -------------------------- | ----------------------- | ------------------------------- |
| `GitCommandRpcError`       | Git command failure     | `command`, `stderr`, `exitCode` |
| `GitNotFoundRpcError`      | Git not installed       | `message`                       |
| `WorktreeExistsRpcError`   | Worktree already exists | `path`                          |
| `WorktreeNotFoundRpcError` | Worktree not found      | `path`                          |
| `BranchExistsRpcError`     | Branch already exists   | `branch`                        |
| `InvalidRepoRpcError`      | Invalid git repository  | `path`, `message`               |

### Error Handling Example

```typescript
import { Effect } from "effect";

import { GitCommandRpcError, WorktreeNotFoundRpcError } from "@sandcastle/rpc";

const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(WorktreeRpc);
  return yield* client["worktree.get"]({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/worktree"
  });
}).pipe(
  Effect.catchTags({
    GitCommandRpcError: e => Effect.fail(`Git error: ${e.stderr}`),
    WorktreeNotFoundRpcError: e => Effect.fail(`Worktree not found: ${e.path}`)
  })
);
```

## Exports

```typescript
// Main exports
// Types

// Errors
import {
  BranchExistsRpcError,
  CreateWorktreeOptions,
  GitCommandRpcError,
  GitNotFoundRpcError,
  InvalidRepoRpcError,
  RemoveWorktreeOptions,
  WorktreeExistsRpcError,
  WorktreeInfo,
  WorktreeNotFoundRpcError,
  WorktreeRpc, // RpcGroup definition
  WorktreeRpcError, // Union of all errors
  WorktreeRpcHandlers, // Handler layer (requires WorktreeService)
  WorktreeRpcHandlersLive // Handler layer with WorktreeServiceLive
} from "@sandcastle/rpc";
import { GitCommandRpcError } from "@sandcastle/rpc/errors";
import { WorktreeRpcHandlersLive } from "@sandcastle/rpc/handlers";
// Granular imports
import { WorktreeRpc } from "@sandcastle/rpc/schema";
import { WorktreeInfo } from "@sandcastle/rpc/types";
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
