import { Schema } from "effect";

// projects.*
export class ProjectPathInvalid extends Schema.TaggedErrorClass<ProjectPathInvalid>()(
	"ProjectPathInvalid",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {}

export class ProjectPathNotFound extends Schema.TaggedErrorClass<ProjectPathNotFound>()(
	"ProjectPathNotFound",
	{
		path: Schema.String,
	},
) {}

export class ProjectPathConflict extends Schema.TaggedErrorClass<ProjectPathConflict>()(
	"ProjectPathConflict",
	{
		rootPath: Schema.String,
	},
) {}

export class ProjectNotFound extends Schema.TaggedErrorClass<ProjectNotFound>()("ProjectNotFound", {
	projectId: Schema.String,
}) {}

export class ProjectReorderMismatch extends Schema.TaggedErrorClass<ProjectReorderMismatch>()(
	"ProjectReorderMismatch",
	{
		expected: Schema.Array(Schema.String),
		got: Schema.Array(Schema.String),
	},
) {}

// workspaces.*
export class WorkspaceNotFound extends Schema.TaggedErrorClass<WorkspaceNotFound>()(
	"WorkspaceNotFound",
	{
		workspaceId: Schema.String,
	},
) {}

export class WorkspaceNotGit extends Schema.TaggedErrorClass<WorkspaceNotGit>()("WorkspaceNotGit", {
	projectId: Schema.String,
}) {}

export class WorkspaceLocalConflict extends Schema.TaggedErrorClass<WorkspaceLocalConflict>()(
	"WorkspaceLocalConflict",
	{
		projectId: Schema.String,
	},
) {}

export class WorktreeCreateFailed extends Schema.TaggedErrorClass<WorktreeCreateFailed>()(
	"WorktreeCreateFailed",
	{
		message: Schema.String,
	},
) {}

// Raised by workspaces.upsertForPath when a filesystem path can't be mapped to a
// known project/worktree (not a git work tree, or its repo isn't a Sandcastle
// project). Used by the MCP "teleport" flow to decide a terminal can't be
// re-grouped — a soft, expected outcome rather than a crash.
export class WorkspacePathUnresolved extends Schema.TaggedErrorClass<WorkspacePathUnresolved>()(
	"WorkspacePathUnresolved",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {}

// catch-all
export class InternalError extends Schema.TaggedErrorClass<InternalError>()("InternalError", {
	message: Schema.String,
}) {}
