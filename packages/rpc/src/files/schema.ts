import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema } from "effect";

import { FileSearchRpcError } from "./errors";

// Response type for file search results
export class FileMatch extends Schema.Class<FileMatch>("FileMatch")({
	path: Schema.String, // Relative path from worktree root
	name: Schema.String, // Just the filename
	score: Schema.Number, // Fuzzy match score
}) {}

export class FilesRpc extends RpcGroup.make(
	Rpc.make("files.find", {
		payload: {
			worktreeId: Schema.String, // Worktree ID (server resolves to path)
			pattern: Schema.String, // Fuzzy search pattern
			maxResults: Schema.optional(Schema.Number), // Limit results (default 20)
		},
		success: Schema.Array(FileMatch),
		error: FileSearchRpcError,
	}),
) {}
