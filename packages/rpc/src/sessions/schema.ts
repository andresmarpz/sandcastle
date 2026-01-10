import { Rpc, RpcGroup } from "@effect/rpc";
import {
	CreateSessionInput,
	Session,
	UpdateSessionInput,
} from "@sandcastle/storage/entities";
import { Schema } from "effect";

import {
	DatabaseRpcError,
	ForeignKeyViolationRpcError,
} from "../common/errors";
import { SessionNotFoundRpcError } from "./errors";

export class SessionRpc extends RpcGroup.make(
	Rpc.make("session.list", {
		payload: {},
		success: Schema.Array(Session),
		error: DatabaseRpcError,
	}),

	Rpc.make("session.listByWorktree", {
		payload: { worktreeId: Schema.String },
		success: Schema.Array(Session),
		error: DatabaseRpcError,
	}),

	Rpc.make("session.get", {
		payload: { id: Schema.String },
		success: Session,
		error: Schema.Union(SessionNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("session.create", {
		payload: CreateSessionInput,
		success: Session,
		error: Schema.Union(ForeignKeyViolationRpcError, DatabaseRpcError),
	}),

	Rpc.make("session.update", {
		payload: Schema.Struct({
			id: Schema.String,
			input: UpdateSessionInput,
		}),
		success: Session,
		error: Schema.Union(SessionNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("session.delete", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: Schema.Union(SessionNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("session.touch", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: Schema.Union(SessionNotFoundRpcError, DatabaseRpcError),
	}),
) {}
