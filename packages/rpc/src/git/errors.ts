import { Schema } from "effect";

// Re-export GitOperationRpcError from worktrees to avoid duplication
export { GitOperationRpcError } from "../worktrees/errors";

/**
 * Session not found by ID.
 */
export class GitSessionNotFoundRpcError extends Schema.TaggedError<GitSessionNotFoundRpcError>()(
	"GitSessionNotFoundRpcError",
	{
		sessionId: Schema.String,
	},
) {}

/**
 * Path is not a git repository.
 */
export class NotAGitRepositoryRpcError extends Schema.TaggedError<NotAGitRepositoryRpcError>()(
	"NotAGitRepositoryRpcError",
	{
		path: Schema.String,
	},
) {}
