import { Atom } from "@effect-atom/atom-react";
import type { FileMatch } from "@sandcastle/rpc/files";
import { FilesClient } from "./files-client";

// Re-export types for consumers
export type { FileMatch };

// Re-export the client for direct use
export { FilesClient };

/**
 * Family of atoms for fuzzy file search.
 * Creates a cached atom per worktreeId + pattern combination.
 *
 * @example
 * ```tsx
 * const atom = fileSearchAtomFamily({ worktreeId: "123", pattern: "readme" });
 * const result = useAtomValue(atom);
 * ```
 */
export const fileSearchAtomFamily = Atom.family(
	({ worktreeId, pattern }: { worktreeId: string; pattern: string }) =>
		FilesClient.query(
			"files.find",
			{ worktreeId, pattern, maxResults: 20 },
			{ timeToLive: 30_000 }, // Cache for 30 seconds
		),
);
