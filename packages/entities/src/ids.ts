import { Brand } from "effect";

export type ProjectId = string & Brand.Brand<"ProjectId">;
export const ProjectId = Brand.nominal<ProjectId>();

export type WorkspaceId = string & Brand.Brand<"WorkspaceId">;
export const WorkspaceId = Brand.nominal<WorkspaceId>();

export type ClientId = string & Brand.Brand<"ClientId">;
export const ClientId = Brand.nominal<ClientId>();
