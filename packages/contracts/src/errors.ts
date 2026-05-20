import { Schema } from "effect"

// workspaces.*
export class WorkspacePathInvalid extends Schema.TaggedErrorClass<WorkspacePathInvalid>()(
  "WorkspacePathInvalid",
  {
    path: Schema.String,
    reason: Schema.String,
  },
) {}

export class WorkspacePathNotFound extends Schema.TaggedErrorClass<WorkspacePathNotFound>()(
  "WorkspacePathNotFound",
  {
    path: Schema.String,
  },
) {}

export class WorkspacePathConflict extends Schema.TaggedErrorClass<WorkspacePathConflict>()(
  "WorkspacePathConflict",
  {
    path: Schema.String,
  },
) {}

export class WorkspaceNotFound extends Schema.TaggedErrorClass<WorkspaceNotFound>()(
  "WorkspaceNotFound",
  {
    workspaceId: Schema.String,
  },
) {}

// sessions.*
export class SessionNotFound extends Schema.TaggedErrorClass<SessionNotFound>()(
  "SessionNotFound",
  {
    sessionId: Schema.String,
  },
) {}

export class WorkspaceNotGit extends Schema.TaggedErrorClass<WorkspaceNotGit>()(
  "WorkspaceNotGit",
  {
    workspaceId: Schema.String,
  },
) {}

export class WorktreeCreateFailed extends Schema.TaggedErrorClass<WorktreeCreateFailed>()(
  "WorktreeCreateFailed",
  {
    message: Schema.String,
  },
) {}

export class InternalError extends Schema.TaggedErrorClass<InternalError>()("InternalError", {
  message: Schema.String,
}) {}
