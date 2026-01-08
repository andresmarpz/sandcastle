import type {
  CreateSessionInput,
  Session,
  UpdateSessionInput,
} from "@sandcastle/rpc";
import { SessionClient, SESSION_LIST_KEY } from "./session-client";

// Re-export types for consumers
export type { CreateSessionInput, Session, UpdateSessionInput };

// Re-export the client and key for direct use
export { SessionClient, SESSION_LIST_KEY };

/**
 * Creates a query atom for fetching the list of all sessions.
 * Uses reactivity keys for automatic cache invalidation.
 *
 * Note: Server handlers for sessions are not yet implemented.
 */
export const sessionListQuery = () =>
  SessionClient.query(
    "session.list",
    {},
    {
      reactivityKeys: [SESSION_LIST_KEY],
    },
  );

/**
 * Creates a query atom for fetching sessions belonging to a specific worktree.
 */
export const sessionListByWorktreeQuery = (worktreeId: string) =>
  SessionClient.query(
    "session.listByWorktree",
    { worktreeId },
    {
      reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktreeId}`],
    },
  );

/**
 * Creates a query atom for fetching a single session by ID.
 */
export const sessionQuery = (id: string) =>
  SessionClient.query(
    "session.get",
    { id },
    {
      reactivityKeys: [`session:${id}`],
    },
  );

/**
 * Mutation atom for creating a new session.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createSessionMutation =
  SessionClient.mutation("session.create");

/**
 * Mutation atom for updating a session.
 * Call with payload and reactivityKeys to invalidate the list after update.
 */
export const updateSessionMutation =
  SessionClient.mutation("session.update");

/**
 * Mutation atom for deleting a session.
 * Call with payload and reactivityKeys to invalidate the list after deletion.
 */
export const deleteSessionMutation =
  SessionClient.mutation("session.delete");

/**
 * Mutation atom for touching a session (updating lastActivityAt timestamp).
 * Call with payload and reactivityKeys to invalidate the session after touch.
 */
export const touchSessionMutation = SessionClient.mutation("session.touch");
