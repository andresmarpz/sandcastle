# Sandcastle Project Specification

## Executive Summary

Sandcastle is an **agent orchestrator** for managing ephemeral AI coding instances. It provides a unified interface for spawning, managing, and monitoring multiple AI coding agents (Claude Code instances) running in isolated git worktrees. The application enables parallel development workflows where users can work on multiple features, tickets, or experiments simultaneously—each in its own sandboxed environment with dedicated AI assistance.

The core philosophy is to provide **flexible primitives** that enable users to invent their own workflows, rather than enforcing a rigid process. While the primary use case is ephemeral agent-driven development (create worktree → work on feature → PR → merge → cleanup), the system should accommodate diverse patterns including long-running development branches, experimentation sandboxes, and multi-agent collaboration.

---

## Vision & Goals

### Primary Vision

Enable developers to manage a fleet of AI coding agents working in parallel across isolated environments, with the ability to:

- Spin up new development environments instantly
- Assign AI agents to specific tasks within those environments
- Monitor progress across all active work streams
- Seamlessly transition completed work into the main codebase
- Clean up ephemeral environments after work is merged

### Design Principles

1. **Primitives over Prescriptions**: Build composable primitives (repositories, worktrees, sessions, agents) rather than opinionated workflows. Users should be able to combine these building blocks to match their mental model.

2. **Ephemeral by Default**: Encourage short-lived, focused development environments. Make it trivially easy to create and destroy worktrees. Don't accumulate cruft.

3. **Isolation First**: Each worktree is a complete, isolated copy of the repository. Agents working in one worktree cannot affect another. Failures are contained.

4. **Transparency**: Provide visibility into what agents are doing, what commands they're running, and what changes they're making. Users should never feel like they've lost control.

5. **Server-Driven Architecture**: All state lives on the server. The client is a view into that state. This enables multiple clients, future API access, and reliable persistence.

---

## Core Primitives

### Entity Hierarchy

```
Repository (top-level)
├── Worktree (child of repository)
│   ├── Session (child of worktree) — represented as a "tab"
│   │   └── Agent(s) (running within session)
│   └── Session
│       └── Agent(s)
├── Worktree
│   └── Session
│       └── Agent(s)
└── ...
```

### 1. Repository

A **Repository** represents a tracked git repository that Sandcastle manages. Users add repositories to Sandcastle to enable worktree and session management for that codebase.

**Characteristics:**
- Top-level organizational unit
- References an existing git repository on the filesystem
- Acts as the "parent" from which worktrees are spawned
- Contains metadata for display and organization purposes

**Core Attributes:**
| Attribute | Description |
|-----------|-------------|
| `id` | Unique identifier (UUID) |
| `label` | User-friendly display name (e.g., "Frontend App", "API Server") |
| `directoryPath` | Absolute path to the repository root |
| `defaultBranch` | The primary branch (e.g., `main`, `master`, `develop`) |
| `createdAt` | Timestamp when added to Sandcastle |
| `updatedAt` | Timestamp of last metadata update |

**Future Considerations:**
- Remote URL for displaying GitHub/GitLab links
- Repository-level settings (default worktree location, naming conventions)
- Tags or categories for organization
- Health status (is the repo valid, is git available, etc.)

### 2. Worktree

A **Worktree** is a git worktree—an isolated checkout of the repository that allows parallel development without branch switching. In Sandcastle, worktrees serve as the execution environment for AI agents.

**Characteristics:**
- Child of a Repository
- Physically isolated copy of the codebase
- Has its own branch and working directory
- Can have multiple Sessions (tabs) running concurrently
- Ephemeral by design (intended to be created and destroyed frequently)

