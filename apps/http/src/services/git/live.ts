import { GitDiffStats } from "@sandcastle/schemas";
import { Effect, Layer } from "effect";
import { GitService, type GitServiceInterface } from "./service";
import { GitOperationError, NotAGitRepositoryError } from "./types";

/**
 * Simple in-memory cache entry.
 */
interface CacheEntry {
	stats: GitDiffStats;
	timestamp: number;
}

/**
 * Cache TTL in milliseconds (5 seconds).
 */
const CACHE_TTL_MS = 5_000;

/**
 * Parse git diff --shortstat output.
 * Example: " 3 files changed, 10 insertions(+), 5 deletions(-)"
 * Or empty string if no changes.
 */
const parseShortstat = (output: string): GitDiffStats => {
	const trimmed = output.trim();
	if (!trimmed) {
		return new GitDiffStats({
			filesChanged: 0,
			insertions: 0,
			deletions: 0,
		});
	}

	let filesChanged = 0;
	let insertions = 0;
	let deletions = 0;

	// Match "X file(s) changed"
	const filesMatch = trimmed.match(/(\d+)\s+files?\s+changed/);
	if (filesMatch?.[1]) {
		filesChanged = Number.parseInt(filesMatch[1], 10);
	}

	// Match "X insertion(s)(+)"
	const insertionsMatch = trimmed.match(/(\d+)\s+insertions?\(\+\)/);
	if (insertionsMatch?.[1]) {
		insertions = Number.parseInt(insertionsMatch[1], 10);
	}

	// Match "X deletion(s)(-)"
	const deletionsMatch = trimmed.match(/(\d+)\s+deletions?\(-\)/);
	if (deletionsMatch?.[1]) {
		deletions = Number.parseInt(deletionsMatch[1], 10);
	}

	return new GitDiffStats({ filesChanged, insertions, deletions });
};

/**
 * Run a git command in the specified directory.
 */
const runGitCommand = (
	args: string[],
	cwd: string,
): Effect.Effect<string, GitOperationError | NotAGitRepositoryError> =>
	Effect.tryPromise({
		try: async () => {
			const proc = Bun.spawn(["git", ...args], {
				cwd,
				stdout: "pipe",
				stderr: "pipe",
			});

			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();

			if (exitCode !== 0) {
				// Check for "not a git repository" error
				if (
					stderr.includes("not a git repository") ||
					stderr.includes("Not a git repository")
				) {
					throw { type: "not_a_git_repository", path: cwd };
				}
				throw { type: "git_error", stderr, exitCode };
			}

			return stdout;
		},
		catch: (error: unknown) => {
			if (
				error &&
				typeof error === "object" &&
				"type" in error &&
				error.type === "not_a_git_repository" &&
				"path" in error &&
				typeof error.path === "string"
			) {
				return new NotAGitRepositoryError({
					path: error.path,
				});
			}
			if (
				error &&
				typeof error === "object" &&
				"type" in error &&
				error.type === "git_error" &&
				"stderr" in error &&
				"exitCode" in error &&
				typeof error.stderr === "string" &&
				typeof error.exitCode === "number"
			) {
				return new GitOperationError({
					operation: args.join(" "),
					message: error.stderr,
					exitCode: error.exitCode,
				});
			}
			const message = error instanceof Error ? error.message : String(error);
			return new GitOperationError({
				operation: args.join(" "),
				message,
			});
		},
	});

/**
 * Create the GitService implementation with caching.
 */
export const makeGitService = Effect.sync((): GitServiceInterface => {
	// Simple in-memory cache: Map<cacheKey, CacheEntry>
	const cache = new Map<string, CacheEntry>();

	const getCacheKey = (workingPath: string, baseBranch: string | null) =>
		`${workingPath}::${baseBranch ?? "HEAD"}`;

	const getDiffStats = (
		workingPath: string,
		baseBranch: string | null,
	): Effect.Effect<
		GitDiffStats,
		GitOperationError | NotAGitRepositoryError
	> => {
		const cacheKey = getCacheKey(workingPath, baseBranch);

		return Effect.gen(function* () {
			// Check cache
			const cached = cache.get(cacheKey);
			const now = Date.now();
			if (cached && now - cached.timestamp < CACHE_TTL_MS) {
				return cached.stats;
			}

			let stats: GitDiffStats;

			if (baseBranch === null) {
				// Diff against HEAD (uncommitted changes only)
				// This shows staged + unstaged changes
				const output = yield* runGitCommand(
					["diff", "HEAD", "--shortstat"],
					workingPath,
				);
				stats = parseShortstat(output);
			} else {
				// Find merge-base with baseBranch, then diff
				const mergeBaseOutput = yield* runGitCommand(
					["merge-base", "HEAD", baseBranch],
					workingPath,
				);
				const mergeBase = mergeBaseOutput.trim();

				if (!mergeBase) {
					// No common ancestor - diff everything
					const output = yield* runGitCommand(
						["diff", "--shortstat", baseBranch],
						workingPath,
					);
					stats = parseShortstat(output);
				} else {
					// Diff from merge-base to HEAD (all commits on this branch + uncommitted)
					const output = yield* runGitCommand(
						["diff", mergeBase, "--shortstat"],
						workingPath,
					);
					stats = parseShortstat(output);
				}
			}

			// Update cache
			cache.set(cacheKey, { stats, timestamp: now });

			return stats;
		});
	};

	return { getDiffStats };
});

/**
 * Live layer for GitService.
 */
export const GitServiceLive = Layer.effect(GitService, makeGitService);
