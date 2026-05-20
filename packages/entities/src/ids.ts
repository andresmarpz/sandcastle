import { Brand } from "effect"

export type WorkspaceId = string & Brand.Brand<"WorkspaceId">
export const WorkspaceId = Brand.nominal<WorkspaceId>()

export type SessionId = string & Brand.Brand<"SessionId">
export const SessionId = Brand.nominal<SessionId>()

export type BlobHash = string & Brand.Brand<"BlobHash">
export const BlobHash = Brand.nominal<BlobHash>()

export type ClientId = string & Brand.Brand<"ClientId">
export const ClientId = Brand.nominal<ClientId>()
