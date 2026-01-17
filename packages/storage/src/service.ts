import type {
	ChatMessage,
	CreateChatMessageInput,
	CreateRepositoryInput,
	CreateSessionInput,
	CreateTurnInput,
	CreateWorktreeInput,
	MessagePart,
	MessageRole,
	Repository,
	Session,
	SessionCursor,
	Turn,
	TurnStatus,
	UpdateRepositoryInput,
	UpdateSessionInput,
	UpdateWorktreeInput,
	Worktree,
} from "@sandcastle/schemas";
import { Context, type Effect } from "effect";
import type {
	ChatMessageNotFoundError,
	DatabaseError,
	ForeignKeyViolationError,
	MigrationError,
	RepositoryNotFoundError,
	RepositoryPathExistsError,
	SessionNotFoundError,
	TurnNotFoundError,
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
			listByRepository: (
				repositoryId: string,
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
			createMany: (
				inputs: Array<{
					id?: string;
					sessionId: string;
					role: MessageRole;
					parts: readonly (typeof MessagePart.Type)[];
					turnId?: string;
					seq?: number;
					metadata?: Record<string, unknown>;
				}>,
			) => Effect.Effect<ChatMessage[], DatabaseError>;
			listByTurn: (
				turnId: string,
			) => Effect.Effect<ChatMessage[], DatabaseError>;
			getMessagesSince: (
				sessionId: string,
				afterMessageId?: string,
			) => Effect.Effect<ChatMessage[], DatabaseError>;
			getLatestBySession: (
				sessionId: string,
			) => Effect.Effect<ChatMessage | null, DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, ChatMessageNotFoundError | DatabaseError>;
			deleteBySession: (
				sessionId: string,
			) => Effect.Effect<void, DatabaseError>;
		};

		turns: {
			list: () => Effect.Effect<Turn[], DatabaseError>;
			listBySession: (
				sessionId: string,
			) => Effect.Effect<Turn[], DatabaseError>;
			get: (
				id: string,
			) => Effect.Effect<Turn, TurnNotFoundError | DatabaseError>;
			create: (
				input: CreateTurnInput,
			) => Effect.Effect<Turn, ForeignKeyViolationError | DatabaseError>;
			complete: (
				id: string,
				reason: "completed" | "interrupted" | "error",
			) => Effect.Effect<Turn, TurnNotFoundError | DatabaseError>;
			delete: (
				id: string,
			) => Effect.Effect<void, TurnNotFoundError | DatabaseError>;
		};

		cursors: {
			get: (
				sessionId: string,
			) => Effect.Effect<SessionCursor | null, DatabaseError>;
			upsert: (
				sessionId: string,
				lastMessageId: string,
				lastMessageAt: string,
			) => Effect.Effect<
				SessionCursor,
				ForeignKeyViolationError | DatabaseError
			>;
			delete: (sessionId: string) => Effect.Effect<void, DatabaseError>;
		};
	}
>() {}