**Core Attributes:**
| Attribute | Description |
|-----------|-------------|
| `id` | Unique identifier (UUID) |
| `repositoryId` | Foreign key to parent Repository |
| `path` | Absolute path to the worktree directory |
| `branch` | Git branch checked out in this worktree |
| `name` | Human-readable name (often auto-generated via petname) |
| `baseBranch` | The branch this worktree was created from |
| `status` | Current state (`active`, `stale`, `archived`) |
| `createdAt` | Timestamp of creation |
| `lastAccessedAt` | Timestamp of last activity |

**Lifecycle States:**
- **Active**: Worktree exists and is available for use
- **Stale**: Worktree exists but may have dangling references (needs `git worktree prune`)
- **Archived**: Soft-deleted, can be restored or permanently removed

**Relationship to Git:**
Sandcastle's Worktree entity is a wrapper around `git worktree`. The underlying git commands handle the actual file system operations:
- `git worktree add` — create
- `git worktree list` — enumerate
- `git worktree remove` — delete
- `git worktree prune` — cleanup stale references

### 3. Session

A **Session** represents a logical unit of work within a worktree. Sessions are displayed as "tabs" in the UI, allowing users to organize multiple concurrent activities within the same worktree.

**Characteristics:**
- Child of a Worktree
- Contains one or more Agents
- Represents a focused task or objective
- Can be paused, resumed, or terminated
- Provides conversation context and history

**Core Attributes:**
| Attribute | Description |
|-----------|-------------|
| `id` | Unique identifier (UUID) |
| `worktreeId` | Foreign key to parent Worktree |
| `title` | User-editable title describing the task |
| `description` | Optional longer description or context |
| `status` | Current state (`active`, `paused`, `completed`, `failed`) |
| `createdAt` | Timestamp of creation |
| `lastActivityAt` | Timestamp of last agent interaction |

**Use Cases for Multiple Sessions:**
- Running different agents for different aspects of a task (e.g., one for tests, one for implementation)
- Exploring alternative approaches in parallel
- Separating concerns (e.g., one session for backend, one for frontend)
- Keeping a "scratch" session for experiments while having a "main" session for focused work

**Session Lifecycle:**
1. **Created**: Session initialized, no agents running yet
2. **Active**: One or more agents are running
3. **Paused**: Agents stopped but session state preserved
4. **Completed**: Task finished successfully
5. **Failed**: Task encountered unrecoverable errors

### 4. Agent

An **Agent** is a running instance of an AI coding assistant (Claude Code) executing within a Session. Agents are the workers that actually perform development tasks.

**Characteristics:**
- Child of a Session
- Executes commands, writes code, and interacts with the filesystem
- Has its own conversation history and context
- Can be spawned, terminated, or replaced
- Communicates through a defined interface

**Core Attributes:**
| Attribute | Description |
|-----------|-------------|
| `id` | Unique identifier (UUID) |
| `sessionId` | Foreign key to parent Session |
| `processId` | OS process ID (for management) |
| `status` | Current state (`starting`, `running`, `idle`, `stopped`, `crashed`) |
| `startedAt` | Timestamp when agent was spawned |
| `stoppedAt` | Timestamp when agent terminated (if applicable) |
| `exitCode` | Process exit code (if terminated) |

**Agent States:**
- **Starting**: Process initializing
- **Running**: Actively executing (processing user input or running tools)
- **Idle**: Waiting for input
- **Stopped**: Gracefully terminated
- **Crashed**: Unexpected termination

**Future Considerations:**
- Agent "personality" or configuration (system prompts, allowed tools)
- Resource limits (memory, CPU, time)
- Conversation checkpointing for resume capability
- Multi-agent coordination protocols

---

## Architecture Overview

### Client-Server Model

Sandcastle uses a strict client-server architecture where:

- **Server** (apps/http): Manages all state, runs agents, and exposes RPC endpoints
- **Client** (apps/desktop): Provides the user interface, calls server via RPC

