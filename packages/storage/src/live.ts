import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Database, type SQLQueryBindings } from "bun:sqlite";
import { Effect, Layer, Schema } from "effect";

import {
  Agent,
  ChatMessage,
  MessageContent,
  Repository,
  Session,
  Worktree,
  type MessageContentType,
  type MessageRole
} from "./entities";
import {
  AgentNotFoundError,
  ChatMessageNotFoundError,
  DatabaseConnectionError,
  DatabaseError,
  ForeignKeyViolationError,
  RepositoryNotFoundError,
  RepositoryPathExistsError,
  SessionNotFoundError,
  WorktreeNotFoundError,
  WorktreePathExistsError
} from "./errors";
import { runMigrations } from "./migrations";
import { StorageService } from "./service";

// ─── Helpers ──────────────────────────────────────────────────

const generateId = () => crypto.randomUUID();

const nowIso = () => new Date().toISOString();

// Generic database operation wrapper
const tryDb = <T>(operation: string, fn: () => T): Effect.Effect<T, DatabaseError> =>
  Effect.try({
    try: fn,
    catch: error =>
      new DatabaseError({
        operation,
        message: error instanceof Error ? error.message : String(error),
        cause: error
      })
  });

// Row mappers
const rowToRepository = (row: Record<string, unknown>): Repository =>
  new Repository({
    id: row["id"] as string,
    label: row["label"] as string,
    directoryPath: row["directory_path"] as string,
    defaultBranch: row["default_branch"] as string,
    pinned: Boolean(row["pinned"]),
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string
  });

const rowToWorktree = (row: Record<string, unknown>): Worktree =>
  new Worktree({
    id: row["id"] as string,
    repositoryId: row["repository_id"] as string,
    path: row["path"] as string,
    branch: row["branch"] as string,
    name: row["name"] as string,
    baseBranch: row["base_branch"] as string,
    status: row["status"] as "active" | "stale" | "archived",
    createdAt: row["created_at"] as string,
    lastAccessedAt: row["last_accessed_at"] as string
  });

const rowToSession = (row: Record<string, unknown>): Session =>
  new Session({
    id: row["id"] as string,
    worktreeId: row["worktree_id"] as string,
    title: row["title"] as string,
    description: (row["description"] as string) ?? null,
    status: row["status"] as "created" | "active" | "paused" | "completed" | "failed",
    claudeSessionId: (row["claude_session_id"] as string) ?? null,
    model: (row["model"] as string) ?? null,
    totalCostUsd: (row["total_cost_usd"] as number) ?? 0,
    inputTokens: (row["input_tokens"] as number) ?? 0,
    outputTokens: (row["output_tokens"] as number) ?? 0,
    createdAt: row["created_at"] as string,
    lastActivityAt: row["last_activity_at"] as string
  });

const rowToAgent = (row: Record<string, unknown>): Agent =>
  new Agent({
    id: row["id"] as string,
    sessionId: row["session_id"] as string,
    processId: (row["process_id"] as number) ?? null,
    status: row["status"] as "starting" | "running" | "idle" | "stopped" | "crashed",
    startedAt: row["started_at"] as string,
    stoppedAt: (row["stopped_at"] as string) ?? null,
    exitCode: (row["exit_code"] as number) ?? null
  });

const rowToChatMessage = (row: Record<string, unknown>): ChatMessage => {
  const contentJson = row["content"] as string;
  const contentParsed = JSON.parse(contentJson);
  const content = Schema.decodeUnknownSync(MessageContent)(contentParsed);

  return new ChatMessage({
    id: row["id"] as string,
    sessionId: row["session_id"] as string,
    sequenceNumber: row["sequence_number"] as number,
    role: row["role"] as MessageRole,
    contentType: row["content_type"] as MessageContentType,
    content,
    parentToolUseId: (row["parent_tool_use_id"] as string) ?? null,
    uuid: (row["uuid"] as string) ?? null,
    createdAt: row["created_at"] as string
  });
};

// ─── Configuration ────────────────────────────────────────────

export interface StorageConfig {
  /** Path to database file. Defaults to ~/.sandcastle/data.db */
  databasePath?: string;
}

