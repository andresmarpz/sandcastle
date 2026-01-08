# @sandcastle/storage

Effect-based SQLite storage layer for Sandcastle entities.

## Overview

This package provides a type-safe storage service for persisting Sandcastle's core entities (Repository, Worktree, Session, Agent) using SQLite via `bun:sqlite`. It follows Effect.ts patterns for dependency injection, error handling, and composability.

## Installation

```bash
bun add @sandcastle/storage
```

## Data Model

The storage layer manages four hierarchical entities:

```
Repository (top-level)
├── Worktree (child of Repository)
│   └── Session (child of Worktree)
│       └── Agent (child of Session)
```

### Repository

A tracked git repository managed by Sandcastle.

| Field         | Type   | Description                          |
| ------------- | ------ | ------------------------------------ |
| id            | string | UUID primary key                     |
| label         | string | User-friendly display name           |
| directoryPath | string | Absolute path to repository (unique) |
| defaultBranch | string | Primary branch (default: "main")     |
| createdAt     | string | ISO 8601 timestamp                   |
| updatedAt     | string | ISO 8601 timestamp                   |

### Worktree

An isolated git worktree for parallel development.

| Field          | Type                              | Description                           |
| -------------- | --------------------------------- | ------------------------------------- |
| id             | string                            | UUID primary key                      |
| repositoryId   | string                            | Foreign key to Repository             |
| path           | string                            | Absolute worktree path (unique)       |
| branch         | string                            | Git branch checked out                |
| name           | string                            | Human-readable name (e.g. petname)    |
| baseBranch     | string                            | Branch this worktree was created from |
| status         | "active" \| "stale" \| "archived" | Current lifecycle state               |
| createdAt      | string                            | ISO 8601 timestamp                    |
| lastAccessedAt | string                            | ISO 8601 timestamp                    |

### Session

A logical unit of work within a worktree (displayed as a tab in UI).

| Field          | Type                                                         | Description             |
| -------------- | ------------------------------------------------------------ | ----------------------- |
| id             | string                                                       | UUID primary key        |
| worktreeId     | string                                                       | Foreign key to Worktree |
| title          | string                                                       | User-editable title     |
| description    | string \| null                                               | Optional description    |
| status         | "created" \| "active" \| "paused" \| "completed" \| "failed" | Current state           |
| createdAt      | string                                                       | ISO 8601 timestamp      |
| lastActivityAt | string                                                       | ISO 8601 timestamp      |

### Agent

A running instance of an AI coding assistant within a Session.

| Field     | Type                                                        | Description                     |
| --------- | ----------------------------------------------------------- | ------------------------------- |
| id        | string                                                      | UUID primary key                |
| sessionId | string                                                      | Foreign key to Session          |
| processId | number \| null                                              | OS process ID                   |
| status    | "starting" \| "running" \| "idle" \| "stopped" \| "crashed" | Current state                   |
| startedAt | string                                                      | ISO 8601 timestamp              |
| stoppedAt | string \| null                                              | ISO 8601 timestamp (if stopped) |
| exitCode  | number \| null                                              | Process exit code               |

## Usage

### Basic Setup

<!-- prettier-ignore -->
```ts
import { Effect } from "effect";
import { StorageService, StorageServiceLive } from "@sandcastle/storage";

const program = Effect.gen(function* () {
  const storage = yield* StorageService;

  // Initialize database (runs migrations)
  yield* storage.initialize();

  // Create a repository
  const repo = yield* storage.repositories.create({
    label: "My Project",
    directoryPath: "/path/to/repo",
    defaultBranch: "main"
  });

  console.log("Created repository:", repo.id);
});

// Run with default config (~/.sandcastle/data.db)
Effect.runPromise(program.pipe(Effect.provide(StorageServiceLive())));
```

### Custom Database Path

<!-- prettier-ignore -->
```ts
import { StorageServiceLive } from "@sandcastle/storage";

// Use a custom database location
const layer = StorageServiceLive({
  databasePath: "/custom/path/to/data.db"
});
```

### CRUD Operations

Each entity supports standard operations:

<!-- prettier-ignore -->
```ts
const storage = yield* StorageService;

// List all
const repos = yield* storage.repositories.list();

// Get by ID
const repo = yield* storage.repositories.get("uuid-here");

// Get by unique field
const repoByPath = yield* storage.repositories.getByPath("/path/to/repo");

// Create
const newRepo = yield* storage.repositories.create({
  label: "New Project",
  directoryPath: "/path/to/new-repo"
});

// Update
const updated = yield* storage.repositories.update(repo.id, {
  label: "Updated Label"
});

// Delete (cascades to children)
yield* storage.repositories.delete(repo.id);
```

