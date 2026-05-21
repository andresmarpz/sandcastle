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

// catch-all
export class InternalError extends Schema.TaggedErrorClass<InternalError>()("InternalError", {
	message: Schema.String,
}) {}
