import { Schema } from "effect"
import * as Rpc from "effect/unstable/rpc/Rpc"

import {
  InternalError,
  SessionNotFound,
  WorkspaceNotFound,
  WorkspaceNotGit,
  WorktreeCreateFailed,
} from "../errors.ts"
import { AbsolutePath, IsoDateTime, SessionId, WorkspaceId } from "../ids.ts"

export const WorktreeMode = Schema.Union([
  Schema.TaggedStruct("local", {}),
  Schema.TaggedStruct("worktree", {
    baseBranch: Schema.NullOr(Schema.String),
  }),
])
export type WorktreeMode = typeof WorktreeMode.Type

export const SessionStatus = Schema.Literals(["idle", "running", "exited"])
export type SessionStatus = typeof SessionStatus.Type

export const Session = Schema.Struct({
  id: SessionId,
  workspaceId: WorkspaceId,
  title: Schema.String,
  worktreeMode: WorktreeMode,
  workdir: AbsolutePath,
  branch: Schema.NullOr(Schema.String),
  status: SessionStatus,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Session = typeof Session.Type

export const SessionsCreatePayload = Schema.Struct({
  workspaceId: WorkspaceId,
  title: Schema.optional(Schema.String),
  worktreeMode: WorktreeMode,
})
export type SessionsCreatePayload = typeof SessionsCreatePayload.Type

export const SessionsCreateRpc = Rpc.make("sessions.create", {
  payload: SessionsCreatePayload,
  success: Session,
  error: Schema.Union([
    WorkspaceNotFound,
    WorkspaceNotGit,
    WorktreeCreateFailed,
    InternalError,
  ]),
})

export const SessionsListPayload = Schema.Struct({
  workspaceId: Schema.optional(WorkspaceId),
})
export const SessionsListRpc = Rpc.make("sessions.list", {
  payload: SessionsListPayload,
  success: Schema.Array(Session),
  error: Schema.Union([InternalError]),
})

export const SessionsGetPayload = Schema.Struct({
  sessionId: SessionId,
})
export const SessionsGetRpc = Rpc.make("sessions.get", {
  payload: SessionsGetPayload,
  success: Session,
  error: Schema.Union([SessionNotFound, InternalError]),
})

export const SessionsDeletePayload = Schema.Struct({
  sessionId: SessionId,
})
export const SessionsDeleteRpc = Rpc.make("sessions.delete", {
  payload: SessionsDeletePayload,
  success: Schema.Struct({}),
  error: Schema.Union([SessionNotFound, InternalError]),
})
