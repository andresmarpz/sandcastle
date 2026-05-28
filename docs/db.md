# Sandcastle DB Layer

> **Status:** MVP. Companion to `architecture.md`. Two tables (plus migration bookkeeping) — that's the whole shape for now.

---

## §0. Scope

- All persistent state for one Sandcastle server lives in a single SQLite database at `~/.sandcastle/sandcastle.db`.
- MVP entities: **Projects** and **Workspaces**. That's it.
- Worktree directories live on disk under `~/.sandcastle/worktrees/`, not in the DB.
- Plaintext on disk. Encryption-at-rest is deferred.

---

## §1. Engine setup

Driver: Bun's native `bun:sqlite`. No ORM. Queries written by hand using small per-table repo modules (`apps/server/src/db/repos/*`).

Pragmas applied at startup:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous  = NORMAL;
PRAGMA busy_timeout = 5000;
```

WAL is overkill for the MVP's tiny write load, but it costs nothing and stays out of our way when we add streaming entities later.

---

## §2. Schema

```
projects ─── workspaces
```

`ON DELETE CASCADE` follows the parent edge. Soft delete (`deleted_at` timestamp) is the default at both levels. Hard delete is reserved for future purge tooling.

### §2.1 `projects`

```sql
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,                  -- ProjectId (uuid, branded)
  name       TEXT NOT NULL,
  root_path  TEXT NOT NULL,                     -- absolute, canonical, immutable
  is_git     INTEGER NOT NULL,                  -- bool: probed at create
  created_at TEXT NOT NULL,                     -- ISO-8601
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX        projects_active           ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX projects_active_root_path ON projects(root_path)  WHERE deleted_at IS NULL;
```

Notes:
- `root_path` uniqueness applies only to active projects — a soft-deleted project doesn't block re-adding the same path.
- `is_git` is fixed at creation. If a directory becomes / ceases to be a git repo later, MVP doesn't re-probe.

### §2.2 `workspaces`

```sql
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,                                       -- WorkspaceId
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('local','worktree')),
  path        TEXT NOT NULL,                                          -- absolute, immutable
  branch      TEXT,                                                   -- worktree only
  base_branch TEXT,                                                   -- worktree only
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX        workspaces_by_project   ON workspaces(project_id);
CREATE INDEX        workspaces_active        ON workspaces(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX workspaces_active_path   ON workspaces(path)       WHERE deleted_at IS NULL;
```

Notes:
- `path` uniqueness applies only to active workspaces.
- `kind`, `path`, and `project_id` are immutable after creation. The only mutable user-facing field is `name`.
- For `kind = 'local'`, `branch` and `base_branch` are NULL by convention. The schema doesn't enforce this — application code is the source of truth here.

### §2.3 `_migrations`

```sql
CREATE TABLE _migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  checksum   TEXT NOT NULL
);
```

Created by the migration runner if it doesn't exist (see §4).

---

## §3. Write path

Operations are small enough that each runs in a single SQLite transaction directly. There's no spine, no projection, no fan-out in MVP.

### §3.1 `projects.create`
1. Validate `root_path` (absolute, exists, is a directory).
2. Probe `git rev-parse --is-inside-work-tree` for `is_git`.
3. `INSERT INTO projects (...)`.

### §3.2 `workspaces.create`
Two flavors, both transactional:

**`kind: "local"`**
1. Validate project exists.
2. Validate `path` equals the project's `root_path` (MVP rule; can loosen later).
3. `INSERT INTO workspaces (...)`.

**`kind: "worktree"`**
1. Validate project exists and `is_git = true`.
2. Compute `path = ~/.sandcastle/worktrees/{projectId}/{workspaceId}`.
3. Run `git worktree add -b {branch} {path} {baseBranch}` against the project root.
4. On git failure → no DB row inserted; surface git stderr as a typed error.
5. On success → `INSERT INTO workspaces (...)`.
6. If the INSERT fails after step 3 (rare), undo with `git worktree remove --force`.

### §3.3 `workspaces.delete`
1. Look up the workspace.
2. If `kind = 'worktree'`, run `git worktree remove --force {path}`. We tolerate failure here (warn + continue).
3. `UPDATE workspaces SET deleted_at = ... WHERE id = ?`.

### §3.4 `projects.delete`
1. `UPDATE projects SET deleted_at = ... WHERE id = ?`. The `ON DELETE CASCADE` is from foreign keys, so soft-delete needs an explicit cascade — we soft-delete child workspaces in the same transaction.
2. For each child workspace with `kind = 'worktree'`, run `git worktree remove --force {path}` on a best-effort basis. (We don't want a single stuck worktree to block deleting the project.)

---

## §4. Migrations

Raw SQL files at `apps/server/migrations/NNN_description.sql`. Applied in filename order by an in-house runner at `apps/server/src/db/migrations.ts`.

Runner behavior on startup:
1. Open the DB; create `_migrations` if absent.
2. Read all files in `migrations/` matching `^\d{3}_.+\.sql$`.
3. For each file with version > MAX(applied), apply in a transaction; record `(version, name, now, checksum)` on success.
4. For each already-applied version, verify the checksum matches; warn loudly on mismatch but don't refuse to start (dev-time edits expected).

`001_init.sql` contains both tables in §2 plus indexes. Future migrations are additive (new tables, new columns with `DEFAULT`, new indexes). No down-migrations.

---

## §5. What's NOT in the DB

| Data | Location | Reason |
|---|---|---|
| Worktree contents | `~/.sandcastle/worktrees/{projectId}/{workspaceId}` | Managed by `git worktree`. DB stores only the path. |
| Tab / pane / split layout | Client-side (Electron `userData`) | Client owns layout (`architecture.md` §5.3). |
| PTY processes and scrollback | Client-side (`node-pty`) | Terminals run in the client in MVP. |
| Config (port, etc.) | A static value or a tiny config file under `~/.sandcastle/` — TBD when we need it | Not user-facing yet. |

---

## §6. Cross-references

| Topic | Where |
|---|---|
| Workspace creation flow | `architecture.md` §5.2 |
| Reconciliation on startup | `architecture.md` §6.3 |
| RPC surface that drives writes | `rpc-contract.md` |
| Repo paths | `directories.md` §3 |
