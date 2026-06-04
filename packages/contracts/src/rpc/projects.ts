import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";

import {
	InternalError,
	ProjectNotFound,
	ProjectPathConflict,
	ProjectPathInvalid,
	ProjectPathNotFound,
	ProjectReorderMismatch,
} from "../errors.ts";
import { AbsolutePath, IsoDateTime, ProjectId } from "../ids.ts";

export const Project = Schema.Struct({
	id: ProjectId,
	name: Schema.String,
	rootPath: AbsolutePath,
	isGit: Schema.Boolean,
	// Shell script run in each new worktree workspace on creation; null when unset.
	initScript: Schema.NullOr(Schema.String),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
});
export type Project = typeof Project.Type;

export const ProjectsListPayload = Schema.Struct({});
export type ProjectsListPayload = typeof ProjectsListPayload.Type;

export const ProjectsListRpc = Rpc.make("projects.list", {
	payload: ProjectsListPayload,
	success: Schema.Array(Project),
	error: Schema.Union([InternalError]),
});

export const ProjectsCreatePayload = Schema.Struct({
	name: Schema.String,
	rootPath: AbsolutePath,
});
export type ProjectsCreatePayload = typeof ProjectsCreatePayload.Type;

export const ProjectsCreateRpc = Rpc.make("projects.create", {
	payload: ProjectsCreatePayload,
	success: Project,
	error: Schema.Union([
		ProjectPathInvalid,
		ProjectPathNotFound,
		ProjectPathConflict,
		InternalError,
	]),
});

export const ProjectsRenamePayload = Schema.Struct({
	projectId: ProjectId,
	name: Schema.String,
});
export type ProjectsRenamePayload = typeof ProjectsRenamePayload.Type;

export const ProjectsRenameRpc = Rpc.make("projects.rename", {
	payload: ProjectsRenamePayload,
	success: Project,
	error: Schema.Union([ProjectNotFound, InternalError]),
});

export const ProjectsSetInitScriptPayload = Schema.Struct({
	projectId: ProjectId,
	// null (or an empty string, normalized to null server-side) clears the script.
	initScript: Schema.NullOr(Schema.String),
});
export type ProjectsSetInitScriptPayload = typeof ProjectsSetInitScriptPayload.Type;

export const ProjectsSetInitScriptRpc = Rpc.make("projects.setInitScript", {
	payload: ProjectsSetInitScriptPayload,
	success: Project,
	error: Schema.Union([ProjectNotFound, InternalError]),
});

export const ProjectsDeletePayload = Schema.Struct({
	projectId: ProjectId,
});
export type ProjectsDeletePayload = typeof ProjectsDeletePayload.Type;

export const ProjectsDeleteRpc = Rpc.make("projects.delete", {
	payload: ProjectsDeletePayload,
	success: Schema.Struct({}),
	error: Schema.Union([ProjectNotFound, InternalError]),
});

export const ProjectsReorderPayload = Schema.Struct({
	projectIds: Schema.Array(ProjectId),
});
export type ProjectsReorderPayload = typeof ProjectsReorderPayload.Type;

export const ProjectsReorderRpc = Rpc.make("projects.reorder", {
	payload: ProjectsReorderPayload,
	success: Schema.Struct({}),
	error: Schema.Union([ProjectReorderMismatch, InternalError]),
});
