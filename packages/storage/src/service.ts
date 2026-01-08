import { Context, type Effect } from "effect";

import type {
  Agent,
  CreateAgentInput,
  CreateRepositoryInput,
  CreateSessionInput,
  CreateWorktreeInput,
  Repository,
  Session,
  UpdateAgentInput,
  UpdateRepositoryInput,
  UpdateSessionInput,
  UpdateWorktreeInput,
  Worktree
} from "./entities";
import type {
  AgentNotFoundError,
  DatabaseError,
  ForeignKeyViolationError,
  MigrationError,
  RepositoryNotFoundError,
  RepositoryPathExistsError,
  SessionNotFoundError,
  WorktreeNotFoundError,
  WorktreePathExistsError
} from "./errors";

export class StorageService extends Context.Tag("StorageService")<
  StorageService,
  {
    // ─── Database Management ────────────────────────────────

    /** Initialize the database (create tables, run migrations) */
    initialize: () => Effect.Effect<void, DatabaseError | MigrationError>;

    /** Close the database connection */
    close: () => Effect.Effect<void, DatabaseError>;

    // ─── Repository CRUD ────────────────────────────────────

    repositories: {
      list: () => Effect.Effect<Repository[], DatabaseError>;

      get: (id: string) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;

      getByPath: (
        directoryPath: string
      ) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;

      create: (
        input: CreateRepositoryInput
      ) => Effect.Effect<Repository, RepositoryPathExistsError | DatabaseError>;

      update: (
        id: string,
        input: UpdateRepositoryInput
      ) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;

      delete: (id: string) => Effect.Effect<void, RepositoryNotFoundError | DatabaseError>;
    };

    // ─── Worktree CRUD ──────────────────────────────────────

    worktrees: {
      list: () => Effect.Effect<Worktree[], DatabaseError>;

      listByRepository: (repositoryId: string) => Effect.Effect<Worktree[], DatabaseError>;

      get: (id: string) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;

      getByPath: (path: string) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;

      create: (
        input: CreateWorktreeInput
      ) => Effect.Effect<
        Worktree,
        WorktreePathExistsError | ForeignKeyViolationError | DatabaseError
      >;

      update: (
        id: string,
        input: UpdateWorktreeInput
      ) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;

      delete: (id: string) => Effect.Effect<void, WorktreeNotFoundError | DatabaseError>;

      /** Update lastAccessedAt to current time */
      touch: (id: string) => Effect.Effect<void, WorktreeNotFoundError | DatabaseError>;
    };

    // ─── Session CRUD ───────────────────────────────────────

    sessions: {
      list: () => Effect.Effect<Session[], DatabaseError>;

      listByWorktree: (worktreeId: string) => Effect.Effect<Session[], DatabaseError>;

      get: (id: string) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>;

      create: (
        input: CreateSessionInput
      ) => Effect.Effect<Session, ForeignKeyViolationError | DatabaseError>;

      update: (
        id: string,
        input: UpdateSessionInput
      ) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>;

      delete: (id: string) => Effect.Effect<void, SessionNotFoundError | DatabaseError>;

      /** Update lastActivityAt to current time */
      touch: (id: string) => Effect.Effect<void, SessionNotFoundError | DatabaseError>;
    };

    // ─── Agent CRUD ─────────────────────────────────────────

    agents: {
      list: () => Effect.Effect<Agent[], DatabaseError>;

      listBySession: (sessionId: string) => Effect.Effect<Agent[], DatabaseError>;

      get: (id: string) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>;

      create: (
        input: CreateAgentInput
      ) => Effect.Effect<Agent, ForeignKeyViolationError | DatabaseError>;

      update: (
        id: string,
        input: UpdateAgentInput
      ) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>;

      delete: (id: string) => Effect.Effect<void, AgentNotFoundError | DatabaseError>;
    };
  }
>() {}
