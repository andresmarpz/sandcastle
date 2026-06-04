import type { Workspace } from "@sandcastle/contracts";
import { useEffect } from "react";

import { usePrStatusStore } from "@/stores/prStatus";

// Derived from the IPC return type so it stays in lockstep with the main-process
// `PrStatus` shape without importing main code into the renderer bundle.
export type PrStatus = NonNullable<Awaited<ReturnType<typeof window.api.github.prStatus>>>;

/**
 * PR status for a worktree workspace. Reads from the renderer-side cache
 * (`stores/prStatus`, keyed by repoPath) so a freshly mounted row paints its
 * badge on the first frame — startup warms that cache for every worktree before
 * the loading screen lifts. Returns `null` for non-worktree workspaces, a
 * worktree with no PR, or one not yet checked. Re-fetches over IPC on mount and
 * whenever the window regains focus, writing the result back to the cache.
 */
export function usePrStatus(ws: Workspace): PrStatus | null {
	// Only worktrees map to a PR; a `local` workspace is just the project root.
	const enabled = ws.kind === "worktree" && ws.branch !== null;
	const repoPath = ws.path as string;
	const branch = ws.branch;

	const status = usePrStatusStore((s) => (enabled ? (s.byPath[repoPath] ?? null) : null));

	useEffect(() => {
		if (!enabled || branch === null) return;
		let cancelled = false;
		const load = (): void => {
			window.api.github.prStatus({ repoPath, branch }).then(
				(result) => {
					if (!cancelled) usePrStatusStore.getState().set(repoPath, result);
				},
				() => {
					// A transient `gh` failure shouldn't blank an already-resolved badge;
					// leave whatever's cached (null until the first success either way).
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
