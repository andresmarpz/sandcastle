import { Data } from "effect";

/**
 * Error when a git command fails.
 */
export class GitOperationError extends Data.TaggedError("GitOperationError")<{
	readonly operation: string;
	readonly message: string;
	readonly exitCode?: number;
}> {}

/**
 * Error when the path is not a git repository.
 */
export class NotAGitRepositoryError extends Data.TaggedError(
	"NotAGitRepositoryError",
)<{
	readonly path: string;
}> {}
