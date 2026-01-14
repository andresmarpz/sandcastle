import { Context, type Effect } from "effect";
import type { ChatMessage, CreateChatMessageInput } from "./chat/schema";
import type {
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
import type {
	CreateRepositoryInput,
	Repository,
	UpdateRepositoryInput,
} from "./repository/schema";
import type {
	CreateSessionInput,
	Session,
	UpdateSessionInput,
} from "./session/schema";
import type {
	CreateWorktreeInput,
	UpdateWorktreeInput,
	Worktree,
} from "./worktree/schema";

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
