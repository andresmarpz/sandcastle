import { Rpc, RpcGroup } from "@effect/rpc";
import {
	CreateRepositoryInput,
	Repository,
	UpdateRepositoryInput,
} from "@sandcastle/storage/entities";
import { Schema } from "effect";

import { DatabaseRpcError } from "../common/errors";
import {
	RepositoryNotFoundRpcError,
	RepositoryPathExistsRpcError,
} from "./errors";

export class RepositoryRpc extends RpcGroup.make(
	Rpc.make("repository.list", {
		payload: {},
		success: Schema.Array(Repository),
		error: DatabaseRpcError,
	}),

	Rpc.make("repository.get", {
		payload: { id: Schema.String },
		success: Repository,
		error: Schema.Union(RepositoryNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("repository.getByPath", {
		payload: { directoryPath: Schema.String },
		success: Repository,
		error: Schema.Union(RepositoryNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("repository.create", {
		payload: CreateRepositoryInput,
		success: Repository,
		error: Schema.Union(RepositoryPathExistsRpcError, DatabaseRpcError),
	}),

	Rpc.make("repository.update", {
		payload: Schema.Struct({
			id: Schema.String,
			input: UpdateRepositoryInput,
		}),
		success: Repository,
		error: Schema.Union(RepositoryNotFoundRpcError, DatabaseRpcError),
	}),

	Rpc.make("repository.delete", {
		payload: { id: Schema.String },
		success: Schema.Void,
		error: Schema.Union(RepositoryNotFoundRpcError, DatabaseRpcError),
	}),
) {}
