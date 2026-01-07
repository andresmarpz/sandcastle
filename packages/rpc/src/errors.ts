import { Schema } from "effect"

export class GitCommandRpcError extends Schema.TaggedError<GitCommandRpcError>()(
  "GitCommandRpcError",
  {
    command: Schema.String,
    stderr: Schema.String,
    exitCode: Schema.Number,
  }
) {}

export class GitNotFoundRpcError extends Schema.TaggedError<GitNotFoundRpcError>()(
  "GitNotFoundRpcError",
  {
    message: Schema.String,
  }
) {}

export class WorktreeExistsRpcError extends Schema.TaggedError<WorktreeExistsRpcError>()(
  "WorktreeExistsRpcError",
  {
    path: Schema.String,
  }
) {}

export class WorktreeNotFoundRpcError extends Schema.TaggedError<WorktreeNotFoundRpcError>()(
  "WorktreeNotFoundRpcError",
  {
    path: Schema.String,
  }
) {}

export class BranchExistsRpcError extends Schema.TaggedError<BranchExistsRpcError>()(
  "BranchExistsRpcError",
  {
    branch: Schema.String,
  }
) {}

export class InvalidRepoRpcError extends Schema.TaggedError<InvalidRepoRpcError>()(
  "InvalidRepoRpcError",
  {
    path: Schema.String,
    message: Schema.String,
  }
) {}

export const WorktreeRpcError = Schema.Union(
  GitCommandRpcError,
  GitNotFoundRpcError,
  WorktreeExistsRpcError,
  WorktreeNotFoundRpcError,
  BranchExistsRpcError,
  InvalidRepoRpcError
)

export type WorktreeRpcError = Schema.Schema.Type<typeof WorktreeRpcError>
