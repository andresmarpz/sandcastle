import { Data } from "effect"

export class SqliteError extends Data.TaggedError("SqliteError")<{
  readonly cause: unknown
  readonly query?: string
}> {}

export class WorkspacePathConflict extends Data.TaggedError(
  "WorkspacePathConflict",
)<{
  readonly path: string
}> {}

export class WorkspaceNotFound extends Data.TaggedError("WorkspaceNotFound")<{
  readonly workspaceId: string
}> {}

export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{
  readonly sessionId: string
}> {}
