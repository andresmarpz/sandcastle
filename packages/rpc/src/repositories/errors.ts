import { Schema } from "effect";

/**
 * Repository not found by ID or path.
 */
export class RepositoryNotFoundRpcError extends Schema.TaggedError<RepositoryNotFoundRpcError>()(
	"RepositoryNotFoundRpcError",
	{
		id: Schema.optional(Schema.String),
		directoryPath: Schema.optional(Schema.String),
	},
) {}

/**
 * A repository already exists at the given path.
 */
export class RepositoryPathExistsRpcError extends Schema.TaggedError<RepositoryPathExistsRpcError>()(
	"RepositoryPathExistsRpcError",
	{
		directoryPath: Schema.String,
	},
) {}

export const RepositoryRpcError = Schema.Union(
	RepositoryNotFoundRpcError,
	RepositoryPathExistsRpcError,
);
export type RepositoryRpcError = typeof RepositoryRpcError.Type;
