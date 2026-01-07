# @sandcastle/http

HTTP server exposing Sandcastle RPC endpoints using Effect and Bun.

## Installation

```bash
bun add @sandcastle/http
```

## Usage

### Start the server

```bash
# Default port 3000
bun run start

# Custom port
PORT=8080 bun run start

# Development mode with hot reload
bun run dev
```

### Programmatic usage

```typescript
import { makeServerLayer, ServerLive } from "@sandcastle/http"
import { BunRuntime } from "@effect/platform-bun"
import { Layer } from "effect"

// Use default server (port from PORT env or 3000)
BunRuntime.runMain(Layer.launch(ServerLive))

// Or create with custom port
const CustomServer = makeServerLayer(8080)
BunRuntime.runMain(Layer.launch(CustomServer))
```

## Endpoints

All RPC endpoints are available at `/rpc` using NDJSON serialization.

### Available Operations

| Operation | Description |
|-----------|-------------|
| `worktree.list` | List all worktrees for a repository |
| `worktree.get` | Get info about a specific worktree |
| `worktree.create` | Create a new worktree |
| `worktree.remove` | Remove a worktree |
| `worktree.prune` | Clean up stale worktree references |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | HTTP server port |

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
