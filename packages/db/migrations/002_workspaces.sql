CREATE TABLE workspaces (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('local','worktree')),
  path        TEXT NOT NULL,
  branch      TEXT,
  base_branch TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX        workspaces_by_project   ON workspaces(project_id);
CREATE INDEX        workspaces_active        ON workspaces(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX workspaces_active_path   ON workspaces(path)       WHERE deleted_at IS NULL;
