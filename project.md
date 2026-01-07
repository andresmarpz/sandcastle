# Sandcastle - Project Documentation

> **An open source agent orchestrator for managing ephemeral AI coding instances.**

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Repository Structure](#repository-structure)
4. [Packages](#packages)
   - [@sandcastle/cli](#sandcastlecli)
   - [@sandcastle/petname](#sandcastlepetname)
   - [@sandcastle/worktree](#sandcastleworktree)
5. [Technical Stack](#technical-stack)
6. [Configuration](#configuration)
7. [Data Storage](#data-storage)
8. [Development Workflow](#development-workflow)
9. [API Reference](#api-reference)
10. [Git History & Evolution](#git-history--evolution)

---

## Project Overview

### What is Sandcastle?

Sandcastle is a CLI tool and set of libraries designed to spawn, manage, and monitor multiple AI coding agents (like Claude Code) running in isolated environments. Each agent works in its own sandboxed container with a dedicated git worktree, completes a task, opens a PR, and then disappears.

### Why Sandcastle?

- **Parallel work**: Run 3-4 agents simultaneously on different tickets
- **Isolation**: Each agent gets its own container and git worktree
- **Ephemeral**: Spin up for a task, tear down when done
- **Simple**: Automates the tedious setup of worktrees and environments

### Current Status

Early development. The project provides foundational tooling for:
- Git worktree management
- Project registration and tracking
- Auto-generated memorable worktree names

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SANDCASTLE CLI                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           CLI Entry Point                                ││
│  │                          (packages/cli/index.ts)                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                       │
│            ┌─────────────────────────┴─────────────────────────┐            │
│            │                                                    │            │
│            ▼                                                    ▼            │
│  ┌─────────────────────┐                          ┌─────────────────────┐   │
│  │   Project Commands  │                          │  Worktree Commands  │   │
│  ├─────────────────────┤                          ├─────────────────────┤   │
│  │ • project add       │                          │ • worktree create   │   │
│  │ • project list      │                          │ • worktree list     │   │
│  │ • project remove    │                          │ • worktree delete   │   │
│  └─────────┬───────────┘                          │ • worktree open     │   │
│            │                                       │ • worktree prune    │   │
│            │                                       └─────────┬───────────┘   │
│            │                                                  │              │
│            ▼                                                  ▼              │
│  ┌─────────────────────┐                          ┌─────────────────────┐   │
│  │   ProjectService    │                          │  WorktreeService    │   │
│  │  (Local SQLite DB)  │                          │  (@sandcastle/      │   │
│  │                     │                          │   worktree)         │   │
│  └─────────┬───────────┘                          └─────────┬───────────┘   │
│            │                                                  │              │
│            ▼                                                  ▼              │
│  ┌─────────────────────┐                          ┌─────────────────────┐   │
│  │ ~/sandcastle/       │                          │  Git CLI Commands   │   │
│  │   sandcastle.db     │                          │  (git worktree)     │   │
│  └─────────────────────┘                          └─────────────────────┘   │
│                                                                              │
│            ┌─────────────────────────────────────────────────┐              │
│            │              @sandcastle/petname                 │              │
│            │         (Auto-generates worktree names)          │              │
│            └─────────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Effect-Based Architecture

The project uses [Effect](https://effect.website/) throughout for:
- **Dependency Injection**: Services defined as `Context.Tag` with separate Live and Test implementations
- **Error Handling**: Custom error types extending `Data.TaggedError` for type-safe error matching
- **Async Operations**: Effect's functional async primitives for composable operations
- **Testing**: Layer-based test implementations for mocking services

---

## Repository Structure

```
sandcastle/
├── .claude/                      # Claude Code configuration
│   ├── commands/
│   │   └── create-gh-pr.md       # Custom PR creation skill
│   └── settings.json             # Permission allowlist
├── .conductor/                   # (Empty - reserved for future use)
├── .git/                         # Git repository
├── .gitignore                    # Git ignore rules
├── .turbo/                       # Turborepo cache
│   └── cache/                    # Build cache storage
├── apps/                         # (Empty - reserved for applications)
├── node_modules/                 # Dependencies (bun workspace links)
├── packages/                     # Monorepo packages
│   ├── cli/                      # @sandcastle/cli
│   ├── petname/                  # @sandcastle/petname
│   └── worktree/                 # @sandcastle/worktree
├── bun.lock                      # Bun lockfile
├── CLAUDE.md                     # Claude Code project instructions
├── package.json                  # Root workspace configuration
├── README.md                     # Project README
├── tsconfig.json                 # Root TypeScript configuration
└── turbo.json                    # Turborepo pipeline configuration
```

---

## Packages

### @sandcastle/cli

**Purpose**: Command-line interface for managing projects and git worktrees.

**Location**: `packages/cli/`

**Published Binary**: `sandcastle`

#### Directory Structure

```
packages/cli/
├── commands/
│   ├── index.ts                  # Command re-exports
│   ├── project.ts                # Project management commands
│   ├── project.test.ts           # Project command tests
│   ├── worktree.ts               # Worktree management commands
│   └── worktree.test.ts          # Worktree command tests
├── services/
│   ├── index.ts                  # Service re-exports
│   ├── errors.ts                 # Custom error types
│   ├── project.ts                # ProjectService interface
│   ├── project-live.ts           # SQLite implementation
│   └── project-test.ts           # In-memory test implementation
├── testing/
│   ├── index.ts                  # Test utilities & helpers
│   └── worktree-test.ts          # WorktreeService test mock
├── index.ts                      # CLI entry point
├── package.json
├── README.md
└── tsconfig.json
```

#### Available Commands

##### Project Commands

| Command | Description | Arguments/Options |
|---------|-------------|-------------------|
| `sandcastle project add <path>` | Register a git repository as a project | `--name <name>`: Custom project name |
| `sandcastle project list` | List all registered projects | None |
| `sandcastle project remove <name>` | Unregister a project | None |

##### Worktree Commands

| Command | Description | Arguments/Options |
|---------|-------------|-------------------|
| `sandcastle worktree create <project> [name]` | Create a new worktree | `--from <ref>`: Base ref; `-o, --open`: Open in editor; `-e, --editor <cmd>`: Editor command |
| `sandcastle worktree list <project>` | List all worktrees | None |
| `sandcastle worktree delete <project> <name>` | Delete a worktree | `-f, --force`: Force removal |
| `sandcastle worktree open <project> [name]` | Open worktree in editor | `-e, --editor <cmd>`: Editor command (default: cursor) |
| `sandcastle worktree prune <project>` | Clean up stale references | None |

#### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@effect/cli` | ^0.54.0 | Type-safe CLI argument parsing |
| `@effect/platform` | ^0.77.0 | Platform abstraction layer |
| `@effect/platform-node` | ^0.72.0 | Node.js platform implementation |
| `@sandcastle/petname` | workspace:* | Auto-generate worktree names |
| `@sandcastle/worktree` | workspace:* | Git worktree operations |
| `effect` | ^3.19.14 | Effect system runtime |

#### Service Architecture

**ProjectService Interface**:
```typescript
interface ProjectService {
  add(gitPath: string, name?: string): Effect<Project, ProjectExistsError | InvalidGitRepoError>
  list(): Effect<Project[]>
  get(name: string): Effect<Project, ProjectNotFoundError>
  remove(name: string): Effect<void, ProjectNotFoundError>
}

interface Project {
  id: string        // UUID
  name: string      // Project name
  gitPath: string   // Absolute path to git repo
  createdAt: string // ISO timestamp
}
```

**Error Types**:
- `ProjectExistsError` - Project with name already registered
- `ProjectNotFoundError` - Project not found by name
- `InvalidGitRepoError` - Path is not a valid git repository

---

### @sandcastle/petname

**Purpose**: Generate memorable, human-friendly random names (petnames) like "brave-fox" or "calm-swift-river".

**Location**: `packages/petname/`

#### Directory Structure

```
packages/petname/
├── src/
│   ├── errors.ts                 # InvalidWordCountError
│   ├── live.ts                   # Core generation logic
│   ├── petname.test.ts           # Comprehensive test suite
│   ├── service.ts                # Effect service interface
│   ├── types.ts                  # TypeScript interfaces
│   └── words.ts                  # Adjective and noun word lists
├── index.ts                      # Package entry point
├── package.json
├── README.md
└── tsconfig.json
```

#### Exported Functions

| Export | Type | Description |
|--------|------|-------------|
| `petname(options?)` | Function | Returns petname string (e.g., "brave-fox") |
| `generate(options?)` | Function | Returns `{ name, words }` object |
| `PetnameService` | Effect Tag | Service for dependency injection |
| `PetnameServiceLive` | Layer | Live implementation layer |
| `InvalidWordCountError` | Error | Error when wordCount < 1 |

#### API Reference

```typescript
// Simple API
petname()                        // "brave-fox"
petname({ wordCount: 3 })        // "calm-swift-river"
petname({ separator: "_" })      // "brave_fox"

// With metadata
const result = generate()
// { name: "brave-fox", words: ["brave", "fox"] }

// Effect API
const program = Effect.gen(function* () {
  const service = yield* PetnameService
  const pet = yield* service.generate({ wordCount: 2 })
  return pet.name
})

await Effect.runPromise(
  program.pipe(Effect.provide(PetnameServiceLive))
)
```

#### Options

```typescript
interface GenerateOptions {
  wordCount?: number   // Default: 2
  separator?: string   // Default: "-"
}

interface Petname {
  name: string                 // "brave-fox"
  words: readonly string[]     // ["brave", "fox"]
}
```

#### Word Generation Pattern

| Word Count | Pattern | Example |
|------------|---------|---------|
| 1 | noun | "fox" |
| 2 | adjective-noun | "brave-fox" |
| 3 | adjective-adjective-noun | "calm-swift-river" |
| n | (n-1) adjectives + noun | ... |

#### Word Lists

- **Adjectives**: 172 words (e.g., "able", "brave", "calm", "swift", "vivid")
- **Nouns**: 226 words (e.g., "fox", "river", "cloud", "eagle")
- **Selection criteria**: Short (3-8 chars), easy to type, positive/neutral connotations

#### Randomness

Uses `crypto.getRandomValues()` for cryptographically secure random selection.

---

### @sandcastle/worktree

**Purpose**: Effect-based Git worktree management library providing type-safe, functional programming approach to managing Git worktrees.

**Location**: `packages/worktree/`

#### Directory Structure

```
packages/worktree/
├── src/
│   ├── errors.ts                 # 6 custom error types
│   ├── live.ts                   # WorktreeServiceLive implementation
│   ├── service.ts                # WorktreeService interface
│   └── types.ts                  # TypeScript interfaces
├── index.ts                      # Package entry point
├── package.json
├── README.md
└── tsconfig.json
```

#### Exported Types

```typescript
interface WorktreeInfo {
  path: string      // Absolute path to worktree
  branch: string    // Branch name (or "HEAD" if detached)
  commit: string    // Current commit SHA
  isMain: boolean   // True if main worktree
}

interface CreateWorktreeOptions {
  repoPath: string       // Path to main repository
  worktreePath: string   // Path for new worktree
  branch: string         // Branch name
  createBranch: boolean  // Create new branch if true
  fromRef?: string       // Starting point for new branch
}

interface RemoveWorktreeOptions {
  repoPath: string       // Path to main repository
  worktreePath: string   // Path to worktree to remove
  force?: boolean        // Force removal
}
```

#### Error Types

| Error | Fields | Description |
|-------|--------|-------------|
| `GitNotFoundError` | `message` | Git executable not found |
| `WorktreeExistsError` | `path` | Worktree already exists at path |
| `WorktreeNotFoundError` | `path` | Worktree not found at path |
| `BranchExistsError` | `branch` | Branch already exists |
| `InvalidRepoError` | `path`, `message` | Path is not a valid git repository |
| `GitCommandError` | `command`, `stderr`, `exitCode` | Generic git command failure |

#### Service Operations

```typescript
interface WorktreeService {
  create(options: CreateWorktreeOptions): Effect<WorktreeInfo, GitCommandError | WorktreeExistsError | BranchExistsError>
  list(repoPath: string): Effect<WorktreeInfo[], GitCommandError>
  remove(options: RemoveWorktreeOptions): Effect<void, GitCommandError | WorktreeNotFoundError>
  get(repoPath: string, worktreePath: string): Effect<WorktreeInfo, GitCommandError | WorktreeNotFoundError>
  prune(repoPath: string): Effect<void, GitCommandError>
}
```

#### Usage Example

```typescript
import { WorktreeService, WorktreeServiceLive } from "@sandcastle/worktree"
import { Effect } from "effect"

const program = Effect.gen(function* () {
  const service = yield* WorktreeService

  // Create a new worktree
  const worktree = yield* service.create({
    repoPath: "/path/to/repo",
    worktreePath: "/path/to/worktree",
    branch: "feature-branch",
    createBranch: true,
    fromRef: "main"
  })

  return worktree
})

await Effect.runPromise(
  program.pipe(Effect.provide(WorktreeServiceLive))
)
```

---

## Technical Stack

### Core Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| **Bun** | 1.1.0+ | JavaScript/TypeScript runtime, package manager, test runner |
| **TypeScript** | 5.9.3 | Type-safe JavaScript |
| **Effect** | 3.19.14 | Functional programming library for async/effects |
| **Turborepo** | 2.7.2 | Monorepo build system |

### Bun-Specific Features Used

- **Runtime**: `bun <file>` for running TypeScript directly
- **Package Management**: `bun install`, `bun.lock`
- **Testing**: `bun test` with `bun:test` imports
- **Shell**: `Bun.$\`command\`` for shell operations
- **SQLite**: `bun:sqlite` built-in module (no external dependencies)
- **File Operations**: `Bun.file()` for file I/O
- **Workspaces**: Native workspace support in `package.json`

### Effect Library Usage

```typescript
// Dependency Injection
class MyService extends Context.Tag("MyService")<MyService, { ... }>() {}

// Error Types
class MyError extends Data.TaggedError<MyError>("MyError")<{ field: string }> {}

// Layers
const MyServiceLive = Layer.succeed(MyService, implementation)

// Effects
Effect.gen(function* () {
  const service = yield* MyService
  const result = yield* service.method()
  return result
})

// Running
await Effect.runPromise(program.pipe(Effect.provide(layer)))
```

---

## Configuration

### TypeScript Configuration (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  }
}
```

### Turborepo Configuration (`turbo.json`)

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^typecheck"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### Claude Code Settings (`.claude/settings.json`)

Pre-approved commands for automated execution:

```json
{
  "permissions": {
    "allow": [
      "mcp__ide__getDiagnostics",
      "Bash(bun:*)",
      "Bash(find:*)",
      "Bash(cat:*)",
      "Bash(bunx tsc:*)",
      "Bash(bun test:*)",
      "Bash(bun install:*)",
      "Bash(git checkout:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(gh pr:*)"
    ]
  }
}
```

### Claude Code Custom Commands (`.claude/commands/`)

#### `create-gh-pr.md`

A custom skill for creating GitHub Pull Requests with:
1. Git context gathering (status, diff, log)
2. Code change analysis
3. Quality checks (lint, typecheck, test)
4. Conventional commit workflow
5. PR creation with structured template

---

## Data Storage

### SQLite Database

**Location**: `~/sandcastle/sandcastle.db`

**Schema**:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  git_path TEXT NOT NULL,
  created_at TEXT NOT NULL
)
```

### Worktree Directory Structure

```
~/sandcastle/
├── sandcastle.db                 # SQLite project database
└── worktrees/
    └── {project-name}/
        └── {worktree-name}/      # Git worktree directory
```

### Example

```
~/sandcastle/
├── sandcastle.db
└── worktrees/
    └── my-app/
        ├── brave-fox/            # Worktree: feature branch
        ├── calm-river/           # Worktree: bugfix branch
        └── swift-eagle/          # Worktree: experiment branch
```

---

## Development Workflow

### Prerequisites

- Bun 1.1.0 or later
- Git

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd sandcastle

# Install dependencies
bun install
```

### Common Commands

```bash
# Run all builds
bun run build

# Run all tests
bun test

# Type check all packages
bun run typecheck

# Run a specific package's tests
cd packages/cli && bun test
cd packages/petname && bun test

# Run the CLI in development
bun packages/cli/index.ts --help
```

### Package Development

Each package can be developed independently:

```bash
# CLI
cd packages/cli
bun run dev
bun test

# Petname
cd packages/petname
bun test

# Worktree
cd packages/worktree
bun run typecheck
```

### Testing Architecture

The project uses a layered testing approach:

1. **Test Implementations**: Each service has an in-memory test implementation
   - `ProjectServiceTest` - Map-based project storage
   - `WorktreeServiceTest` - Map-based worktree storage

2. **Test Utilities** (`packages/cli/testing/`):
   - `makeTestLayer()` - Combines test service layers
   - `makeTestLayerWithCapture()` - Adds log capture for assertions
   - `runTestCommand()` - Runs effects with test layers
   - `mockProject()` - Creates mock Project objects

3. **Snapshot Testing**: Commands are tested with output snapshots

---

## API Reference

### Package Exports Summary

#### @sandcastle/cli

```typescript
// Commands (internal)
export { projectCommand, worktreeCommand } from "./commands"

// Services
export { ProjectService, type Project, ProjectServiceLive } from "./services"

// Errors
export { ProjectExistsError, ProjectNotFoundError, InvalidGitRepoError } from "./services"

// Testing utilities
export {
  makeProjectServiceTest,
  ProjectServiceTest,
  makeWorktreeServiceTest,
  WorktreeServiceTest,
  makeTestLayer,
  makeTestLayerWithCapture,
  runTestCommand,
  runTestCommandExpectError,
  mockProject
} from "./testing"
```

#### @sandcastle/petname

```typescript
// Main API
export { petname, generate } from "./src/live"

// Effect API
export { PetnameService } from "./src/service"
export { PetnameServiceLive } from "./src/live"

// Types
export type { GenerateOptions, Petname } from "./src/types"

// Errors
export { InvalidWordCountError } from "./src/errors"
```

#### @sandcastle/worktree

```typescript
// Service
export { WorktreeService } from "./src/service"
export { WorktreeServiceLive } from "./src/live"

// Types
export type {
  WorktreeInfo,
  CreateWorktreeOptions,
  RemoveWorktreeOptions
} from "./src/types"

// Errors
export {
  GitNotFoundError,
  WorktreeExistsError,
  WorktreeNotFoundError,
  BranchExistsError,
  InvalidRepoError,
  GitCommandError
} from "./src/errors"
```

---

## Git History & Evolution

### Commit History (Chronological)

| Commit | Message | Description |
|--------|---------|-------------|
| `a0b8e1c` | init repository | Initial commit |
| `ca73f34` | create README | Added README.md |
| `654a351` | create base bun project | Set up package.json with Bun |
| `3dbf45a` | create turbo.json file | Added Turborepo configuration |
| `105dc7d` | create .gitignore | Added git ignore rules |
| `c8c6ce4` | use bun default CLAUDE.md | Added Claude Code instructions |
| `671d3cb` | feat: add @sandcastle/petname | Added petname generation package |
| `3680a1a` | Merge PR #1 | Merged feat/petname-package |
| `6a5055a` | feat: add effect-based git worktree service | Core worktree service |
| `4444efe` | chore: add package config for @sandcastle/worktree | Package setup |
| `6966e40` | docs: add readme for @sandcastle/worktree | Documentation |
| `bd1d5ee` | Merge PR #2 | Merged feat/worktree-package |
| `df96d3f` | chore: add package config for @sandcastle/cli | CLI package setup |
| `2446b4e` | feat: add project service with sqlite storage | SQLite-backed project storage |
| `5216340` | feat: add cli commands | Project and worktree commands |
| `abb7594` | test: add test layers and utilities | Testing infrastructure |
| `3e960f8` | test: add comprehensive tests | Full test coverage |
| `22a584f` | Merge PR #3 | Merged feat/cli-package |
| `cf76bdd` | add create-gh-pr claude command | Custom Claude skill |
| `6dd20c6` | feat: auto-generate worktree names with petname | Petname integration |
| `6ce0387` | Merge PR #4 | Merged feat/worktree-auto-name |
| `0cfd708` | feat: add editor options to worktree commands | Editor support |
| `578a10f` | docs: document editor options | Documentation |
| `8968994` | track claude settings file | Commit .claude/settings.json |
| `c72166e` | expose sandcastle binary | Added bin entry |

### Active Branches

| Branch | Status | Description |
|--------|--------|-------------|
| `main` | Active | Main development branch |
| `andresmarpz/agent-server` | Feature | (In development) |
| `andresmarpz/boston` | Feature | (In development) |
| `sandy-dove` | Feature | Likely worktree test |
| `test-feature` | Feature | Test branch |
| `test-sqlite` | Feature | SQLite testing |

---

## Future Development

Based on the project structure and README, planned features may include:

1. **Agent Server** (branch: `andresmarpz/agent-server`)
   - Server for managing multiple AI coding agents
   - Container orchestration

2. **Apps Directory**
   - Currently empty, reserved for applications
   - Potential web dashboard or agent management UI

3. **Conductor** (`.conductor/` directory)
   - Reserved for orchestration configuration
   - Potential agent coordination logic

4. **Container Integration**
   - Docker/container support for isolated agent environments
   - Automatic environment setup per worktree

---

## Summary

Sandcastle is a well-architected monorepo project built with modern TypeScript and the Effect library for functional programming patterns. It consists of three packages:

1. **@sandcastle/cli** - Main CLI tool with project and worktree management
2. **@sandcastle/petname** - Random memorable name generation
3. **@sandcastle/worktree** - Git worktree operations wrapper

The project follows best practices:
- Type-safe error handling with Effect
- Dependency injection via Effect's Context system
- Comprehensive test coverage with mock implementations
- Clean separation of concerns between packages
- Modern Bun runtime for performance

Current state: **Early development** with core functionality complete for worktree management and project registration.