### Hierarchical Queries

<!-- prettier-ignore -->
```ts
// List worktrees for a repository
const worktrees = yield* storage.worktrees.listByRepository(repo.id);

// List sessions for a worktree
const sessions = yield* storage.sessions.listByWorktree(worktree.id);

// List agents for a session
const agents = yield* storage.agents.listBySession(session.id);
```

### Touch Operations

Update timestamps without changing other fields:

<!-- prettier-ignore -->
```ts
// Update lastAccessedAt on a worktree
yield* storage.worktrees.touch(worktree.id);

// Update lastActivityAt on a session
yield* storage.sessions.touch(session.id);
```

## Error Handling

All operations return typed errors that can be handled with Effect's error channel:

<!-- prettier-ignore -->
```ts
import {
  RepositoryNotFoundError,
  RepositoryPathExistsError,
  DatabaseError
} from "@sandcastle/storage";

const result = yield* storage.repositories.create({
  label: "Test",
  directoryPath: "/existing/path"
}).pipe(
  Effect.catchTag("RepositoryPathExistsError", (error) =>
    Effect.succeed(`Path already exists: ${error.directoryPath}`)
  ),
  Effect.catchTag("DatabaseError", (error) =>
    Effect.fail(`Database error: ${error.message}`)
  )
);
```

### Error Types

| Error                       | Description                         |
| --------------------------- | ----------------------------------- |
| `DatabaseError`             | Generic database operation failure  |
| `DatabaseConnectionError`   | Failed to open/connect to database  |
| `MigrationError`            | Migration application failure       |
| `RepositoryNotFoundError`   | Repository lookup failed            |
| `WorktreeNotFoundError`     | Worktree lookup failed              |
| `SessionNotFoundError`      | Session lookup failed               |
| `AgentNotFoundError`        | Agent lookup failed                 |
| `RepositoryPathExistsError` | Duplicate repository directory path |
| `WorktreePathExistsError`   | Duplicate worktree path             |
| `ForeignKeyViolationError`  | Parent entity doesn't exist         |

## Integrating with Other Packages

### As a Dependency

Add to your package's dependencies:

```json
{
  "dependencies": {
    "@sandcastle/storage": "workspace:*"
  }
}
```

### Layer Composition

Compose with other Effect layers:

<!-- prettier-ignore -->
```ts
import { Layer } from "effect";
import { StorageServiceLive } from "@sandcastle/storage";
import { MyServiceLive } from "./my-service";

// Compose layers
const AppLayer = Layer.mergeAll(
  StorageServiceLive(),
  MyServiceLive
);

// Run program with composed layer
Effect.runPromise(
  program.pipe(Effect.provide(AppLayer))
);
```

### In an HTTP Server

<!-- prettier-ignore -->
```ts
import { BunRuntime } from "@effect/platform-bun";
import { Layer } from "effect";
import { StorageServiceLive } from "@sandcastle/storage";

const ServerLive = HttpServer.layer.pipe(
  Layer.provide(StorageServiceLive())
);

BunRuntime.runMain(Layer.launch(ServerLive));
```

## Database Details

- **Location**: `~/.sandcastle/data.db` (configurable)
- **Engine**: SQLite via `bun:sqlite`
- **Mode**: WAL (Write-Ahead Logging) for better concurrency
- **Foreign Keys**: Enabled with CASCADE delete
- **Migrations**: Version-tracked, applied automatically on `initialize()`

## Exports

<!-- prettier-ignore -->
```ts
// Main entry point
import {
  // Service
  StorageService,
  StorageServiceLive,
  StorageServiceDefault,
  makeStorageService,
  type StorageConfig,

  // Entities
  Repository,
  Worktree,
  Session,
  Agent,
  CreateRepositoryInput,
  CreateWorktreeInput,
  CreateSessionInput,
  CreateAgentInput,
  UpdateRepositoryInput,
  UpdateWorktreeInput,
  UpdateSessionInput,
  UpdateAgentInput,

  // Status types
  WorktreeStatus,
  SessionStatus,
  AgentStatus,

  // Errors
  DatabaseError,
  DatabaseConnectionError,
  MigrationError,
  RepositoryNotFoundError,
  WorktreeNotFoundError,
  SessionNotFoundError,
  AgentNotFoundError,
  RepositoryPathExistsError,
  WorktreePathExistsError,
  ForeignKeyViolationError
} from "@sandcastle/storage";

// Granular imports
import { StorageService } from "@sandcastle/storage/service";
import { StorageServiceLive } from "@sandcastle/storage/live";
import { Repository, Worktree } from "@sandcastle/storage/entities";
import { DatabaseError } from "@sandcastle/storage/errors";
```
