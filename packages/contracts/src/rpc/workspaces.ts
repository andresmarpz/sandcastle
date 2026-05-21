import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";

import {
	InternalError,
	ProjectNotFound,
	WorkspaceLocalConflict,
	WorkspaceNotFound,
	WorkspaceNotGit,
	WorktreeCreateFailed,
} from "../errors.ts";
import { AbsolutePath, IsoDateTime, ProjectId, WorkspaceId } from "../ids.ts";

export const WorkspaceKind = Schema.Literals(["local", "worktree"]);
export type WorkspaceKind = typeof WorkspaceKind.Type;

export const Workspace = Schema.Struct({
	id: WorkspaceId,
	projectId: ProjectId,
	name: Schema.String,
	kind: WorkspaceKind,
	path: AbsolutePath,
	branch: Schema.NullOr(Schema.String),
	baseBranch: Schema.NullOr(Schema.String),
	createdAt: IsoDateTime,
	updatedAt: IsoDateTime,
});
export type Workspace = typeof Workspace.Type;

export const WorkspaceCreateConfig = Schema.Union([
	Schema.TaggedStruct("local", {}),
	Schema.TaggedStruct("worktree", {
		branch: Schema.optional(Schema.String),
		baseBranch: Schema.optional(Schema.String),
	}),
]);
export type WorkspaceCreateConfig = typeof WorkspaceCreateConfig.Type;

export const WorkspacesListPayload = Schema.Struct({
	projectId: ProjectId,
});
export type WorkspacesListPayload = typeof WorkspacesListPayload.Type;

export const WorkspacesListRpc = Rpc.make("workspaces.list", {
	payload: WorkspacesListPayload,
	success: Schema.Array(Workspace),
	error: Schema.Union([ProjectNotFound, InternalError]),
});

export const WorkspacesGetPayload = Schema.Struct({
	workspaceId: WorkspaceId,
});
export type WorkspacesGetPayload = typeof WorkspacesGetPayload.Type;

export const WorkspacesGetRpc = Rpc.make("workspaces.get", {
	payload: WorkspacesGetPayload,
	success: Workspace,
	error: Schema.Union([WorkspaceNotFound, InternalError]),
});

export const WorkspacesCreatePayload = Schema.Struct({
	projectId: ProjectId,
	name: Schema.String,
	config: WorkspaceCreateConfig,
});
export type WorkspacesCreatePayload = typeof WorkspacesCreatePayload.Type;

export const WorkspacesCreateRpc = Rpc.make("workspaces.create", {
	payload: WorkspacesCreatePayload,
	success: Workspace,
	error: Schema.Union([
		ProjectNotFound,
		WorkspaceNotGit,
		WorkspaceLocalConflict,
		WorktreeCreateFailed,
		InternalError,
	]),
});

export const WorkspacesDeletePayload = Schema.Struct({
	workspaceId: WorkspaceId,
});
export type WorkspacesDeletePayload = typeof WorkspacesDeletePayload.Type;

export const WorkspacesDeleteRpc = Rpc.make("workspaces.delete", {
	payload: WorkspacesDeletePayload,
	success: Schema.Struct({}),
	error: Schema.Union([WorkspaceNotFound, InternalError]),
});
