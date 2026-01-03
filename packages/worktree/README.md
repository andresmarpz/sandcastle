# @sandcastle/worktree

Effect-based Git worktree management for concurrent development workflows.

Git worktrees allow you to check out multiple branches simultaneously in separate directories. This package provides a type-safe [Effect](https://effect.website/) service for managing worktrees programmatically.

## Installation

```bash
bun add @sandcastle/worktree
```

## Usage

```typescript
import { Effect } from "effect"
import { WorktreeService, WorktreeServiceLive } from "@sandcastle/worktree"

const program = Effect.gen(function* () {
  const worktree = yield* WorktreeService

  // List all worktrees
  const worktrees = yield* worktree.list("/path/to/repo")

  // Create a new worktree with a new branch
  const created = yield* worktree.create({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/repo-feature",
    branch: "feature/new-feature",
    createBranch: true,
    fromRef: "main",
  })

  // Get info about a specific worktree
  const info = yield* worktree.get("/path/to/repo", "/path/to/repo-feature")

  // Remove a worktree
  yield* worktree.remove({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/repo-feature",
  })

  return worktrees
})

const result = await Effect.runPromise(
  program.pipe(Effect.provide(WorktreeServiceLive))
)
```

## API Reference

### `WorktreeService`

Effect service providing worktree operations.

#### `list(repoPath: string): Effect<WorktreeInfo[], GitCommandError>`

List all worktrees for a repository.

```typescript
const worktrees = yield* worktree.list("/path/to/repo")
// [{ path: "/path/to/repo", branch: "main", commit: "abc123", isMain: true }, ...]
```

#### `create(options: CreateWorktreeOptions): Effect<WorktreeInfo, GitCommandError | WorktreeExistsError | BranchExistsError>`

Create a new worktree.

**Options:**
- `repoPath` - Path to the main repository
- `worktreePath` - Path where the new worktree will be created
- `branch` - Branch name to checkout or create
- `createBranch` - If true, creates a new branch
- `fromRef` (optional) - Starting point for the new branch

```typescript
const info = yield* worktree.create({
  repoPath: "/path/to/repo",
  worktreePath: "/path/to/repo-feature",
  branch: "feature/new-feature",
  createBranch: true,
  fromRef: "main",
})
```

#### `get(repoPath: string, worktreePath: string): Effect<WorktreeInfo, GitCommandError | WorktreeNotFoundError>`

Get information about a specific worktree.

```typescript
const info = yield* worktree.get("/path/to/repo", "/path/to/repo-feature")
// { path: "/path/to/repo-feature", branch: "feature/new-feature", commit: "def456", isMain: false }
```

#### `remove(options: RemoveWorktreeOptions): Effect<void, GitCommandError | WorktreeNotFoundError>`

Remove a worktree.

**Options:**
- `repoPath` - Path to the main repository
- `worktreePath` - Path to the worktree to remove
- `force` (optional) - Force removal even with uncommitted changes

```typescript
yield* worktree.remove({
  repoPath: "/path/to/repo",
  worktreePath: "/path/to/repo-feature",
  force: true,
})
```

#### `prune(repoPath: string): Effect<void, GitCommandError>`

Clean up stale worktree references.

```typescript
yield* worktree.prune("/path/to/repo")
```

## Types

### `WorktreeInfo`

```typescript
interface WorktreeInfo {
  path: string      // Absolute path to the worktree
  branch: string    // Branch name (or "HEAD" if detached)
  commit: string    // Current commit SHA
  isMain: boolean   // True if this is the main worktree
}
```

### `CreateWorktreeOptions`

```typescript
interface CreateWorktreeOptions {
  repoPath: string       // Path to main repository
  worktreePath: string   // Path for new worktree
  branch: string         // Branch name
  createBranch: boolean  // Create new branch if true
  fromRef?: string       // Starting point for new branch
}
```

### `RemoveWorktreeOptions`

```typescript
interface RemoveWorktreeOptions {
  repoPath: string      // Path to main repository
  worktreePath: string  // Path to worktree to remove
  force?: boolean       // Force removal
}
```

## Errors

All errors extend Effect's `Data.TaggedError` for pattern matching:

| Error | Description |
|-------|-------------|
| `GitCommandError` | Generic git command failure |
| `WorktreeExistsError` | Worktree already exists at path |
| `WorktreeNotFoundError` | Worktree not found at path |
| `BranchExistsError` | Branch already exists |
| `InvalidRepoError` | Path is not a valid git repository |
| `GitNotFoundError` | Git executable not found |

```typescript
import { WorktreeExistsError, BranchExistsError } from "@sandcastle/worktree"

const result = yield* worktree.create(options).pipe(
  Effect.catchTags({
    WorktreeExistsError: (e) => Effect.succeed(`Worktree exists: ${e.path}`),
    BranchExistsError: (e) => Effect.succeed(`Branch exists: ${e.branch}`),
  })
)
```

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

MIT
