import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

import { UpdateWorktreeInput, Worktree } from "@sandcastle/storage/entities";

import { DatabaseRpcError, ForeignKeyViolationRpcError } from "../common/errors";
import {
  GitOperationRpcError,
  WorktreeNotFoundRpcError,
  WorktreePathExistsRpcError
} from "./errors";

export interface CreateWorktreeRequest {
  repositoryId: string;
}

export const CreateWorktreeRequestSchema = Schema.Struct({
  repositoryId: Schema.String
});

export class WorktreeRpc extends RpcGroup.make(
  Rpc.make("worktree.list", {
    payload: {},
    success: Schema.Array(Worktree),
    error: DatabaseRpcError
  }),

  Rpc.make("worktree.listByRepository", {
    payload: { repositoryId: Schema.String },
    success: Schema.Array(Worktree),
    error: DatabaseRpcError
  }),

  Rpc.make("worktree.get", {
    payload: { id: Schema.String },
    success: Worktree,
    error: Schema.Union(WorktreeNotFoundRpcError, DatabaseRpcError)
  }),

  Rpc.make("worktree.getByPath", {
    payload: { path: Schema.String },
    success: Worktree,
    error: Schema.Union(WorktreeNotFoundRpcError, DatabaseRpcError)
  }),

  Rpc.make("worktree.create", {
    payload: CreateWorktreeRequestSchema,
    success: Worktree,
    error: Schema.Union(
      WorktreePathExistsRpcError,
      ForeignKeyViolationRpcError,
      GitOperationRpcError,
      DatabaseRpcError
    )
  }),

  Rpc.make("worktree.update", {
    payload: Schema.Struct({
      id: Schema.String,
      input: UpdateWorktreeInput
    }),
    success: Worktree,
    error: Schema.Union(WorktreeNotFoundRpcError, DatabaseRpcError)
  }),

  Rpc.make("worktree.delete", {
    payload: { id: Schema.String },
    success: Schema.Void,
    error: Schema.Union(WorktreeNotFoundRpcError, GitOperationRpcError, DatabaseRpcError)
  }),

  Rpc.make("worktree.touch", {
    payload: { id: Schema.String },
    success: Schema.Void,
    error: Schema.Union(WorktreeNotFoundRpcError, DatabaseRpcError)
  })
) {}
