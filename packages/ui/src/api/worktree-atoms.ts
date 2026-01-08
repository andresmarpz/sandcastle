import type {
  CreateWorktreeRequest,
  UpdateWorktreeInput,
  Worktree,
} from "@sandcastle/rpc";
import { WorktreeClient, WORKTREE_LIST_KEY } from "./worktree-client";

// Re-export types for consumers
export type { CreateWorktreeRequest, UpdateWorktreeInput, Worktree };

// Re-export the client and key for direct use
export { WorktreeClient, WORKTREE_LIST_KEY };

/**
 * Creates a query atom for fetching the list of all worktrees.
 * Uses reactivity keys for automatic cache invalidation.
 */
export const worktreeListQuery = () =>
  WorktreeClient.query(
    "worktree.list",
    {},
    {
      reactivityKeys: [WORKTREE_LIST_KEY],
    },
  );

/**
 * Creates a query atom for fetching worktrees belonging to a specific repository.
 */
export const worktreeListByRepositoryQuery = (repositoryId: string) =>
  WorktreeClient.query(
    "worktree.listByRepository",
    { repositoryId },
    {
      reactivityKeys: [WORKTREE_LIST_KEY, `worktrees:repo:${repositoryId}`],
    },
  );

/**
 * Creates a query atom for fetching a single worktree by ID.
 */
export const worktreeQuery = (id: string) =>
  WorktreeClient.query(
    "worktree.get",
    { id },
    {
      reactivityKeys: [`worktree:${id}`],
    },
  );

/**
 * Creates a query atom for fetching a worktree by its filesystem path.
 */
export const worktreeQueryByPath = (path: string) =>
  WorktreeClient.query(
    "worktree.getByPath",
    { path },
    {
      reactivityKeys: [`worktree:path:${path}`],
    },
  );

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
