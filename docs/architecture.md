# Sandcastle Architecture

> **Status:** MVP design. Pivoted away from the earlier ACP-relay model. The shape will keep evolving — figure-it-out-as-we-go is the explicit posture.

## §0. Summary

Sandcastle is a **project + worktree organizer with a built-in terminal UI**. It tracks **Projects** (codebases) and **Workspaces** (their checkouts — either the original folder or a `git worktree`). A Bun server owns those entities and manages worktrees on disk. An Electron client renders the UI and runs terminals locally via `node-pty`.

In MVP, server and client are co-located on the same machine. Terminals operate on the local filesystem that both processes share. Multi-device and remote terminals are deferred.

```
┌──────────────────────────┐  WebSocket (Effect RPC)   ┌──────────────────────┐
│  Electron client         │ ◀───────────────────────▶ │  Sandcastle server    │
│  React renderer          │                           │  (Bun)                │
│  Tabs + Panes (local)    │                           │                       │
│  PTYs via node-pty       │                           │  Projects + Workspaces│
│  (run on local FS)       │                           │  Worktree management  │
└──────────────────────────┘                           └──────────────────────┘
       Knows: WS RPC, local PTY                            Owns: SQLite,
       state, tab/pane layout.                              git worktrees on disk.
```

What MVP deliberately doesn't include: agents, ACP, chat sessions, streaming output, per-session event log, blobs, multi-client sync, app-level auth. Future seams in §9.

---

## §1. Goals, non-goals, MVP scope

### §1.1 Goals
- **Organize codebases by Project.** Every Project has a root path; Workspaces hang off it.
- **First-class git worktrees.** Creating a worktree Workspace runs `git worktree add`; deleting tears it down.
- **A solid local terminal UI.** Tabs, splits, panes — all client-local, instant.
- **Server-owned entities.** Adding/removing projects and workspaces goes through the server so the on-disk state and DB stay in sync.

### §1.2 Non-goals (MVP)
- Multi-user / multi-tenant.
- App-level auth (server binds localhost).
- Encryption at rest.
- Remote terminals or server-owned PTYs.
- Coding-agent integration as a first-class entity. Agents may run *inside* a terminal, but the server doesn't model them.
- Multi-client subscribe / live updates across devices.