// ─── Service Factory ──────────────────────────────────────────

export const makeStorageService = (
  config: StorageConfig = {}
): Effect.Effect<typeof StorageService.Service, DatabaseConnectionError> =>
  Effect.gen(function* () {
    // Resolve database path
    const defaultPath = path.join(os.homedir(), ".sandcastle", "data.db");
    const dbPath = config.databasePath ?? defaultPath;

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      yield* Effect.try({
        try: () => fs.mkdirSync(dbDir, { recursive: true }),
        catch: error =>
          new DatabaseConnectionError({
            path: dbPath,
            message: `Failed to create database directory: ${error}`
          })
      });
    }

    // Open database
    const db = yield* Effect.try({
      try: () => new Database(dbPath, { create: true, strict: true }),
      catch: error =>
        new DatabaseConnectionError({
          path: dbPath,
          message: `Failed to open database: ${error}`
        })
    });

    // Enable WAL mode and foreign keys
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA foreign_keys = ON");

    // Run migrations automatically on service creation
    yield* runMigrations(db).pipe(
      Effect.mapError(
        migrationError =>
          new DatabaseConnectionError({
            path: dbPath,
            message: `Migration failed: ${migrationError.message}`
          })
      )
    );

    // Build the service implementation
    const service: typeof StorageService.Service = {
      initialize: () => runMigrations(db),

      close: () =>
        tryDb("close", () => {
          db.close();
        }),

      // ─── Repositories ───────────────────────────────────

      repositories: {
        list: () =>
          tryDb("repositories.list", () =>
            db
              .query<
                Record<string, unknown>,
                []
              >("SELECT * FROM repositories ORDER BY pinned DESC, created_at DESC")
              .all()
              .map(rowToRepository)
          ),

        get: id =>
          Effect.gen(function* () {
            const row = yield* tryDb("repositories.get", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT * FROM repositories WHERE id = ?")
                .get(id)
            );
            if (!row) {
              return yield* Effect.fail(new RepositoryNotFoundError({ id }));
            }
            return rowToRepository(row);
          }),

        getByPath: directoryPath =>
          Effect.gen(function* () {
            const row = yield* tryDb("repositories.getByPath", () =>
              db
                .query<
                  Record<string, unknown>,
                  [string]
                >("SELECT * FROM repositories WHERE directory_path = ?")
                .get(directoryPath)
            );
            if (!row) {
              return yield* Effect.fail(new RepositoryNotFoundError({ id: directoryPath }));
            }
            return rowToRepository(row);
          }),

        create: input =>
          Effect.gen(function* () {
            const now = nowIso();
            const id = generateId();
            const defaultBranch = input.defaultBranch ?? "main";

            // Check if path already exists
            const existing = yield* tryDb("repositories.create.check", () =>
              db
                .query<
                  Record<string, unknown>,
                  [string]
                >("SELECT id FROM repositories WHERE directory_path = ?")
                .get(input.directoryPath)
            );

            if (existing) {
              return yield* Effect.fail(
                new RepositoryPathExistsError({ directoryPath: input.directoryPath })
              );
            }

            yield* tryDb("repositories.create", () =>
              db.run(
                `INSERT INTO repositories (id, label, directory_path, default_branch, pinned, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, input.label, input.directoryPath, defaultBranch, 0, now, now]
              )
            );

            return new Repository({
              id,
              label: input.label,
              directoryPath: input.directoryPath,
              defaultBranch,
              pinned: false,
              createdAt: now,
              updatedAt: now
            });
          }),

        update: (id, input) =>
          Effect.gen(function* () {
            const existing = yield* service.repositories.get(id);
            const now = nowIso();

            const updates: string[] = ["updated_at = ?"];
            const values: SQLQueryBindings[] = [now];

            if (input.label !== undefined) {
              updates.push("label = ?");
              values.push(input.label);
            }
            if (input.defaultBranch !== undefined) {
              updates.push("default_branch = ?");
              values.push(input.defaultBranch);
            }
            if (input.pinned !== undefined) {
              updates.push("pinned = ?");
              values.push(input.pinned ? 1 : 0);
            }

            values.push(id);

            yield* tryDb("repositories.update", () =>
              db.run(`UPDATE repositories SET ${updates.join(", ")} WHERE id = ?`, values)
            );

            return new Repository({
              ...existing,
              label: input.label ?? existing.label,
              defaultBranch: input.defaultBranch ?? existing.defaultBranch,
              pinned: input.pinned ?? existing.pinned,
              updatedAt: now
            });
          }),

        delete: id =>
          Effect.gen(function* () {
            yield* service.repositories.get(id);
            yield* tryDb("repositories.delete", () =>
              db.run("DELETE FROM repositories WHERE id = ?", [id])
            );
          })
      },

      // ─── Worktrees ──────────────────────────────────────

      worktrees: {
        list: () =>
          tryDb("worktrees.list", () =>
            db
              .query<
                Record<string, unknown>,
                []
              >("SELECT * FROM worktrees ORDER BY created_at DESC")
              .all()
              .map(rowToWorktree)
          ),

        listByRepository: repositoryId =>
          tryDb("worktrees.listByRepository", () =>
            db
              .query<
                Record<string, unknown>,
                [string]
              >("SELECT * FROM worktrees WHERE repository_id = ? ORDER BY created_at DESC")
              .all(repositoryId)
              .map(rowToWorktree)
          ),

        get: id =>
          Effect.gen(function* () {
            const row = yield* tryDb("worktrees.get", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT * FROM worktrees WHERE id = ?")
                .get(id)
            );
            if (!row) {
              return yield* Effect.fail(new WorktreeNotFoundError({ id }));
            }
            return rowToWorktree(row);
          }),

        getByPath: worktreePath =>
          Effect.gen(function* () {
            const row = yield* tryDb("worktrees.getByPath", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT * FROM worktrees WHERE path = ?")
                .get(worktreePath)
            );
            if (!row) {
              return yield* Effect.fail(new WorktreeNotFoundError({ id: worktreePath }));
            }
            return rowToWorktree(row);
          }),

        create: input =>
          Effect.gen(function* () {
            const now = nowIso();
            const id = generateId();
            const status = input.status ?? "active";

            // Check if path already exists
            const existingPath = yield* tryDb("worktrees.create.checkPath", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT id FROM worktrees WHERE path = ?")
                .get(input.path)
            );

            if (existingPath) {
              return yield* Effect.fail(new WorktreePathExistsError({ path: input.path }));
            }

            // Check if repository exists
            const existingRepo = yield* tryDb("worktrees.create.checkRepo", () =>
              db
                .query<
                  Record<string, unknown>,
                  [string]
                >("SELECT id FROM repositories WHERE id = ?")
                .get(input.repositoryId)
            );

            if (!existingRepo) {
              return yield* Effect.fail(
                new ForeignKeyViolationError({
                  entity: "Worktree",
                  foreignKey: "repositoryId",
                  foreignId: input.repositoryId
                })
              );
            }

            yield* tryDb("worktrees.create", () =>
              db.run(
                `INSERT INTO worktrees (id, repository_id, path, branch, name, base_branch, status, created_at, last_accessed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  input.repositoryId,
                  input.path,
                  input.branch,
                  input.name,
                  input.baseBranch,
                  status,
                  now,
                  now
                ]
              )
            );

            return new Worktree({
              id,
              repositoryId: input.repositoryId,
              path: input.path,
              branch: input.branch,
              name: input.name,
              baseBranch: input.baseBranch,
              status,
              createdAt: now,
              lastAccessedAt: now
            });
          }),

        update: (id, input) =>
          Effect.gen(function* () {
            const existing = yield* service.worktrees.get(id);

            const updates: string[] = [];
            const values: SQLQueryBindings[] = [];

            if (input.status !== undefined) {
              updates.push("status = ?");
              values.push(input.status);
            }
            if (input.lastAccessedAt !== undefined) {
              updates.push("last_accessed_at = ?");
              values.push(input.lastAccessedAt);
            }

            if (updates.length === 0) return existing;

            values.push(id);

            yield* tryDb("worktrees.update", () =>
              db.run(`UPDATE worktrees SET ${updates.join(", ")} WHERE id = ?`, values)
            );

            return new Worktree({
              ...existing,
              status: input.status ?? existing.status,
              lastAccessedAt: input.lastAccessedAt ?? existing.lastAccessedAt
            });
          }),

        delete: id =>
          Effect.gen(function* () {
            yield* service.worktrees.get(id);
            yield* tryDb("worktrees.delete", () =>
              db.run("DELETE FROM worktrees WHERE id = ?", [id])
            );
          }),

        touch: id =>
          Effect.gen(function* () {
            yield* service.worktrees.get(id);
            yield* tryDb("worktrees.touch", () =>
              db.run("UPDATE worktrees SET last_accessed_at = ? WHERE id = ?", [nowIso(), id])
            );
          })
      },

      // ─── Sessions ───────────────────────────────────────

      sessions: {
        list: () =>
          tryDb("sessions.list", () =>
            db
              .query<Record<string, unknown>, []>("SELECT * FROM sessions ORDER BY created_at DESC")
              .all()
              .map(rowToSession)
          ),

        listByWorktree: worktreeId =>
          tryDb("sessions.listByWorktree", () =>
            db
              .query<
                Record<string, unknown>,
                [string]
              >("SELECT * FROM sessions WHERE worktree_id = ? ORDER BY created_at DESC")
              .all(worktreeId)
              .map(rowToSession)
          ),

        get: id =>
          Effect.gen(function* () {
            const row = yield* tryDb("sessions.get", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT * FROM sessions WHERE id = ?")
                .get(id)
            );
            if (!row) {
              return yield* Effect.fail(new SessionNotFoundError({ id }));
            }
            return rowToSession(row);
          }),

        create: input =>
          Effect.gen(function* () {
            const now = nowIso();
            const id = generateId();
            const status = input.status ?? "created";
            const description = input.description ?? null;

            // Check if worktree exists
            const existingWorktree = yield* tryDb("sessions.create.checkWorktree", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT id FROM worktrees WHERE id = ?")
                .get(input.worktreeId)
            );

            if (!existingWorktree) {
              return yield* Effect.fail(
                new ForeignKeyViolationError({
                  entity: "Session",
                  foreignKey: "worktreeId",
                  foreignId: input.worktreeId
                })
              );
            }

            yield* tryDb("sessions.create", () =>
              db.run(
                `INSERT INTO sessions (id, worktree_id, title, description, status, claude_session_id, model, total_cost_usd, input_tokens, output_tokens, created_at, last_activity_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  input.worktreeId,
                  input.title,
                  description,
                  status,
                  null,
                  null,
                  0,
                  0,
                  0,
                  now,
                  now
                ]
              )
            );

            return new Session({
              id,
              worktreeId: input.worktreeId,
              title: input.title,
              description,
              status,
              claudeSessionId: null,
              model: null,
              totalCostUsd: 0,
              inputTokens: 0,
              outputTokens: 0,
              createdAt: now,
              lastActivityAt: now
            });
          }),

        update: (id, input) =>
          Effect.gen(function* () {
            const existing = yield* service.sessions.get(id);

            const updates: string[] = [];
            const values: SQLQueryBindings[] = [];

            if (input.title !== undefined) {
              updates.push("title = ?");
              values.push(input.title);
            }
            if (input.description !== undefined) {
              updates.push("description = ?");
              values.push(input.description);
            }
            if (input.status !== undefined) {
              updates.push("status = ?");
              values.push(input.status);
            }
            if (input.claudeSessionId !== undefined) {
              updates.push("claude_session_id = ?");
              values.push(input.claudeSessionId);
            }
            if (input.model !== undefined) {
              updates.push("model = ?");
              values.push(input.model);
            }
            if (input.totalCostUsd !== undefined) {
              updates.push("total_cost_usd = ?");
              values.push(input.totalCostUsd);
            }
            if (input.inputTokens !== undefined) {
              updates.push("input_tokens = ?");
              values.push(input.inputTokens);
            }
            if (input.outputTokens !== undefined) {
              updates.push("output_tokens = ?");
              values.push(input.outputTokens);
            }
            if (input.lastActivityAt !== undefined) {
              updates.push("last_activity_at = ?");
              values.push(input.lastActivityAt);
            }

            if (updates.length === 0) return existing;

            values.push(id);

            yield* tryDb("sessions.update", () =>
              db.run(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`, values)
            );

            return new Session({
              ...existing,
              title: input.title ?? existing.title,
              description:
                input.description !== undefined ? input.description : existing.description,
              status: input.status ?? existing.status,
              claudeSessionId:
                input.claudeSessionId !== undefined
                  ? input.claudeSessionId
                  : existing.claudeSessionId,
              model: input.model !== undefined ? input.model : existing.model,
              totalCostUsd: input.totalCostUsd ?? existing.totalCostUsd,
              inputTokens: input.inputTokens ?? existing.inputTokens,
              outputTokens: input.outputTokens ?? existing.outputTokens,
              lastActivityAt: input.lastActivityAt ?? existing.lastActivityAt
            });
          }),

        delete: id =>
          Effect.gen(function* () {
            yield* service.sessions.get(id);
            yield* tryDb("sessions.delete", () =>
              db.run("DELETE FROM sessions WHERE id = ?", [id])
            );
          }),

        touch: id =>
          Effect.gen(function* () {
            yield* service.sessions.get(id);
            yield* tryDb("sessions.touch", () =>
              db.run("UPDATE sessions SET last_activity_at = ? WHERE id = ?", [nowIso(), id])
            );
          })
      },

      // ─── Agents ─────────────────────────────────────────

      agents: {
        list: () =>
          tryDb("agents.list", () =>
            db
              .query<Record<string, unknown>, []>("SELECT * FROM agents ORDER BY started_at DESC")
              .all()
              .map(rowToAgent)
          ),

        listBySession: sessionId =>
          tryDb("agents.listBySession", () =>
            db
              .query<
                Record<string, unknown>,
                [string]
              >("SELECT * FROM agents WHERE session_id = ? ORDER BY started_at DESC")
              .all(sessionId)
              .map(rowToAgent)
          ),

        get: id =>
          Effect.gen(function* () {
            const row = yield* tryDb("agents.get", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT * FROM agents WHERE id = ?")
                .get(id)
            );
            if (!row) {
              return yield* Effect.fail(new AgentNotFoundError({ id }));
            }
            return rowToAgent(row);
          }),

        create: input =>
          Effect.gen(function* () {
            const now = nowIso();
            const id = generateId();
            const status = input.status ?? "starting";
            const processId = input.processId ?? null;

            // Check if session exists
            const existingSession = yield* tryDb("agents.create.checkSession", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT id FROM sessions WHERE id = ?")
                .get(input.sessionId)
            );

            if (!existingSession) {
              return yield* Effect.fail(
                new ForeignKeyViolationError({
                  entity: "Agent",
                  foreignKey: "sessionId",
                  foreignId: input.sessionId
                })
              );
            }

            yield* tryDb("agents.create", () =>
              db.run(
                `INSERT INTO agents (id, session_id, process_id, status, started_at, stopped_at, exit_code)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, input.sessionId, processId, status, now, null, null]
              )
            );

            return new Agent({
              id,
              sessionId: input.sessionId,
              processId,
              status,
              startedAt: now,
              stoppedAt: null,
              exitCode: null
            });
          }),

        update: (id, input) =>
          Effect.gen(function* () {
            const existing = yield* service.agents.get(id);

            const updates: string[] = [];
            const values: SQLQueryBindings[] = [];

            if (input.processId !== undefined) {
              updates.push("process_id = ?");
              values.push(input.processId);
            }
            if (input.status !== undefined) {
              updates.push("status = ?");
              values.push(input.status);
            }
            if (input.stoppedAt !== undefined) {
              updates.push("stopped_at = ?");
              values.push(input.stoppedAt);
            }
            if (input.exitCode !== undefined) {
              updates.push("exit_code = ?");
              values.push(input.exitCode);
            }

            if (updates.length === 0) return existing;

            values.push(id);

            yield* tryDb("agents.update", () =>
              db.run(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`, values)
            );

            return new Agent({
              ...existing,
              processId: input.processId !== undefined ? input.processId : existing.processId,
              status: input.status ?? existing.status,
              stoppedAt: input.stoppedAt !== undefined ? input.stoppedAt : existing.stoppedAt,
              exitCode: input.exitCode !== undefined ? input.exitCode : existing.exitCode
            });
          }),

        delete: id =>
          Effect.gen(function* () {
            yield* service.agents.get(id);
            yield* tryDb("agents.delete", () => db.run("DELETE FROM agents WHERE id = ?", [id]));
          })
      },

      // ─── Chat Messages ───────────────────────────────────

      chatMessages: {
        listBySession: sessionId =>
          tryDb("chatMessages.listBySession", () =>
            db
              .query<
                Record<string, unknown>,
                [string]
              >("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY sequence_number ASC")
              .all(sessionId)
              .map(rowToChatMessage)
          ),

        get: id =>
          Effect.gen(function* () {
            const row = yield* tryDb("chatMessages.get", () =>
              db
                .query<
                  Record<string, unknown>,
                  [string]
                >("SELECT * FROM chat_messages WHERE id = ?")
                .get(id)
            );
            if (!row) {
              return yield* Effect.fail(new ChatMessageNotFoundError({ id }));
            }
            return rowToChatMessage(row);
          }),

        create: input =>
          Effect.gen(function* () {
            const now = nowIso();
            const id = generateId();
            const parentToolUseId = input.parentToolUseId ?? null;
            const uuid = input.uuid ?? null;

            // Check if session exists
            const existingSession = yield* tryDb("chatMessages.create.checkSession", () =>
              db
                .query<Record<string, unknown>, [string]>("SELECT id FROM sessions WHERE id = ?")
                .get(input.sessionId)
            );

            if (!existingSession) {
              return yield* Effect.fail(
                new ForeignKeyViolationError({
                  entity: "ChatMessage",
                  foreignKey: "sessionId",
                  foreignId: input.sessionId
                })
              );
            }

            // Get next sequence number
            const sequenceNumber = yield* service.chatMessages.getNextSequenceNumber(
              input.sessionId
            );

            // Serialize content to JSON
            const contentJson = JSON.stringify(input.content);

            yield* tryDb("chatMessages.create", () =>
              db.run(
                `INSERT INTO chat_messages (id, session_id, sequence_number, role, content_type, content, parent_tool_use_id, uuid, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  id,
                  input.sessionId,
                  sequenceNumber,
                  input.role,
                  input.contentType,
                  contentJson,
                  parentToolUseId,
                  uuid,
                  now
                ]
              )
            );

            return new ChatMessage({
              id,
              sessionId: input.sessionId,
              sequenceNumber,
              role: input.role,
              contentType: input.contentType,
              content: input.content,
              parentToolUseId,
              uuid,
              createdAt: now
            });
          }),

        delete: id =>
          Effect.gen(function* () {
            yield* service.chatMessages.get(id);
            yield* tryDb("chatMessages.delete", () =>
              db.run("DELETE FROM chat_messages WHERE id = ?", [id])
            );
          }),

        deleteBySession: sessionId =>
          tryDb("chatMessages.deleteBySession", () =>
            db.run("DELETE FROM chat_messages WHERE session_id = ?", [sessionId])
          ),

        getNextSequenceNumber: sessionId =>
          tryDb("chatMessages.getNextSequenceNumber", () => {
            const result = db
              .query<
                { max_seq: number | null },
                [string]
              >("SELECT MAX(sequence_number) as max_seq FROM chat_messages WHERE session_id = ?")
              .get(sessionId);
            return (result?.max_seq ?? -1) + 1;
          })
      }
    };

    return service;
  });

// ─── Layer Exports ────────────────────────────────────────────

export const StorageServiceLive = (config?: StorageConfig) =>
  Layer.effect(StorageService, makeStorageService(config));

export const StorageServiceDefault = StorageServiceLive();
