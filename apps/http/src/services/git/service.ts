import type { GitDiffStats } from "@sandcastle/schemas";
import { Context, type Effect } from "effect";
import type { GitOperationError, NotAGitRepositoryError } from "./types";

/**
 * GitService interface.
 *
 * Provides git operations for computing diff stats.
 */
export interface GitServiceInterface {
	/**
	 * Get diff statistics for a working directory.
	 *
	 * - If baseBranch is null: diff against HEAD (uncommitted changes)
	 * - If baseBranch is provided: diff against merge-base with that branch
	 *
	 * Returns filesChanged, insertions, and deletions counts.
	 */
	readonly getDiffStats: (
		workingPath: string,
		baseBranch: string | null,
	) => Effect.Effect<GitDiffStats, GitOperationError | NotAGitRepositoryError>;
}

/**
 * GitService Context.Tag for dependency injection.
 */
export class GitService extends Context.Tag("GitService")<
	GitService,
	GitServiceInterface
>() {}
