import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

import {
  BranchExistsRpcError,
  GitCommandRpcError,
  WorktreeExistsRpcError,
  WorktreeNotFoundRpcError
} from "./errors";
import { CreateWorktreeOptions, RemoveWorktreeOptions, WorktreeInfo } from "./types";

export class WorktreeRpc extends RpcGroup.make(
  Rpc.make("worktree.list", {
    payload: { repoPath: Schema.String },
    success: Schema.Array(WorktreeInfo),
    error: GitCommandRpcError
  }),

  Rpc.make("worktree.get", {
    payload: { repoPath: Schema.String, worktreePath: Schema.String },
    success: WorktreeInfo,
    error: Schema.Union(GitCommandRpcError, WorktreeNotFoundRpcError)
  }),

  Rpc.make("worktree.create", {
    payload: CreateWorktreeOptions,
    success: WorktreeInfo,
    error: Schema.Union(GitCommandRpcError, WorktreeExistsRpcError, BranchExistsRpcError)
  }),

  Rpc.make("worktree.remove", {
    payload: RemoveWorktreeOptions,
    success: Schema.Void,
    error: Schema.Union(GitCommandRpcError, WorktreeNotFoundRpcError)
  }),

  Rpc.make("worktree.prune", {
    payload: { repoPath: Schema.String },
    success: Schema.Void,
    error: GitCommandRpcError
  })
) {}
