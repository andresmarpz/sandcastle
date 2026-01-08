import { Effect, Layer } from "effect";

import {
  DatabaseRpcError,
  ForeignKeyViolationRpcError,
  GitOperationRpcError,
  Worktree,
  WorktreeNotFoundRpcError,
  WorktreePathExistsRpcError,
  WorktreeRpc
} from "@sandcastle/rpc";
import {
  StorageService,
  StorageServiceDefault,
  type DatabaseError,
  type ForeignKeyViolationError,
  type RepositoryNotFoundError,
  type WorktreeNotFoundError as StorageWorktreeNotFoundError,
  type WorktreePathExistsError
} from "@sandcastle/storage";
import {
  WorktreeService,
  WorktreeServiceLive,
  type BranchExistsError,
  type GitCommandError,
  type WorktreeExistsError,
  type WorktreeNotFoundError as GitWorktreeNotFoundError
} from "@sandcastle/worktree";

// ─── Error Mapping ───────────────────────────────────────────

const mapDatabaseError = (error: DatabaseError): DatabaseRpcError =>
  new DatabaseRpcError({ operation: error.operation, message: error.message });

const mapNotFoundError = (
  error: StorageWorktreeNotFoundError | DatabaseError
): WorktreeNotFoundRpcError | DatabaseRpcError => {
  if (error._tag === "WorktreeNotFoundError") {
    return new WorktreeNotFoundRpcError({ id: error.id });
  }
  return mapDatabaseError(error);
};

const mapUpdateError = (
  error: StorageWorktreeNotFoundError | DatabaseError
): WorktreeNotFoundRpcError | DatabaseRpcError => mapNotFoundError(error);

const mapGitError = (error: GitCommandError): GitOperationRpcError =>
  new GitOperationRpcError({
    operation: error.command,
    message: error.stderr,
    exitCode: error.exitCode
  });

// For worktree.create - handles storage + git errors
type CreateErrors =
  | RepositoryNotFoundError
  | WorktreePathExistsError
  | ForeignKeyViolationError
  | DatabaseError
  | GitCommandError
  | WorktreeExistsError
  | BranchExistsError;

const mapWorktreeCreateError = (
  error: CreateErrors
):
  | WorktreePathExistsRpcError
  | ForeignKeyViolationRpcError
  | GitOperationRpcError
  | DatabaseRpcError => {
  switch (error._tag) {
    case "WorktreePathExistsError":
      return new WorktreePathExistsRpcError({ path: error.path });
    case "ForeignKeyViolationError":
      return new ForeignKeyViolationRpcError({
        entity: error.entity,
        foreignKey: error.foreignKey,
        foreignId: error.foreignId
      });
    case "RepositoryNotFoundError":
      // Repository not found means the FK is invalid
      return new ForeignKeyViolationRpcError({
        entity: "Worktree",
        foreignKey: "repositoryId",
        foreignId: error.id
      });
    case "GitCommandError":
      return mapGitError(error);
    case "WorktreeExistsError":
      return new WorktreePathExistsRpcError({ path: error.path });
    case "BranchExistsError":
      return new GitOperationRpcError({
        operation: "create branch",
        message: `Branch '${error.branch}' already exists`
      });
    case "DatabaseError":
      return mapDatabaseError(error);
  }
};

// For worktree.delete - handles storage + git errors
// Note: There are two different WorktreeNotFoundError types:
// - StorageWorktreeNotFoundError (from storage package, has `id`)
// - GitWorktreeNotFoundError (from worktree package, has `path`)
type DeleteErrors =
  | StorageWorktreeNotFoundError
  | GitWorktreeNotFoundError
  | RepositoryNotFoundError
  | DatabaseError
  | GitCommandError;

const mapWorktreeDeleteError = (
  error: DeleteErrors
): WorktreeNotFoundRpcError | GitOperationRpcError | DatabaseRpcError => {
  switch (error._tag) {
    case "WorktreeNotFoundError":
      // Could be from storage (has id) or git (has path)
      if ("id" in error) {
        return new WorktreeNotFoundRpcError({ id: error.id });
      } else {
        return new WorktreeNotFoundRpcError({ path: error.path });
      }
    case "RepositoryNotFoundError":
      // This shouldn't happen if data is consistent, but handle it
      return new DatabaseRpcError({
        operation: "worktree.delete",
        message: `Repository not found: ${error.id}`
      });
    case "GitCommandError":
      return mapGitError(error);
    case "DatabaseError":
      return mapDatabaseError(error);
  }
};

