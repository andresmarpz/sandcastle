import { useAtom, useAtomRefresh } from "@effect-atom/atom-react";
import { useEffect, useState } from "react";
import {
	optimisticWorktreeListAtom,
	syncWorktreesMutation,
} from "@/api/worktree-atoms";
import { WORKTREE_LIST_KEY } from "@/api/worktree-client";

export function useInitialize() {
	const [done, _setDone] = useState(false);

	const [, syncWorktrees] = useAtom(syncWorktreesMutation, {
		mode: "promiseExit",
	});
	const refreshWorktrees = useAtomRefresh(optimisticWorktreeListAtom);

	// Sync worktrees on mount to clean up orphaned DB records
	useEffect(() => {
		const runSync = async () => {
			try {
				await syncWorktrees({
					payload: {},
					reactivityKeys: [WORKTREE_LIST_KEY],
				});
				refreshWorktrees();
			} catch {
				// Sync failures are non-critical, just log
				console.warn("Worktree sync failed");
			}
		};

		runSync();
	}, [syncWorktrees, refreshWorktrees]);

	return done;
}