### §1.3 MVP scope (must work)
- Add a Project by absolute path; probe `isGit`.
- List Projects.
- Add a Workspace under a Project — `local` (the project's root path) or `worktree` (creates a branch + `git worktree add`).
- List Workspaces under a Project.
- Delete a Workspace; if it's a worktree, run `git worktree remove`.
- Soft-delete a Project (cascade to its Workspaces).
- A client UI that lists Projects, lists Workspaces under a chosen Project, opens Tabs of terminals against a Workspace, and supports splits within a Tab.

### §1.4 Deferred
| Feature | Notes |
|---|---|
| Claude session tracking | New entity scoped to Workspace; tail `~/.claude/projects/**/*.jsonl`; correlate to terminal PIDs. |
| Server-owned PTYs | When we want reconnect, scrollback persistence, or remote terminals. |
| Multi-client subscribe | Promote list endpoints to live `*.subscribe` streams. |
| App-level auth | WS upgrade middleware; `userId` column migrations. |
| Persisted tab/pane layout on server | When cross-device sync becomes a goal. |
| Per-project MCP / agent config | New table keyed by `projectId`. |

---

## §2. Architectural commitments

1. **Server owns entities; client owns layout.** Projects and Workspaces live in SQLite. Tabs, splits, panes, and PTYs live in the client.
2. **On-disk state and DB stay in sync.** Worktree creation/removal is part of the workspace-create/delete transaction. Startup reconciliation cleans up orphans.
3. **WS RPC is the only application-control surface.** No REST. No IPC backdoors from the client to the server.

---

## §3. Actors

### §3.1 Server (Bun)
- One process. Binds `127.0.0.1:{port}` in MVP.
- Owns SQLite at `~/.sandcastle/sandcastle.db`.
- Owns worktrees at `~/.sandcastle/worktrees/{projectId}/{workspaceId}`.
- Hosts a single endpoint: `WS /rpc`.

### §3.2 Client (Electron)
- React renderer + thin main/preload bridge.
- Holds an Effect RPC client over WebSocket.
- Spawns local PTYs via `node-pty` for each terminal pane. PTY `cwd` is the Workspace's `path`.
- Persists tab/pane layout locally (Electron `userData`).

---

## §4. Wire format

| Hop | Protocol | Encoding | Vocabulary |
|---|---|---|---|
| Client ↔ Server | Effect RPC over WebSocket | JSON | Our RPC schema (see `rpc-contract.md`) |

WebSocket frames are JSON. No file uploads in MVP.

---

## §5. Domain model

### §5.1 Project

```ts
Project = {
  id:        ProjectId        // uuid, branded
  name:      string           // user-facing label
  rootPath:  AbsolutePath     // absolute path on the local filesystem
  isGit:     boolean          // probed at create-time
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt: IsoDateTime | null
}
```

- `rootPath` is canonical and immutable. Worktrees of this project are git worktrees off this path.
- `isGit` is set at creation via `git rev-parse --is-inside-work-tree` against `rootPath`. We don't auto-redetect.
- Soft delete cascades to workspaces.
- No implicit "main" Workspace; the user adds a `local` Workspace explicitly if they want one.

### §5.2 Workspace

```ts
Workspace = {
  id:          WorkspaceId
  projectId:   ProjectId
  name:        string                 // user-facing label
  kind:        "local" | "worktree"
  path:        AbsolutePath            // resolved at creation; immutable
  branch:      string | null           // worktree only
  baseBranch:  string | null           // worktree only — what it was branched off
  createdAt:   IsoDateTime
  updatedAt:   IsoDateTime
  deletedAt:   IsoDateTime | null
}
```

- `kind: "local"` — `path` equals the project's `rootPath`. `branch` and `baseBranch` are null.
- `kind: "worktree"`:
  - `path` is `~/.sandcastle/worktrees/{projectId}/{workspaceId}` (server-controlled).
  - At creation: `git worktree add -b {branch} {path} {baseBranch}`. Default `branch` is `sandcastle/{shortWorkspaceId}` if not provided. Default `baseBranch` is the project's current `HEAD`.
  - At soft-delete: `git worktree remove --force {path}`. The branch itself is left in place.

`projectId`, `kind`, and `path` are immutable after creation.

### §5.3 Tabs and panes (client-only)

Pure client state. A Tab is a tree of Panes joined by horizontal/vertical splits. Each Pane runs one PTY spawned with `cwd = workspace.path`. Layout persistence is the client's job; the server doesn't know how many terminals are open or how they're arranged.

---

## §6. Storage

### §6.1 Layout on disk

```
~/.sandcastle/
├── sandcastle.db                       # SQLite
└── worktrees/
    └── {projectId}/
        └── {workspaceId}/              # `git worktree add` lives here
```

### §6.2 SQLite schema

See `db.md`. Two real tables in MVP (`projects`, `workspaces`) plus the migration bookkeeping table.

### §6.3 Reconciliation on startup
- Enumerate `~/.sandcastle/worktrees/*/*`. For any directory not matched by an active Workspace row → log + best-effort `git worktree remove`.
- For each active Workspace row with `kind: "worktree"` whose `path` doesn't exist → leave it; the next operation against it returns a typed error.

### §6.4 First run
If `~/.sandcastle/` doesn't exist:
1. Create `~/.sandcastle/` and `~/.sandcastle/worktrees/`.
2. Apply migrations (creating `sandcastle.db` and the schema).
3. Start listening.

---

## §7. WS RPC surface

See `rpc-contract.md` for full wire definitions. MVP groups:

- `projects.{list, create, rename, delete}`
- `workspaces.{list, create, delete}`

No streaming RPCs in MVP. The client refetches lists after mutations.

---

## §8. Failure modes

| Failure | What happens |
|---|---|
| `git worktree add` fails | Transaction rolls back; no DB row. Caller gets typed error with git stderr. |
| Worktree directory disappeared between server runs | Workspace row remains. Operations against it return a typed error. UI can prompt the user to delete. |
| Project `rootPath` disappeared | Same shape — workspace operations under it return a typed error. No relocation flow in MVP. |
| Server killed mid-operation | SQLite is transactional. Worst case: worktree added but DB row didn't commit → startup reconciliation removes the orphan. |

---

## §9. Future-feature seams

| Feature | How it slots in |
|---|---|
| Claude session tracking | New `ClaudeSession` entity scoped to Workspace. Server watches `~/.claude/projects/**/*.jsonl`. Terminal panes report their PID; client correlates. |
| Server-owned PTYs | New `terminals` table (Workspace-scoped). New `terminals.*` RPC group with a streaming `terminals.subscribe(terminalId)` for I/O. |
| Multi-client | Add `subscribe` RPCs alongside the list endpoints. Layout migrates to server entities only if cross-device sync becomes a goal. |
| App-level auth | WS upgrade middleware; `userId` columns by migration. |
| MCP / agent configuration | Per-project `mcp_config` table; consumed by whatever agent runs inside a terminal. |

---

## §10. Glossary

- **Project** — a codebase. Has a `rootPath` on disk. Groups Workspaces.
- **Workspace** — a checkout of a project. Either the original folder (`kind: "local"`) or a `git worktree` (`kind: "worktree"`).
- **Tab** — a client-side grouping of panes; local UI state.
- **Pane** — a client-side terminal area, backed by a local PTY.
- **PTY** — pseudoterminal process spawned by the client via `node-pty`.
- **Worktree** — a `git worktree`-managed checkout under `~/.sandcastle/worktrees/`.
