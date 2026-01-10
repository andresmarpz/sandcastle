import { Schema } from "effect";

/**
 * Worktree not found by ID or path.
 */
export class WorktreeNotFoundRpcError extends Schema.TaggedError<WorktreeNotFoundRpcError>()(
	"WorktreeNotFoundRpcError",
	{
		id: Schema.optional(Schema.String),
		path: Schema.optional(Schema.String),
	},
) {}

/**
 * A worktree already exists at the given path.
 */
export class WorktreePathExistsRpcError extends Schema.TaggedError<WorktreePathExistsRpcError>()(
	"WorktreePathExistsRpcError",
	{
		path: Schema.String,
	},
) {}

/**
 * Git worktree operation failed.
 * Used when the underlying git command fails during create/delete.
 */
export class GitOperationRpcError extends Schema.TaggedError<GitOperationRpcError>()(
	"GitOperationRpcError",
	{
		operation: Schema.String,
		message: Schema.String,
		exitCode: Schema.optional(Schema.Number),
	},
) {}

export const WorktreeRpcError = Schema.Union(
	WorktreeNotFoundRpcError,
	WorktreePathExistsRpcError,
	GitOperationRpcError,
);
export type WorktreeRpcError = typeof WorktreeRpcError.Type;