// ─── Response Mapping ────────────────────────────────────────

const toWorktree = (wt: {
  id: string;
  repositoryId: string;
  path: string;
  branch: string;
  name: string;
  baseBranch: string;
  status: "active" | "stale" | "archived";
  createdAt: string;
  lastAccessedAt: string;
}): Worktree =>
  new Worktree({
    id: wt.id,
    repositoryId: wt.repositoryId,
    path: wt.path,
    branch: wt.branch,
    name: wt.name,
    baseBranch: wt.baseBranch,
    status: wt.status,
    createdAt: wt.createdAt,
    lastAccessedAt: wt.lastAccessedAt
  });

// ─── Handlers ────────────────────────────────────────────────

export const WorktreeRpcHandlers = WorktreeRpc.toLayer(
  Effect.gen(function* () {
    const storage = yield* StorageService;
    const gitWorktree = yield* WorktreeService;

    return WorktreeRpc.of({
      // ─── Pure Storage Operations ─────────────────────────

      "worktree.list": () =>
        storage.worktrees.list().pipe(
          Effect.map(wts => wts.map(toWorktree)),
          Effect.mapError(mapDatabaseError)
        ),

      "worktree.listByRepository": params =>
        storage.worktrees.listByRepository(params.repositoryId).pipe(
          Effect.map(wts => wts.map(toWorktree)),
          Effect.mapError(mapDatabaseError)
        ),

      "worktree.get": params =>
        storage.worktrees.get(params.id).pipe(
          Effect.map(toWorktree),
          Effect.mapError(mapNotFoundError)
        ),

      "worktree.getByPath": params =>
        storage.worktrees.getByPath(params.path).pipe(
          Effect.map(toWorktree),
          Effect.mapError(mapNotFoundError)
        ),

      "worktree.update": params =>
        storage.worktrees
          .update(params.id, {
            status: params.input.status,
            lastAccessedAt: params.input.lastAccessedAt
          })
          .pipe(Effect.map(toWorktree), Effect.mapError(mapUpdateError)),

      "worktree.touch": params =>
        storage.worktrees.touch(params.id).pipe(Effect.mapError(mapNotFoundError)),

      // ─── Combined Git + Storage Operations ───────────────

      "worktree.create": params =>
        Effect.gen(function* () {
          // 1. Get repository to find the git repo path
          const repository = yield* storage.repositories.get(params.repositoryId);

          // 2. Create git worktree
          yield* gitWorktree.create({
            repoPath: repository.directoryPath,
            worktreePath: params.path,
            branch: params.branch,
            createBranch: true,
            fromRef: params.baseBranch
          });

          // 3. Create storage record
          const worktree = yield* storage.worktrees.create({
            repositoryId: params.repositoryId,
            path: params.path,
            branch: params.branch,
            name: params.name,
            baseBranch: params.baseBranch,
            status: params.status
          });

          return toWorktree(worktree);
        }).pipe(Effect.mapError(mapWorktreeCreateError)),

      "worktree.delete": params =>
        Effect.gen(function* () {
          // 1. Get worktree to find the path
          const worktree = yield* storage.worktrees.get(params.id);

          // 2. Get repository to find the git repo path
          const repository = yield* storage.repositories.get(worktree.repositoryId);

          // 3. Remove git worktree
          yield* gitWorktree.remove({
            repoPath: repository.directoryPath,
            worktreePath: worktree.path,
            force: true
          });

          // 4. Delete storage record
          yield* storage.worktrees.delete(params.id);
        }).pipe(Effect.mapError(mapWorktreeDeleteError))
    });
  })
);

export const WorktreeRpcHandlersLive = WorktreeRpcHandlers.pipe(
  Layer.provide(StorageServiceDefault),
  Layer.provide(WorktreeServiceLive)
);
