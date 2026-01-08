import type {
  CreateWorktreeOptions,
  RemoveWorktreeOptions,
  WorktreeInfo,
} from "@sandcastle/rpc";
import { WorktreeClient, WORKTREE_LIST_KEY } from "./worktree-client";

// Re-export types for consumers
export type { WorktreeInfo, CreateWorktreeOptions, RemoveWorktreeOptions };

// Re-export the client and key for direct use
export { WorktreeClient, WORKTREE_LIST_KEY };

/**
 * Creates a query atom for fetching the list of worktrees for a repository.
 * Uses reactivity keys for automatic cache invalidation.
 */
export const worktreeListQuery = (repoPath: string) =>
  WorktreeClient.query(
    "worktree.list",
    { repoPath },
    {
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:${repoPath}`],
    },
  );

/**
 * Creates a query atom for fetching a single worktree.
 */
export const worktreeQuery = (repoPath: string, worktreePath: string) =>
  WorktreeClient.query(
    "worktree.get",
    { repoPath, worktreePath },
    {
      reactivityKeys: [`worktree:${worktreePath}`],
    },
  );

/**
 * Mutation atom for creating a new worktree.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createWorktreeMutation =
  WorktreeClient.mutation("worktree.create");

/**
 * Mutation atom for removing a worktree.
 * Call with payload and reactivityKeys to invalidate the list after removal.
 */
export const removeWorktreeMutation =
  WorktreeClient.mutation("worktree.remove");

/**
 * Mutation atom for pruning stale worktrees.
 * Call with payload and reactivityKeys to invalidate the list after pruning.
 */
export const pruneWorktreesMutation = WorktreeClient.mutation("worktree.prune");
