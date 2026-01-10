import { Atom, Result } from "@effect-atom/atom-react";
import type {
	CreateWorktreeRequest,
	CreateWorktreeResponse,
	UpdateWorktreeInput,
	Worktree,
} from "@sandcastle/rpc";
import { WORKTREE_LIST_KEY, WorktreeClient } from "./worktree-client";

/**
 * Atom for the worktree list.
 * Use with `useAtomValue` to read and `useAtomRefresh` to manually refresh.
 */
export const worktreeListAtom = WorktreeClient.query(
	"worktree.list",
	{},
	{
		reactivityKeys: [WORKTREE_LIST_KEY],
		timeToLive: 300000,
	},
);

/**
 * Optimistic wrapper around the worktree list atom.
 * Enables optimistic updates with automatic rollback on failure.
 */
export const optimisticWorktreeListAtom = worktreeListAtom.pipe(
	Atom.optimistic,
);

/**
 * Optimistic mutation for creating a worktree.
 * Shows a temporary worktree immediately, then syncs with server.
 * Automatically rolls back on failure.
 */
export const createWorktreeOptimisticMutation = optimisticWorktreeListAtom.pipe(
	Atom.optimisticFn({
		reducer: (
			currentResult: Result.Result<readonly Worktree[], unknown>,
			arg: {
				payload: { repositoryId: string };
				reactivityKeys?: readonly unknown[];
			},
		) => {
			// Extract current worktrees from Result, default to empty array
			const currentWorktrees = Result.isSuccess(currentResult)
				? currentResult.value
				: [];

			const tempWorktree: Worktree = {
				id: `temp-${Date.now()}`,
				repositoryId: arg.payload.repositoryId,
				path: "",
				branch: "pending",
				name: "Creating...",
				baseBranch: "main",
				status: "active",
				createdAt: new Date().toISOString(),
				lastAccessedAt: new Date().toISOString(),
			};
			// Prepend to array since list is ordered by most recently created first
			return Result.success([tempWorktree, ...currentWorktrees]);
		},
		fn: WorktreeClient.mutation("worktree.create"),
	}),
);

/**
 * Family of atoms for worktrees by repository.
 * Keyed by repositoryId for proper caching.
 */
export const worktreeListByRepositoryAtomFamily = Atom.family(
	(repositoryId: string) =>
		WorktreeClient.query(
			"worktree.listByRepository",
			{ repositoryId },
			{
				reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repositoryId}`],
				timeToLive: 300000,
			},
		),
);

/**
 * Family of atoms for single worktree by ID.
 */
export const worktreeAtomFamily = Atom.family((id: string) =>
	WorktreeClient.query(
		"worktree.get",
		{ id },
		{
			reactivityKeys: [`worktree:${id}`],
			timeToLive: 300000,
		},
	),
);

/**
 * Family of atoms for worktree by path.
 */
export const worktreeByPathAtomFamily = Atom.family((path: string) =>
	WorktreeClient.query(
		"worktree.getByPath",
		{ path },
		{
			reactivityKeys: [`worktree:path:${path}`],
			timeToLive: 300000,
		},
	),
);

export type {
	CreateWorktreeRequest,
	CreateWorktreeResponse,
	UpdateWorktreeInput,
	Worktree,
};

/**
 * Mutation atom for creating a new worktree.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createWorktreeMutation =
	WorktreeClient.mutation("worktree.create");

/**
 * Mutation atom for updating a worktree.
 * Call with payload and reactivityKeys to invalidate the list after update.
 */
export const updateWorktreeMutation =
	WorktreeClient.mutation("worktree.update");

/**
 * Mutation atom for deleting a worktree.
 * Call with payload and reactivityKeys to invalidate the list after deletion.
 */
export const deleteWorktreeMutation =
	WorktreeClient.mutation("worktree.delete");

/**
 * Mutation atom for touching a worktree (updating lastAccessedAt timestamp).
 * Call with payload and reactivityKeys to invalidate the worktree after touch.
 */
export const touchWorktreeMutation = WorktreeClient.mutation("worktree.touch");

/**
 * Mutation atom for syncing worktrees with the filesystem.
 * Removes orphaned DB records where the git worktree no longer exists.
 * Returns the IDs of removed worktrees.
 */
export const syncWorktreesMutation = WorktreeClient.mutation("worktree.sync");
