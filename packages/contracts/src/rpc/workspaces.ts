import { Schema } from "effect"
import * as Rpc from "effect/unstable/rpc/Rpc"

import { AbsolutePath, IsoDateTime, WorkspaceId } from "../ids.ts"
import {
  InternalError,
  WorkspaceNotFound,
  WorkspacePathConflict,
  WorkspacePathInvalid,
  WorkspacePathNotFound,
} from "../errors.ts"

export const Workspace = Schema.Struct({
  id: WorkspaceId,
  label: Schema.String,
  path: AbsolutePath,
  isGit: Schema.Boolean,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Workspace = typeof Workspace.Type

export const WorkspacesCreatePayload = Schema.Struct({
  label: Schema.String,
  path: AbsolutePath,
})
export type WorkspacesCreatePayload = typeof WorkspacesCreatePayload.Type

export const WorkspacesCreateRpc = Rpc.make("workspaces.create", {
  payload: WorkspacesCreatePayload,
  success: Workspace,
  error: Schema.Union([
    WorkspacePathInvalid,
    WorkspacePathNotFound,
    WorkspacePathConflict,
    InternalError,
  ]),
})

export const WorkspacesListRpc = Rpc.make("workspaces.list", {
  payload: Schema.Struct({}),
  success: Schema.Array(Workspace),
  error: Schema.Union([InternalError]),
})

export const WorkspacesGetPayload = Schema.Struct({
  workspaceId: WorkspaceId,
})
export const WorkspacesGetRpc = Rpc.make("workspaces.get", {
  payload: WorkspacesGetPayload,
  success: Workspace,
  error: Schema.Union([WorkspaceNotFound, InternalError]),
})

export const WorkspacesDeletePayload = Schema.Struct({
  workspaceId: WorkspaceId,
})
export const WorkspacesDeleteRpc = Rpc.make("workspaces.delete", {
  payload: WorkspacesDeletePayload,
  success: Schema.Struct({}),
  error: Schema.Union([WorkspaceNotFound, InternalError]),
})
