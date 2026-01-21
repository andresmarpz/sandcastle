import { Rpc, RpcGroup } from "@effect/rpc";
import { GitDiffStats } from "@sandcastle/schemas";
import { Schema } from "effect";

import { DatabaseRpcError } from "../common/errors";
import { GitOperationRpcError } from "../worktrees/errors";
import {
	GitSessionNotFoundRpcError,
	NotAGitRepositoryRpcError,
} from "./errors";

export class GitRpc extends RpcGroup.make(
	Rpc.make("git.getSessionStats", {
		payload: { sessionId: Schema.String },
		success: GitDiffStats,
		error: Schema.Union(
			GitSessionNotFoundRpcError,
			GitOperationRpcError,
			NotAGitRepositoryRpcError,
			DatabaseRpcError,
		),
	}),
) {}
