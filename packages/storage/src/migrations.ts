import type { Database } from "bun:sqlite";
import { Console, Effect } from "effect";
import { MigrationError } from "./errors";

interface Migration {
	version: number;
	name: string;
	up: string;
}

const migrations: Migration[] = [
	{
		version: 1,
		name: "initial_schema",
		up: `
			-- Repositories table
			CREATE TABLE IF NOT EXISTS repositories (
				id TEXT PRIMARY KEY,
				label TEXT NOT NULL,
				directoryPath TEXT NOT NULL UNIQUE,
				defaultBranch TEXT NOT NULL,
				pinned INTEGER NOT NULL DEFAULT 0,
				createdAt TEXT NOT NULL,
				updatedAt TEXT NOT NULL
			);

			-- Worktrees table
			CREATE TABLE IF NOT EXISTS worktrees (
				id TEXT PRIMARY KEY,
				repositoryId TEXT NOT NULL,
				path TEXT NOT NULL UNIQUE,
				branch TEXT NOT NULL,
				name TEXT NOT NULL,
				baseBranch TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('active', 'stale', 'archived')),
				createdAt TEXT NOT NULL,
				lastAccessedAt TEXT NOT NULL,
				FOREIGN KEY (repositoryId) REFERENCES repositories(id) ON DELETE CASCADE
			);

			-- Sessions table
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				worktreeId TEXT,
				workingPath TEXT NOT NULL,
				title TEXT NOT NULL,
				description TEXT,
				status TEXT NOT NULL CHECK (status IN ('created', 'active', 'paused', 'completed', 'failed')),
				claudeSessionId TEXT,
				model TEXT,
				totalCostUsd REAL NOT NULL DEFAULT 0,
				inputTokens INTEGER NOT NULL DEFAULT 0,
				outputTokens INTEGER NOT NULL DEFAULT 0,
				createdAt TEXT NOT NULL,
				lastActivityAt TEXT NOT NULL,
				FOREIGN KEY (worktreeId) REFERENCES worktrees(id) ON DELETE CASCADE
			);

			-- Chat messages table
			CREATE TABLE IF NOT EXISTS chat_messages (
				id TEXT PRIMARY KEY,
				sessionId TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
				parts TEXT NOT NULL,
				createdAt TEXT NOT NULL,
				metadata TEXT,
				FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
			);

			-- Indexes for common queries
			CREATE INDEX IF NOT EXISTS idx_worktrees_repositoryId ON worktrees(repositoryId);
			CREATE INDEX IF NOT EXISTS idx_sessions_worktreeId ON sessions(worktreeId);
			CREATE INDEX IF NOT EXISTS idx_chat_messages_sessionId ON chat_messages(sessionId);
		`,
	},
	{
		version: 2,
		name: "streaming_support",
		up: `
			-- Turns table: tracks individual conversation turns within a session
			CREATE TABLE IF NOT EXISTS turns (
				id TEXT PRIMARY KEY,
				sessionId TEXT NOT NULL,
				status TEXT NOT NULL CHECK (status IN ('streaming', 'completed', 'interrupted', 'error')),
				startedAt TEXT NOT NULL,
				completedAt TEXT,
				reason TEXT,
				FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS idx_turns_sessionId ON turns(sessionId);

			-- Add turn tracking columns to chat_messages
			ALTER TABLE chat_messages ADD COLUMN turnId TEXT REFERENCES turns(id) ON DELETE CASCADE;
			ALTER TABLE chat_messages ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
			CREATE INDEX IF NOT EXISTS idx_chat_messages_turnId ON chat_messages(turnId);

			-- Session cursors table: tracks history cursor for gap loading
			CREATE TABLE IF NOT EXISTS session_cursors (
				sessionId TEXT PRIMARY KEY,
				lastMessageId TEXT,
				lastMessageAt TEXT,
				updatedAt TEXT NOT NULL,
				FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
			);
		`,
	},
];

const ensureMigrationsTable = (db: Database): void => {
	db.run(`
		CREATE TABLE IF NOT EXISTS _migrations (
			version INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			appliedAt TEXT NOT NULL
		)
	`);
};

const getAppliedVersions = (db: Database): Set<number> => {
	const rows = db.query("SELECT version FROM _migrations").all() as {
		version: number;
	}[];
	return new Set(rows.map((r) => r.version));
};

const applyMigration = (db: Database, migration: Migration) =>
	Effect.gen(function* () {
		yield* Console.log(`Running migration: ${migration.name}`);
		yield* Effect.try({
			try: () => {
				db.run(migration.up);
				db.run(
					"INSERT INTO _migrations (version, name, appliedAt) VALUES (?, ?, ?)",
					[migration.version, migration.name, new Date().toISOString()],
				);
			},
			catch: (error) =>
				new MigrationError({
					version: migration.version,
					message: `Failed to apply migration "${migration.name}": ${error}`,
					cause: error,
				}),
		});
	});

export const runMigrations = (
	db: Database,
): Effect.Effect<void, MigrationError> =>
	Effect.gen(function* () {
		yield* Effect.try({
			try: () => ensureMigrationsTable(db),
			catch: (error) =>
				new MigrationError({
					version: 0,
					message: `Failed to create migrations table: ${error}`,
					cause: error,
				}),
		});

		const appliedVersions = yield* Effect.try({
			try: () => getAppliedVersions(db),
			catch: (error) =>
				new MigrationError({
					version: 0,
					message: `Failed to get applied migrations: ${error}`,
					cause: error,
				}),
		});

		const pendingMigrations = migrations
			.filter((m) => !appliedVersions.has(m.version))
			.sort((a, b) => a.version - b.version);

		for (const migration of pendingMigrations) {
			yield* applyMigration(db, migration);
		}
	});
