import { Schema } from "effect";
import { StreamingStatus } from "../primitives";

/** Generic chat operation error */
export class ChatRpcError extends Schema.TaggedError<ChatRpcError>()(
	"ChatRpcError",
	{
		message: Schema.String,
		code: Schema.optional(Schema.String),
	},
) {}

/** Session not found error */
export class ChatSessionNotFoundRpcError extends Schema.TaggedError<ChatSessionNotFoundRpcError>()(
	"ChatSessionNotFoundRpcError",
	{
		sessionId: Schema.String,
	},
) {}

/** Session is busy (already streaming) */
export class SessionBusyRpcError extends Schema.TaggedError<SessionBusyRpcError>()(
	"SessionBusyRpcError",
	{
		sessionId: Schema.String,
		currentStatus: StreamingStatus,
	},
) {}