```
┌─────────────────────────────────────────────────────────────┐
│                     Desktop Client                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  React + effect-atom (reactive state management)    │   │
│  │  Tauri (native desktop integration)                 │   │
│  └─────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │ RPC (HTTP + NDJSON)
┌───────────────────────────┴─────────────────────────────────┐
│                      HTTP Server                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Bun + Effect (service composition)                 │   │
│  │  @effect/rpc (type-safe RPC)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────┴───────────────────────────┐   │
│  │              Service Layer                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐      │   │
│  │  │ Repository │ │  Worktree  │ │  Session   │      │   │
│  │  │  Service   │ │  Service   │ │  Service   │      │   │
│  │  └────────────┘ └────────────┘ └────────────┘      │   │
│  │  ┌────────────┐ ┌────────────┐                     │   │
│  │  │   Agent    │ │  Config    │                     │   │
│  │  │  Service   │ │  Service   │                     │   │
│  │  └────────────┘ └────────────┘                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                            │                                │
│  ┌─────────────────────────┴───────────────────────────┐   │
│  │              Data Layer                             │   │
│  │  ┌────────────────────────────────────────────┐    │   │
│  │  │  SQLite Database (bun:sqlite)              │    │   │
│  │  │  - repositories, worktrees, sessions, etc. │    │   │
│  │  └────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Why Client-Server?

1. **State Consistency**: Single source of truth on the server prevents race conditions and conflicts
2. **Process Management**: Agent processes must run on the server where the filesystem lives
3. **Future Extensibility**: Enables web clients, API access, remote development scenarios
4. **Persistence**: Server owns the database; clients can disconnect/reconnect without losing state

### Data Persistence: SQLite

SQLite was chosen for its simplicity, reliability, and embedded nature:

- **No external dependencies**: Ships with Bun (`bun:sqlite`)
- **Single file**: Easy to backup, move, or inspect
- **Transactional**: ACID guarantees for data integrity
- **Performant**: More than sufficient for local application needs
- **Schema flexibility**: Easy to evolve as requirements change

**Database Location:** `~/.sandcastle/data.db` (or configurable)

### Service Layer (Effect.ts)

Services follow the Effect pattern for dependency injection, error handling, and composition:

```typescript
// Service definition
class RepositoryService extends Context.Tag("RepositoryService")<
  RepositoryService,
  {
    list(): Effect<Repository[], DatabaseError>
    get(id: string): Effect<Repository, RepositoryNotFoundError | DatabaseError>
    create(input: CreateRepositoryInput): Effect<Repository, InvalidPathError | DatabaseError>
    update(id: string, input: UpdateRepositoryInput): Effect<Repository, RepositoryNotFoundError | DatabaseError>
    delete(id: string): Effect<void, RepositoryNotFoundError | DatabaseError>
  }
>() {}
```

This pattern enables:
- Clear contracts between layers
- Testability through layer substitution
- Type-safe error handling
- Composable effects

---

## User Interface Concepts

### Navigation Model

```
┌─────────────────────────────────────────────────────────────┐
│  [Repositories ▾]  [+ New Repository]            [Settings] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Repository: frontend-app                           │   │
│  │  Path: ~/projects/frontend-app                      │   │
│  │  Branch: main                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Worktrees                                    [+ New]       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ┌─────────────────┐  ┌─────────────────┐          │   │
│  │  │ brave-fox       │  │ calm-river      │          │   │
│  │  │ feature/login   │  │ fix/nav-bug     │          │   │
│  │  │ 2 sessions      │  │ 1 session       │          │   │
│  │  │ [Open] [Delete] │  │ [Open] [Delete] │          │   │
│  │  └─────────────────┘  └─────────────────┘          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Worktree View (with Sessions as Tabs)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back    brave-fox (feature/login)           [Delete]     │
├─────────────────────────────────────────────────────────────┤
│  [Session 1: Auth Flow] [Session 2: Tests] [+]              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │                   Agent Terminal                    │   │
│  │                                                     │   │
│  │  Claude: I'll implement the login flow. First,     │   │
│  │  let me examine the existing auth utilities...     │   │
│  │                                                     │   │
│  │  > Reading src/utils/auth.ts                       │   │
│  │  > Found existing JWT validation logic             │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  [Send message to agent...]              [Send]     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Pause Agent]  [Terminate Agent]  [Create PR]  [Merge]    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key UI Patterns

