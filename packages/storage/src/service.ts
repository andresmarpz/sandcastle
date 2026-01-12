import { Context, type Effect } from "effect";

import type {
	Agent,
	ChatMessage,
	CreateAgentInput,
	CreateChatMessageInput,
	CreateRepositoryInput,
	CreateSessionInput,
	CreateWorktreeInput,
	Repository,
	Session,
	UpdateAgentInput,
	UpdateRepositoryInput,
	UpdateSessionInput,
	UpdateWorktreeInput,
	Worktree,
} from "./entities";
import type {
	AgentNotFoundError,
	ChatMessageNotFoundError,
	DatabaseError,
	ForeignKeyViolationError,
	MigrationError,
	RepositoryNotFoundError,
	RepositoryPathExistsError,
	SessionNotFoundError,
	WorktreeNotFoundError,
	WorktreePathExistsError,
} from "./errors";

export class StorageService extends Context.Tag("StorageService")<
	StorageService,
	{
		initialize: () => Effect.Effect<void, DatabaseError | MigrationError>;
		close: () => Effect.Effect<void, DatabaseError>;

		repositories: {
			list: () => Effect.Effect<Repository[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;
			getByPath: (
				directoryPath: string,
			) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;
			create: (
				input: CreateRepositoryInput,
			) => Effect.Effect<Repository, RepositoryPathExistsError | DatabaseError>;
			update: (
				id: string,
				input: UpdateRepositoryInput,
			) => Effect.Effect<Repository, RepositoryNotFoundError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, RepositoryNotFoundError | DatabaseError>;
		};

		worktrees: {
			list: () => Effect.Effect<Worktree[], DatabaseError>;
			listByRepository: (
				repositoryId: string,
			) => Effect.Effect<Worktree[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;
			getByPath: (
				path: string,
			) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;
			create: (
				input: CreateWorktreeInput,
			) => Effect.Effect<
				Worktree,
				WorktreePathExistsError | ForeignKeyViolationError | DatabaseError
			>;
			update: (
				id: string,
				input: UpdateWorktreeInput,
			) => Effect.Effect<Worktree, WorktreeNotFoundError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, WorktreeNotFoundError | DatabaseError>;
			touch: (
				id: string,
			) => Effect.Effect<void, WorktreeNotFoundError | DatabaseError>;
		};

		sessions: {
			list: () => Effect.Effect<Session[], DatabaseError>;
			listByWorktree: (
				worktreeId: string,
			) => Effect.Effect<Session[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>;
			create: (
				input: CreateSessionInput,
			) => Effect.Effect<Session, ForeignKeyViolationError | DatabaseError>;
			update: (
				id: string,
				input: UpdateSessionInput,
			) => Effect.Effect<Session, SessionNotFoundError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, SessionNotFoundError | DatabaseError>;
			touch: (
				id: string,
			) => Effect.Effect<void, SessionNotFoundError | DatabaseError>;
		};

		agents: {
			list: () => Effect.Effect<Agent[], DatabaseError>;
			listBySession: (
				sessionId: string,
			) => Effect.Effect<Agent[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>;
			create: (
				input: CreateAgentInput,
			) => Effect.Effect<Agent, ForeignKeyViolationError | DatabaseError>;
			update: (
				id: string,
				input: UpdateAgentInput,
			) => Effect.Effect<Agent, AgentNotFoundError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, AgentNotFoundError | DatabaseError>;
		};

		chatMessages: {
			listBySession: (
				sessionId: string,
			) => Effect.Effect<ChatMessage[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<ChatMessage, ChatMessageNotFoundError | DatabaseError>;
			create: (
				input: CreateChatMessageInput,
			) => Effect.Effect<ChatMessage, ForeignKeyViolationError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, ChatMessageNotFoundError | DatabaseError>;
			deleteBySession: (
				sessionId: string,
			) => Effect.Effect<void, DatabaseError>;
		};
	}
>() {}
