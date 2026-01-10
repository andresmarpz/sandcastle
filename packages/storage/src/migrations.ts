import type { Database } from "bun:sqlite";
import { Effect } from "effect";

import { MigrationError } from "./errors";

interface Migration {
  version: number;
  description: string;
  up: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema",
    up: `
      -- Repositories
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        directory_path TEXT NOT NULL UNIQUE,
        default_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Worktrees
      CREATE TABLE IF NOT EXISTS worktrees (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        path TEXT NOT NULL UNIQUE,
        branch TEXT NOT NULL,
        name TEXT NOT NULL,
        base_branch TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'stale', 'archived')),
        created_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL
      );

      -- Sessions
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL REFERENCES worktrees(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'created' CHECK(status IN ('created', 'active', 'paused', 'completed', 'failed')),
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL
      );

      -- Agents
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        process_id INTEGER,
        status TEXT NOT NULL DEFAULT 'starting' CHECK(status IN ('starting', 'running', 'idle', 'stopped', 'crashed')),
        started_at TEXT NOT NULL,
        stopped_at TEXT,
        exit_code INTEGER
      );
    `
  },
  {
    version: 2,
    description: "Add pinned field to repositories",
    up: `ALTER TABLE repositories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;`
  },
  {
    version: 3,
    description: "Add chat messages table",
    up: `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content_type TEXT NOT NULL CHECK(content_type IN (
          'text', 'tool_use', 'tool_result', 'thinking', 'error', 'ask_user'
        )),
        content TEXT NOT NULL,
        parent_tool_use_id TEXT,
        uuid TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(session_id, sequence_number)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, sequence_number);
    `
  },
  {
    version: 4,
    description: "Add Claude-specific session fields",
    up: `
      ALTER TABLE sessions ADD COLUMN claude_session_id TEXT;
      ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT 'claude-sonnet-4-5-20250929';
      ALTER TABLE sessions ADD COLUMN total_cost_usd REAL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0;
    `
  }
];

export const runMigrations = (db: Database): Effect.Effect<void, MigrationError> =>
  Effect.gen(function* () {
    // Create migrations tracking table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    // Get current schema version
    const result = db
      .query<{ version: number }, []>("SELECT MAX(version) as version FROM _migrations")
      .get();
    const currentVersion = result?.version ?? 0;

    // Apply pending migrations
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        yield* Effect.try({
          try: () => {
            db.run("BEGIN TRANSACTION");
            try {
              db.run(migration.up);
              db.run(
                "INSERT INTO _migrations (version, description, applied_at) VALUES (?, ?, ?)",
                [migration.version, migration.description, new Date().toISOString()]
              );
              db.run("COMMIT");
            } catch (error) {
              db.run("ROLLBACK");
              throw error;
            }
          },
          catch: error =>
            new MigrationError({
              version: migration.version,
              message: `Failed to apply migration: ${migration.description}`,
              cause: error
            })
        });
      }
    }
  });

export const getCurrentVersion = (db: Database): number => {
  try {
    const result = db
      .query<{ version: number }, []>("SELECT MAX(version) as version FROM _migrations")
      .get();
    return result?.version ?? 0;
  } catch {
    return 0;
  }
};