1. **Repository Selector**: Persistent dropdown/selector for switching between managed repositories

2. **Worktree Grid**: Visual grid of active worktrees with status indicators, quick actions

3. **Session Tabs**: Each worktree view has tabs for sessions; new sessions can be created with "+"

4. **Agent Terminal**: Real-time view of agent activity, similar to Claude Code's terminal output

5. **Quick Actions**: Context-appropriate actions (Create PR, Merge, Delete) based on current state

---

## Workflow Patterns

While Sandcastle provides primitives rather than enforcing workflows, here are common patterns the design should support:

### Pattern 1: Ephemeral Feature Development

The "golden path" workflow for AI-assisted feature development:

1. **Create**: User creates a new worktree from the repository's main branch
2. **Describe**: User provides the feature/ticket description to a new session
3. **Develop**: Agent implements the feature, user provides guidance as needed
4. **Review**: User reviews changes, requests modifications
5. **PR**: User initiates PR creation (agent or user creates the PR)
6. **Merge**: PR is merged (externally, via GitHub/GitLab)
7. **Cleanup**: Worktree is deleted, session data optionally archived

### Pattern 2: Parallel Exploration

Investigating multiple approaches to a problem:

1. Create multiple worktrees from the same base branch
2. Give each worktree's agent a different approach to try
3. Compare results across worktrees
4. Keep the best approach, delete the others

### Pattern 3: Long-Running Development

For work that spans multiple days or sessions:

1. Create worktree, work on feature
2. End session (agent stops, but worktree persists)
3. Return later, resume or create new session
4. Continue development with context preserved

### Pattern 4: Multi-Agent Collaboration

Using multiple agents within one worktree for different concerns:

1. Session 1: Agent focused on implementation
2. Session 2: Agent focused on testing
3. Session 3: Agent focused on documentation
4. User coordinates between sessions

---

## Data Model

### Entity-Relationship Diagram

```
┌─────────────────┐
│   Repository    │
├─────────────────┤
│ id (PK)         │
│ label           │
│ directoryPath   │
│ defaultBranch   │
│ createdAt       │
│ updatedAt       │
└────────┬────────┘
         │ 1:N
         │
┌────────┴────────┐
│    Worktree     │
├─────────────────┤
│ id (PK)         │
│ repositoryId(FK)│
│ path            │
│ branch          │
│ name            │
│ baseBranch      │
│ status          │
│ createdAt       │
│ lastAccessedAt  │
└────────┬────────┘
         │ 1:N
         │
┌────────┴────────┐
│    Session      │
├─────────────────┤
│ id (PK)         │
│ worktreeId (FK) │
│ title           │
│ description     │
│ status          │
│ createdAt       │
│ lastActivityAt  │
└────────┬────────┘
         │ 1:N
         │
┌────────┴────────┐
│     Agent       │
├─────────────────┤
│ id (PK)         │
│ sessionId (FK)  │
│ processId       │
│ status          │
│ startedAt       │
│ stoppedAt       │
│ exitCode        │
└─────────────────┘
```

### SQL Schema (Conceptual)

```sql
CREATE TABLE repositories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    directory_path TEXT NOT NULL UNIQUE,
    default_branch TEXT NOT NULL DEFAULT 'main',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    path TEXT NOT NULL UNIQUE,
    branch TEXT NOT NULL,
    name TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    created_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL
);

CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    process_id INTEGER,
    status TEXT NOT NULL DEFAULT 'starting',
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    exit_code INTEGER
);
```

---

