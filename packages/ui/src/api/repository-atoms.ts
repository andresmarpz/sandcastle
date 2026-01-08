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

/**
 * Creates a query atom for fetching the list of repositories.
 * Uses reactivity keys for automatic cache invalidation.
 */
export const repositoryListQuery = () =>
  RepositoryClient.query(
    "repository.list",
    {},
    {
      reactivityKeys: [REPOSITORY_LIST_KEY],
    },
  );

/**
 * Creates a query atom for fetching a single repository by ID.
 */
export const repositoryQuery = (id: string) =>
  RepositoryClient.query(
    "repository.get",
    { id },
    {
      reactivityKeys: [`repository:${id}`],
    },
  );

/**
 * Creates a query atom for fetching a repository by its directory path.
 */
export const repositoryQueryByPath = (directoryPath: string) =>
  RepositoryClient.query(
    "repository.getByPath",
    { directoryPath },
    {
      reactivityKeys: [`repository:path:${directoryPath}`],
    },
  );

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
