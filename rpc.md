# Sandcastle RPC Implementation Summary

This document summarizes the RPC infrastructure implemented and provides instructions for connecting from a frontend.

## What Was Implemented

### 1. `@sandcastle/rpc` Package (`packages/rpc/`)

A schema-first RPC package using `@effect/rpc` that defines worktree operations.

**Key Files:**

- `src/types.ts` - Schema classes: `WorktreeInfo`, `CreateWorktreeOptions`, `RemoveWorktreeOptions`
- `src/errors.ts` - RPC error types: `GitCommandRpcError`, `WorktreeExistsRpcError`, `WorktreeNotFoundRpcError`, `BranchExistsRpcError`, etc.
- `src/schema.ts` - `WorktreeRpc` RpcGroup with all operations
- `src/handlers.ts` - `WorktreeRpcHandlersLive` Layer wrapping `@sandcastle/worktree`
- `index.ts` - Public exports

**Available RPC Operations:**

| Tag               | Payload                      | Success          | Errors                                                                 |
| ----------------- | ---------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `worktree.list`   | `{ repoPath: string }`       | `WorktreeInfo[]` | `GitCommandRpcError`                                                   |
| `worktree.get`    | `{ repoPath, worktreePath }` | `WorktreeInfo`   | `GitCommandRpcError`, `WorktreeNotFoundRpcError`                       |
| `worktree.create` | `CreateWorktreeOptions`      | `WorktreeInfo`   | `GitCommandRpcError`, `WorktreeExistsRpcError`, `BranchExistsRpcError` |
| `worktree.remove` | `RemoveWorktreeOptions`      | `void`           | `GitCommandRpcError`, `WorktreeNotFoundRpcError`                       |
| `worktree.prune`  | `{ repoPath: string }`       | `void`           | `GitCommandRpcError`                                                   |

### 2. `@sandcastle/http` Package (`packages/http/`)

HTTP server exposing the RPC endpoints using `@effect/platform-bun`.

**Key Files:**

- `src/server.ts` - Bun HTTP server with RPC on `/rpc` endpoint
- `index.ts` - Exports `makeServerLayer`, `ServerLive`

**Configuration:**

- Port: `PORT` env var or default `3000`
- Endpoint: `/rpc`
- Serialization: NDJSON

**Run the server:**

```bash
cd packages/http
bun run start
# or with custom port
PORT=8080 bun run start
```

## Frontend Connection Instructions

To connect from a frontend (React, Solid, etc.) using Effect RPC:

### 1. Install Dependencies

```bash
bun add @effect/rpc @effect/platform effect
# For browser fetch:
bun add @effect/platform-browser
```

### 2. Import the Shared Schema

The frontend needs access to `WorktreeRpc` from `@sandcastle/rpc`. In a monorepo:

```typescript
import { WorktreeRpc } from "@sandcastle/rpc";
```

Or copy the schema file to share types.

### 3. Create the RPC Client

```typescript
// client.ts
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Layer } from "effect";
import { WorktreeRpc } from "@sandcastle/rpc";

// HTTP protocol connecting to the server
const RpcProtocol = RpcClient.layerProtocolHttp({
  url: "http://localhost:3000/rpc",
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson)
);

// Create the typed client
export const WorktreeClient = RpcClient.make(WorktreeRpc).pipe(
  Effect.provide(RpcProtocol)
);

// Or as a service for dependency injection
export class WorktreeRpcClient extends Effect.Service<WorktreeRpcClient>()(
  "WorktreeRpcClient",
  {
    dependencies: [RpcProtocol],
    scoped: RpcClient.make(WorktreeRpc),
  }
) {}
```

### 4. Use the Client

