import { Data } from "effect"

export class ProjectExistsError extends Data.TaggedError("ProjectExistsError")<{
  name: string
}> {}

export class ProjectNotFoundError extends Data.TaggedError("ProjectNotFoundError")<{
  name: string
}> {}

export class InvalidGitRepoError extends Data.TaggedError("InvalidGitRepoError")<{
  path: string
}> {}
