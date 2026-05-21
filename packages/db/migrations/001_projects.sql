CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  root_path  TEXT NOT NULL,
  is_git     INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX        projects_active           ON projects(deleted_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX projects_active_root_path ON projects(root_path)  WHERE deleted_at IS NULL;
