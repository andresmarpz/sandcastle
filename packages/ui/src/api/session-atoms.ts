import { Atom } from "@effect-atom/atom-react";
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

// ─── Stable Query Atoms ─────────────────────────────────────────
// These use Atom.family for proper caching and reactivity

/**
 * Stable atom for the full session list.
 */
const _sessionListAtom = SessionClient.query(
  "session.list",
  {},
  {
    reactivityKeys: [SESSION_LIST_KEY],
  }
);

export const sessionListAtom = _sessionListAtom;

/**
 * Family of atoms for sessions by worktree.
 */
export const sessionListByWorktreeAtomFamily = Atom.family(
  (worktreeId: string) =>
    SessionClient.query(
      "session.listByWorktree",
      { worktreeId },
      {
        reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktreeId}`],
      }
    )
);

/**
 * Family of atoms for single session by ID.
 */
export const sessionAtomFamily = Atom.family((id: string) =>
  SessionClient.query(
    "session.get",
    { id },
    {
      reactivityKeys: [`session:${id}`],
      timeToLive: 3 * 60 * 1000,
    }
  )
);

/**
 * Returns the stable session list atom.
 * @deprecated Use `sessionListAtom` directly
 */
export const sessionListQuery = () => sessionListAtom;

/**
 * Returns the session list atom for a specific worktree.
 */
export const sessionListByWorktreeQuery = (worktreeId: string) =>
  sessionListByWorktreeAtomFamily(worktreeId);

/**
 * Returns the atom for fetching a single session by ID.
 */
export const sessionQuery = (id: string) => sessionAtomFamily(id);

/**
 * Mutation atom for creating a new session.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createSessionMutation = SessionClient.mutation("session.create");

/**
 * Mutation atom for updating a session.
 * Call with payload and reactivityKeys to invalidate the list after update.
 */
export const updateSessionMutation = SessionClient.mutation("session.update");

/**
 * Mutation atom for deleting a session.
 * Call with payload and reactivityKeys to invalidate the list after deletion.
 */
export const deleteSessionMutation = SessionClient.mutation("session.delete");

/**
 * Mutation atom for touching a session (updating lastActivityAt timestamp).
 * Call with payload and reactivityKeys to invalidate the session after touch.
 */
export const touchSessionMutation = SessionClient.mutation("session.touch");
