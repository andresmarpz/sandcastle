import { Atom } from "@effect-atom/atom-react";
import type { FileMatch } from "@sandcastle/rpc/files";
import { FilesClient } from "./files-client";

// Re-export types for consumers
export type { FileMatch };

// Re-export the client for direct use
export { FilesClient };

/**
 * Family of atoms for fuzzy file search.
 * Creates a cached atom per workingPath + pattern combination.
 *
 * @example
 * ```tsx
 * const atom = fileSearchAtomFamily({ workingPath: "/path/to/project", pattern: "readme" });
 * const result = useAtomValue(atom);
 * ```
 */
export const fileSearchAtomFamily = Atom.family(
	({ workingPath, pattern }: { workingPath: string; pattern: string }) =>
		FilesClient.query(
			"files.find",
			{ workingPath, pattern, maxResults: 20 },
			{ timeToLive: 30_000 }, // Cache for 30 seconds
		),
);
