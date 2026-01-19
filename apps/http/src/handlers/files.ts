import { FileMatch, FileSearchRpcError, FilesRpc } from "@sandcastle/rpc/files";
import { Glob } from "bun";
import { Effect, Layer } from "effect";
import { Fzf } from "fzf";

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
async function scanFiles(workingPath: string): Promise<string[]> {
	const glob = new Glob("**/*");
	const files: string[] = [];
	for await (const file of glob.scan({
		cwd: workingPath,
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

export const FilesRpcHandlers = FilesRpc.toLayer(
	Effect.gen(function* () {
		return FilesRpc.of({
			"files.find": (params) =>
				Effect.gen(function* () {
					const { workingPath, pattern, maxResults = 20 } = params;

					// Scan files using async helper
					const files = yield* Effect.tryPromise({
						try: () => scanFiles(workingPath),
						catch: (error) =>
							new FileSearchRpcError({
								message: error instanceof Error ? error.message : String(error),
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
					Effect.catchAll((error) =>
						Effect.fail(
							new FileSearchRpcError({
								message: error instanceof Error ? error.message : String(error),
							}),
						),
					),
				),
		});
	}),
);

export const FilesRpcHandlersLive = FilesRpcHandlers;
