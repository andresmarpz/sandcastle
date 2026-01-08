import { Effect, Layer } from "effect";

import {
  BranchExistsRpcError,
  GitCommandRpcError,
  WorktreeExistsRpcError,
  WorktreeInfo,
  WorktreeNotFoundRpcError,
  WorktreeRpc
} from "@sandcastle/rpc";
import {
  WorktreeService,
  WorktreeServiceLive,
  type BranchExistsError,
  type GitCommandError,
  type WorktreeExistsError,
  type WorktreeNotFoundError
} from "@sandcastle/worktree";

const mapGitError = (error: GitCommandError): GitCommandRpcError =>
  new GitCommandRpcError({
    command: error.command,
    stderr: error.stderr,
    exitCode: error.exitCode
  });

const mapGetError = (
  error: GitCommandError | WorktreeNotFoundError
): GitCommandRpcError | WorktreeNotFoundRpcError => {
  if (error._tag === "WorktreeNotFoundError") {
    return new WorktreeNotFoundRpcError({ path: error.path });
  }
  return mapGitError(error);
};

const mapCreateError = (
  error: GitCommandError | WorktreeExistsError | BranchExistsError
): GitCommandRpcError | WorktreeExistsRpcError | BranchExistsRpcError => {
  if (error._tag === "WorktreeExistsError") {
    return new WorktreeExistsRpcError({ path: error.path });
  }
  if (error._tag === "BranchExistsError") {
    return new BranchExistsRpcError({ branch: error.branch });
  }
  return mapGitError(error);
};

const mapRemoveError = (
  error: GitCommandError | WorktreeNotFoundError
): GitCommandRpcError | WorktreeNotFoundRpcError => {
  if (error._tag === "WorktreeNotFoundError") {
    return new WorktreeNotFoundRpcError({ path: error.path });
  }
  return mapGitError(error);
};

const toWorktreeInfo = (info: {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}): WorktreeInfo =>
  new WorktreeInfo({
    path: info.path,
    branch: info.branch,
    commit: info.commit,
    isMain: info.isMain
  });

export const WorktreeRpcHandlers = WorktreeRpc.toLayer(
  Effect.gen(function* () {
    const worktree = yield* WorktreeService;

    return WorktreeRpc.of({
      "worktree.list": params =>
        worktree.list(params.repoPath).pipe(
          Effect.map(worktrees => worktrees.map(toWorktreeInfo)),
          Effect.mapError(mapGitError)
        ),

      "worktree.get": params =>
        worktree
          .get(params.repoPath, params.worktreePath)
          .pipe(Effect.map(toWorktreeInfo), Effect.mapError(mapGetError)),

      "worktree.create": params =>
        worktree
          .create({
            repoPath: params.repoPath,
            worktreePath: params.worktreePath,
            branch: params.branch,
            createBranch: params.createBranch,
            fromRef: params.fromRef
          })
          .pipe(Effect.map(toWorktreeInfo), Effect.mapError(mapCreateError)),

      "worktree.remove": params =>
        worktree
          .remove({
            repoPath: params.repoPath,
            worktreePath: params.worktreePath,
            force: params.force
          })
          .pipe(Effect.mapError(mapRemoveError)),

      "worktree.prune": params => worktree.prune(params.repoPath).pipe(Effect.mapError(mapGitError))
    });
  })
);

export const WorktreeRpcHandlersLive = WorktreeRpcHandlers.pipe(Layer.provide(WorktreeServiceLive));