```typescript
import { Effect } from "effect";
import { WorktreeClient } from "./client";

// List worktrees
const listWorktrees = Effect.gen(function* () {
  const client = yield* WorktreeClient;
  const worktrees = yield* client["worktree.list"]({
    repoPath: "/path/to/repo",
  });
  return worktrees;
});

// Create a worktree
const createWorktree = Effect.gen(function* () {
  const client = yield* WorktreeClient;
  const info = yield* client["worktree.create"]({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/repo-feature",
    branch: "feature/new-feature",
    createBranch: true,
    fromRef: "main",
  });
  return info;
});

// Run the effect
Effect.runPromise(listWorktrees).then(console.log);
```

### 5. Error Handling

```typescript
import { Effect } from "effect";
import { GitCommandRpcError, WorktreeNotFoundRpcError } from "@sandcastle/rpc";

const getWorktree = Effect.gen(function* () {
  const client = yield* WorktreeClient;
  return yield* client["worktree.get"]({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/worktree",
  });
}).pipe(
  Effect.catchTags({
    GitCommandRpcError: (e) => Effect.succeed(`Git error: ${e.stderr}`),
    WorktreeNotFoundRpcError: (e) => Effect.succeed(`Not found: ${e.path}`),
  })
);
```

### 6. React Integration Example

```typescript
// hooks/useWorktrees.ts
import { useEffect, useState } from "react";
import { Effect } from "effect";
import { WorktreeClient } from "../client";
import type { WorktreeInfo } from "@sandcastle/rpc";

export function useWorktrees(repoPath: string) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const program = Effect.gen(function* () {
      const client = yield* WorktreeClient;
      return yield* client["worktree.list"]({ repoPath });
    });

    Effect.runPromise(program)
      .then(setWorktrees)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath]);

  return { worktrees, loading, error };
}
```

## Key Dependencies

| Package                    | Version  | Purpose              |
| -------------------------- | -------- | -------------------- |
| `effect`                   | ^3.19.14 | Core Effect library  |
| `@effect/rpc`              | ^0.73.0  | RPC client/server    |
| `@effect/platform`         | ^0.94.1  | HTTP abstractions    |
| `@effect/platform-bun`     | ^0.87.0  | Bun HTTP server      |
| `@effect/platform-browser` | (latest) | Browser fetch client |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────────┐                                        │
│  │  RpcClient.make │──── FetchHttpClient ───────────────┐   │
│  │  (WorktreeRpc)  │                                    │   │
│  └─────────────────┘                                    │   │
└─────────────────────────────────────────────────────────│───┘
                                                          │
                                    HTTP POST /rpc (NDJSON)
                                                          │
┌─────────────────────────────────────────────────────────│───┐
│                    @sandcastle/http                     │   │
│  ┌─────────────────┐                                    ▼   │
│  │ BunHttpServer   │◄── RpcServer.layer(WorktreeRpc) ◄──┘   │
│  │ port 3000       │         │                              │
│  └─────────────────┘         │                              │
└──────────────────────────────│──────────────────────────────┘
                               │
┌──────────────────────────────│──────────────────────────────┐
│                    @sandcastle/rpc                          │
│                              │                              │
│  ┌───────────────────────────▼────────────────────────┐     │
│  │        WorktreeRpcHandlersLive (Layer)             │     │
│  │  ┌──────────────────────────────────────────────┐  │     │
│  │  │              WorktreeService                 │  │     │
│  │  │  • list() • get() • create() • remove() •   │  │     │
│  │  └──────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────│──────────────────────────────┐
│                  @sandcastle/worktree                       │
│                              │                              │
│  ┌───────────────────────────▼────────────────────────┐     │
│  │           WorktreeServiceLive (Layer)              │     │
│  │                                                    │     │
│  │    Executes: git worktree add/list/remove/prune    │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### New: `packages/rpc/`

- `package.json`
- `index.ts`
- `src/types.ts`
- `src/errors.ts`
- `src/schema.ts`
- `src/handlers.ts`

### New: `packages/http/`

- `package.json`
- `index.ts`
- `src/server.ts`
- `README.md`

### Modified

- Root `package.json` - Fixed workspaces config (removed non-existent `apps/desktop/src-backend`)
