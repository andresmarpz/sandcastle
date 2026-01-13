import { Schema } from "effect";

export class FileSearchRpcError extends Schema.TaggedError<FileSearchRpcError>()(
	"FileSearchRpcError",
	{
		message: Schema.String,
	},
) {}
