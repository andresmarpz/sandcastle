import { Atom } from "@effect-atom/atom-react";
import type {
  CreateRepositoryInput,
  Repository,
  UpdateRepositoryInput,
} from "@sandcastle/rpc";
import { RepositoryClient, REPOSITORY_LIST_KEY } from "./repository-client";

// Re-export types for consumers
export type { CreateRepositoryInput, Repository, UpdateRepositoryInput };

// Re-export the client and key for direct use
export { RepositoryClient, REPOSITORY_LIST_KEY };

// ─── Stable Query Atoms ─────────────────────────────────────────
// These are created once and reused, ensuring reactivity works properly

const _repositoryListAtom = RepositoryClient.query(
  "repository.list",
  {},
  {
    reactivityKeys: [REPOSITORY_LIST_KEY],
    timeToLive: 300000,
  },
);

/**
 * Stable atom for the repository list.
 * Use this for `useAtomRefresh` to manually refresh after mutations.
 */
export const repositoryListAtom = _repositoryListAtom;

/**
 * Family of atoms for single repository by ID.
 */
export const repositoryAtomFamily = Atom.family((id: string) =>
  RepositoryClient.query(
    "repository.get",
    { id },
    {
      reactivityKeys: [`repository:${id}`],
      timeToLive: 300000,
    },
  )
);

/**
 * Family of atoms for repository by path.
 */
export const repositoryByPathAtomFamily = Atom.family((directoryPath: string) =>
  RepositoryClient.query(
    "repository.getByPath",
    { directoryPath },
    {
      reactivityKeys: [`repository:path:${directoryPath}`],
      timeToLive: 300000,
    },
  )
);

/**
 * Returns the stable repository list atom.
 * @deprecated Use `repositoryListAtom` directly with `useAtomValue` and `useAtomRefresh`
 */
export const repositoryListQuery = () => repositoryListAtom;

/**
 * Returns the atom for fetching a single repository by ID.
 */
export const repositoryQuery = (id: string) => repositoryAtomFamily(id);

/**
 * Returns the atom for fetching a repository by its directory path.
 */
export const repositoryQueryByPath = (directoryPath: string) =>
  repositoryByPathAtomFamily(directoryPath);

/**
 * Mutation atom for creating a new repository.
 * Call with payload and reactivityKeys to invalidate the list after creation.
 */
export const createRepositoryMutation =
  RepositoryClient.mutation("repository.create");

/**
 * Mutation atom for updating a repository.
 * Call with payload and reactivityKeys to invalidate the list after update.
 */
export const updateRepositoryMutation =
  RepositoryClient.mutation("repository.update");

/**
 * Mutation atom for deleting a repository.
 * Call with payload and reactivityKeys to invalidate the list after deletion.
 */
export const deleteRepositoryMutation =
  RepositoryClient.mutation("repository.delete");
