import { Glob } from "bun";
import { Effect, Layer } from "effect";
import { Fzf } from "fzf";

import { FileMatch, FileSearchRpcError, FilesRpc } from "@sandcastle/rpc/files";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";

// ─── Helpers ─────────────────────────────────────────────────

const EXCLUDED_DIRS = [
	"node_modules/",
	".git/",
	"dist/",
	".next/",
	"build/",
	".turbo/",
	"coverage/",
];

/**
 * Scans a directory for files using Bun's Glob.
 * Excludes common non-searchable directories.
 */
async function scanFiles(worktreePath: string): Promise<string[]> {
	const glob = new Glob("**/*");
	const files: string[] = [];
	for await (const file of glob.scan({
		cwd: worktreePath,
		onlyFiles: true,
	})) {
		// Exclude common non-searchable directories
		if (EXCLUDED_DIRS.some((dir) => file.startsWith(dir))) {
			continue;
		}
		files.push(file);
	}
	return files;
}

// ─── Handlers ────────────────────────────────────────────────

export const FilesRpcHandlers = FilesRpc.toLayer(
	Effect.gen(function* () {
		const storage = yield* StorageService;

		return FilesRpc.of({
			"files.find": (params) =>
				Effect.gen(function* () {
					const { worktreeId, pattern, maxResults = 20 } = params;

					// Resolve worktree path from ID
					const worktree = yield* storage.worktrees.get(worktreeId);
					const worktreePath = worktree.path;

					// Scan files using async helper
					const files = yield* Effect.tryPromise({
						try: () => scanFiles(worktreePath),
						catch: (error) =>
							new FileSearchRpcError({
								message:
									error instanceof Error ? error.message : String(error),
							}),
					});

					// Apply fuzzy matching
					const fzf = new Fzf(files, {
						selector: (item: string) => item,
						tiebreakers: [
							(a, b) => a.item.length - b.item.length, // Prefer shorter paths
						],
					});
					const results = fzf.find(pattern).slice(0, maxResults);

					return results.map(
						(r) =>
							new FileMatch({
								path: r.item,
								name: r.item.split("/").pop() ?? r.item,
								score: r.score,
							}),
					);
				}).pipe(
					Effect.catchTag("WorktreeNotFoundError", (e) =>
						Effect.fail(
							new FileSearchRpcError({
								message: `Worktree not found: ${e.id}`,
							}),
						),
					),
					Effect.catchAll((error) =>
						Effect.fail(
							new FileSearchRpcError({
								message:
									error instanceof Error ? error.message : String(error),
							}),
						),
					),
				),
		});
	}),
);

export const FilesRpcHandlersLive = FilesRpcHandlers.pipe(
	Layer.provide(StorageServiceDefault),
);
