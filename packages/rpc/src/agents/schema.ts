import { Rpc, RpcGroup } from "@effect/rpc";
import {
	Agent,
	CreateAgentInput,
	UpdateAgentInput,
} from "@sandcastle/storage/entities";
import { Schema } from "effect";

import {
	DatabaseRpcError,
	ForeignKeyViolationRpcError,
} from "../common/errors";
import { AgentNotFoundRpcError } from "./errors";

export class AgentRpc extends RpcGroup.make(
	Rpc.make("agent.list", {
		payload: {},
		success: Schema.Array(Agent),
		error: DatabaseRpcError,
	}),

	Rpc.make("agent.listBySession", {
		payload: { sessionId: Schema.String },
		success: Schema.Array(Agent),
		error: DatabaseRpcError,
	}),

	Rpc.make("agent.get", {
		payload: { id: Schema.String },
		success: Agent,
		error: Schema.Union(AgentNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("agent.create", {
		payload: CreateAgentInput,
		success: Agent,
		error: Schema.Union(ForeignKeyViolationRpcError, DatabaseRpcError),
	}),

	Rpc.make("agent.update", {
		payload: Schema.Struct({
			id: Schema.String,
			input: UpdateAgentInput,
		}),
		success: Agent,
		error: Schema.Union(AgentNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("agent.delete", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: Schema.Union(AgentNotFoundRpcError, DatabaseRpcError),
	}),
) {}
