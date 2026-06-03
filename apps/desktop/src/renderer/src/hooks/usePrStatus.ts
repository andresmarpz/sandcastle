import type { Workspace } from "@sandcastle/contracts";
import { useEffect, useState } from "react";

// Derived from the IPC return type so it stays in lockstep with the main-process
// `PrStatus` shape without importing main code into the renderer bundle.
export type PrStatus = NonNullable<Awaited<ReturnType<typeof window.api.github.prStatus>>>;

/**
 * PR status for a worktree workspace, fetched over IPC (main owns the `gh` call
 * + caching). Returns `null` while loading, for non-worktree workspaces, or when
 * the worktree has no associated PR. Re-fetches when the window regains focus.
 */
export function usePrStatus(ws: Workspace): PrStatus | null {
	const [status, setStatus] = useState<PrStatus | null>(null);

	// Only worktrees map to a PR; a `local` workspace is just the project root.
	const enabled = ws.kind === "worktree" && ws.branch !== null;
	const repoPath = ws.path as string;
	const branch = ws.branch;

	useEffect(() => {
		if (!enabled || branch === null) {
			setStatus(null);
			return;
		}
		let cancelled = false;
		const load = (): void => {
			window.api.github.prStatus({ repoPath, branch }).then(
				(result) => {
					if (!cancelled) setStatus(result);
				},
				() => {
					if (!cancelled) setStatus(null);
				},
			);
		};
		load();
		// Cheap revalidation: a PR's CI/review state changes out-of-band, so refresh
		// when the user returns to the window. Main's short TTL coalesces the burst.
		window.addEventListener("focus", load);
		return () => {
			cancelled = true;
			window.removeEventListener("focus", load);
		};
	}, [enabled, repoPath, branch]);

	return status;
}
