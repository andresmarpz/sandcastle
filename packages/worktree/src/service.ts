import { Context, Effect } from "effect"
import type { WorktreeInfo, CreateWorktreeOptions, RemoveWorktreeOptions } from "./types"
import type {
  GitCommandError,
  WorktreeExistsError,
  WorktreeNotFoundError,
  BranchExistsError,
} from "./errors"

export class WorktreeService extends Context.Tag("WorktreeService")<
  WorktreeService,
  {
    create: (
      options: CreateWorktreeOptions
    ) => Effect.Effect<WorktreeInfo, GitCommandError | WorktreeExistsError | BranchExistsError>

    list: (repoPath: string) => Effect.Effect<WorktreeInfo[], GitCommandError>

    remove: (
      options: RemoveWorktreeOptions
    ) => Effect.Effect<void, GitCommandError | WorktreeNotFoundError>

    get: (
      repoPath: string,
      worktreePath: string
    ) => Effect.Effect<WorktreeInfo, GitCommandError | WorktreeNotFoundError>

    prune: (repoPath: string) => Effect.Effect<void, GitCommandError>
  }
>() {}