## Error Handling Philosophy

### Errors as Data

Following Effect.ts conventions, errors are:
- **Typed**: Each error is a distinct type with relevant context
- **Explicit**: Functions declare what errors they can produce
- **Recoverable**: Callers can handle errors appropriately

### Error Categories

1. **User Errors**: Invalid input, missing resources, permission issues
   - Should be presented clearly to the user with actionable guidance

2. **System Errors**: Git failures, filesystem issues, process crashes
   - Should be logged for debugging, presented with "try again" or "contact support"

3. **Transient Errors**: Network issues, temporary unavailability
   - Should be retried automatically with backoff

### Example Error Types

```typescript
// Repository errors
class RepositoryNotFoundError extends Schema.TaggedError<RepositoryNotFoundError>("RepositoryNotFoundError") {}
class InvalidRepositoryPathError extends Schema.TaggedError<InvalidRepositoryPathError>("InvalidRepositoryPathError") {}
class RepositoryAlreadyExistsError extends Schema.TaggedError<RepositoryAlreadyExistsError>("RepositoryAlreadyExistsError") {}

// Worktree errors (existing)
class WorktreeNotFoundError extends Schema.TaggedError<WorktreeNotFoundError>("WorktreeNotFoundError") {}
class WorktreeExistsError extends Schema.TaggedError<WorktreeExistsError>("WorktreeExistsError") {}

// Session errors
class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>("SessionNotFoundError") {}
class SessionAlreadyActiveError extends Schema.TaggedError<SessionAlreadyActiveError>("SessionAlreadyActiveError") {}

// Agent errors
class AgentSpawnError extends Schema.TaggedError<AgentSpawnError>("AgentSpawnError") {}
class AgentNotRunningError extends Schema.TaggedError<AgentNotRunningError>("AgentNotRunningError") {}
```

---

## Future Considerations

### Near-Term Enhancements

- **Conversation Persistence**: Store agent conversations for replay and analysis
- **Templates**: Pre-configured session templates for common tasks
- **Keyboard Shortcuts**: Power-user navigation and actions
- **Notifications**: Desktop notifications for agent completion or errors

### Medium-Term Features

- **GitHub/GitLab Integration**: Direct PR creation, status sync, webhook handling
- **Agent Profiles**: Different system prompts, tool configurations, or models
- **Metrics & Analytics**: Track time spent, tokens used, success rates
- **Collaboration**: Share worktrees or sessions with team members

### Long-Term Vision

- **Remote Execution**: Run agents on remote machines or containers
- **Multi-Model Support**: Use different AI models for different tasks
- **Plugin System**: Extend functionality through user-defined plugins
- **Web Interface**: Browser-based client for remote access
- **API Access**: Programmatic control for automation and integration

---

## Glossary

| Term | Definition |
|------|------------|
| **Agent** | A running instance of Claude Code executing within a session |
| **Repository** | A tracked git repository managed by Sandcastle |
| **Session** | A logical unit of work (displayed as a tab) containing agents |
| **Worktree** | A git worktree providing an isolated development environment |
| **Petname** | Auto-generated memorable name for worktrees (e.g., "brave-fox") |
| **RPC** | Remote Procedure Call - the protocol for client-server communication |
| **Effect** | The functional programming library used for services and composition |

---

## Appendix: Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | Bun | JavaScript/TypeScript runtime |
| Desktop Framework | Tauri | Native desktop application shell |
| Frontend | React 19 | User interface |
| State Management | effect-atom | Reactive state with Effect integration |
| Styling | Tailwind CSS | Utility-first CSS |
| Backend Framework | Effect + @effect/platform | Service composition, HTTP server |
| RPC | @effect/rpc | Type-safe client-server communication |
| Database | SQLite (bun:sqlite) | Persistent storage |
| Git Operations | Native git CLI | Worktree management |
| AI Integration | Claude Code CLI | Agent execution |
