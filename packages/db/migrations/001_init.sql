-- workspaces: a directory on the server, optionally a git repo
CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  path        TEXT NOT NULL,
  is_git      INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX        workspaces_active      ON workspaces(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX workspaces_active_path ON workspaces(path)       WHERE deleted_at IS NULL;

-- sessions: a long-lived terminal attached to a workspace.
-- worktree_mode_json is { kind: "local" } | { kind: "worktree", baseBranch, worktreeBranch }
-- status: lifecycle of the underlying pty (not wired yet — "idle" until PTY layer lands)
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  worktree_mode_json  TEXT NOT NULL,
  workdir             TEXT NOT NULL,
  branch              TEXT,
  status              TEXT NOT NULL CHECK (status IN ('idle','running','exited')) DEFAULT 'idle',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);
CREATE INDEX sessions_by_workspace ON sessions(workspace_id, created_at DESC);
CREATE INDEX sessions_active       ON sessions(deleted_at) WHERE deleted_at IS NULL;

-- blobs: content-addressed storage (kept; useful for screenshots/artifacts later)
CREATE TABLE blobs (
  hash       TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
