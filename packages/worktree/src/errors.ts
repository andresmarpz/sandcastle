import { Data } from "effect"

export class GitNotFoundError extends Data.TaggedError("GitNotFoundError")<{
  message: string
}> {}

export class WorktreeExistsError extends Data.TaggedError("WorktreeExistsError")<{
  path: string
}> {}

export class WorktreeNotFoundError extends Data.TaggedError("WorktreeNotFoundError")<{
  path: string
}> {}

export class BranchExistsError extends Data.TaggedError("BranchExistsError")<{
  branch: string
}> {}

export class InvalidRepoError extends Data.TaggedError("InvalidRepoError")<{
  path: string
  message: string
}> {}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  command: string
  stderr: string
  exitCode: number
}> {}
