import { Data } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
	operation: string;
	message: string;
	cause?: unknown;
}> {}

export class DatabaseConnectionError extends Data.TaggedError(
	"DatabaseConnectionError",
)<{
	path: string;
	message: string;
}> {}

export class MigrationError extends Data.TaggedError("MigrationError")<{
	version: number;
	message: string;
	cause?: unknown;
}> {}

export class RepositoryNotFoundError extends Data.TaggedError(
	"RepositoryNotFoundError",
)<{
	id: string;
}> {}

export class WorktreeNotFoundError extends Data.TaggedError(
	"WorktreeNotFoundError",
)<{
	id: string;
}> {}

export class SessionNotFoundError extends Data.TaggedError(
	"SessionNotFoundError",
)<{
	id: string;
}> {}

export class AgentNotFoundError extends Data.TaggedError("AgentNotFoundError")<{
	id: string;
}> {}

export class ChatMessageNotFoundError extends Data.TaggedError(
	"ChatMessageNotFoundError",
)<{
	id: string;
}> {}

export class RepositoryPathExistsError extends Data.TaggedError(
	"RepositoryPathExistsError",
)<{
	directoryPath: string;
}> {}

export class WorktreePathExistsError extends Data.TaggedError(
	"WorktreePathExistsError",
)<{
	path: string;
}> {}

export class ForeignKeyViolationError extends Data.TaggedError(
	"ForeignKeyViolationError",
)<{
	entity: string;
	foreignKey: string;
	foreignId: string;
}> {}
