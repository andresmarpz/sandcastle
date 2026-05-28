# Sandcastle WS RPC Contract — MVP

> **Status:** MVP first slice. Companion to `architecture.md` §7. The contract here may still shift — figure-it-out-as-we-go applies — but the shape below is what we're building against right now.

---

## §0. Scope

Two RPC groups, seven methods. Enough to manage Projects and Workspaces end-to-end. Tabs, panes, terminals, and PTYs don't appear here — they live in the client (`architecture.md` §5.3).

| Group | Methods |
|---|---|
| `projects` | `list`, `create`, `rename`, `delete` |
| `workspaces` | `list`, `create`, `delete` |

All methods belong to one `RpcGroup` (`SandcastleRpc`) on `WS /rpc`. No streaming RPCs in MVP.

---

## §1. Entity placeholders

Real schemas land in `@sandcastle/entities`. For this document:

```ts
type ProjectId    = string  // branded
type WorkspaceId  = string  // branded
type AbsolutePath = string
type IsoDateTime  = string

type Project = {
  id:        ProjectId
  name:      string
  rootPath:  AbsolutePath
  isGit:     boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

type Workspace = {
  id:         WorkspaceId
  projectId:  ProjectId
  name:       string
  kind:       "local" | "worktree"
  path:       AbsolutePath
  branch:     string | null
  baseBranch: string | null
  createdAt:  IsoDateTime
  updatedAt:  IsoDateTime
}
```

Soft-deleted rows are filtered out by all list methods; they never appear in RPC return values.

---

## §2. `projects.*`

### §2.1 `projects.list`
```ts
projects.list() → Project[]
```
Returns all active (non-soft-deleted) projects, in creation order.

### §2.2 `projects.create`
```ts
projects.create({
  name:     string,
  rootPath: AbsolutePath,
}) → Project
```
Server behavior:
1. Reject if `rootPath` is not absolute, not a directory, or doesn't exist.
2. Reject if a non-deleted project already has the same `rootPath`.
3. Probe `git rev-parse --is-inside-work-tree` against `rootPath` to set `isGit`.
4. Insert the row; return the persisted `Project`.

`name` is for display only; no uniqueness constraint.

### §2.3 `projects.rename`
```ts
projects.rename({ projectId: ProjectId, name: string }) → Project
```
Updates `name` and `updated_at`. Returns the updated row.

### §2.4 `projects.delete`
```ts
projects.delete({ projectId: ProjectId }) → void
```
Soft-deletes the project and cascades a soft-delete to all of its workspaces in the same transaction. For each cascading worktree workspace, best-effort `git worktree remove --force`.

---

## §3. `workspaces.*`

### §3.1 `workspaces.list`
```ts
workspaces.list({ projectId: ProjectId }) → Workspace[]
```
Returns all active workspaces under the given project, in creation order. Rejects if the project is unknown or soft-deleted.

### §3.2 `workspaces.create`

```ts
workspaces.create({
  projectId: ProjectId,
  name:      string,
  config:
    | { kind: "local" }
    | { kind: "worktree"; branch?: string; baseBranch?: string },
}) → Workspace
```

**`kind: "local"`**
1. Reject if the project is unknown or soft-deleted.
2. Reject if an active local workspace already exists for this project (MVP: one local per project; relaxable later).
3. `path = project.rootPath`.
4. Insert row; return it.

**`kind: "worktree"`**
1. Reject if the project is unknown, soft-deleted, or `isGit = false` (`WorkspaceNotGit`).
2. `path = ~/.sandcastle/worktrees/{projectId}/{workspaceId}`.
3. `branch` defaults to `sandcastle/{shortWorkspaceId}` if omitted.
4. `baseBranch` defaults to the project's current `HEAD` if omitted.
5. `git worktree add -b {branch} {path} {baseBranch}` against the project root.
6. On git failure → no row inserted; return typed error with git stderr.
7. On git success → insert row; return it. If the DB insert fails (rare), undo with `git worktree remove --force`.

### §3.3 `workspaces.delete`
```ts
workspaces.delete({ workspaceId: WorkspaceId }) → void
```
1. Look up the workspace; reject if unknown or already deleted.
2. If `kind = "worktree"`, run `git worktree remove --force {path}`. Tolerate failure (warn + continue).
3. Soft-delete the row.

---

## §4. Errors

Typed error union. Each branch is JSON-tagged on `_tag` per `@effect/rpc`.

### §4.1 `projects.*` errors
| `_tag` | When |
|---|---|
| `ProjectPathInvalid` | `rootPath` not absolute, not a directory, or symlink-looped. |
| `ProjectPathNotFound` | `rootPath` doesn't exist. |
| `ProjectPathConflict` | Another active project already has this `rootPath`. |
| `ProjectNotFound` | The given `projectId` is unknown or soft-deleted. |

### §4.2 `workspaces.*` errors
| `_tag` | When |
|---|---|
| `ProjectNotFound` | The given `projectId` is unknown or soft-deleted. |
| `WorkspaceNotFound` | The given `workspaceId` is unknown or soft-deleted. |
| `WorkspaceNotGit` | `kind: "worktree"` requested against a non-git project. |
| `WorkspaceLocalConflict` | A local workspace already exists for this project. |
| `WorktreeCreateFailed` | `git worktree add` failed; payload includes git stderr. |

All `workspaces.create` errors leave **zero** server-side state behind (no DB row, no orphan worktree).

---

## §5. Notes

### §5.1 No streaming RPCs in MVP
After mutations the client refetches the relevant list. List sizes are tiny (per-user, per-machine), so this is fine. Live `*.subscribe` streams come later if/when multi-client sync becomes a goal (`architecture.md` §9).

### §5.2 No `workspaces.rename` yet
Easy to add when a UI surface demands it. Same shape as `projects.rename`.

### §5.3 No relocation flow
If a project's `rootPath` or a worktree's `path` disappears under the server, MVP's response is "list still works, operations against the broken row error." The user deletes and re-creates. A real relocation RPC is in §9 of `architecture.md`.

---

## §6. Summary table

| RPC | Returns |
|---|---|
| `projects.list()` | `Project[]` |
| `projects.create({ name, rootPath })` | `Project` |
| `projects.rename({ projectId, name })` | `Project` |
| `projects.delete({ projectId })` | `void` |
| `workspaces.list({ projectId })` | `Workspace[]` |
| `workspaces.create({ projectId, name, config })` | `Workspace` |
| `workspaces.delete({ workspaceId })` | `void` |
