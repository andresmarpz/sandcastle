import { Schema } from "effect";

/**
 * Chat session not found error
 */
export class ChatSessionNotFoundRpcError extends Schema.TaggedError<ChatSessionNotFoundRpcError>()(
	"ChatSessionNotFoundRpcError",
	{
		sessionId: Schema.String,
	},
) {}

/**
 * Session is busy (already streaming)
 */
export class ChatSessionBusyRpcError extends Schema.TaggedError<ChatSessionBusyRpcError>()(
	"ChatSessionBusyRpcError",
	{
		sessionId: Schema.String,
	},
) {}

/**
 * Generic chat operation error
 */
export class ChatOperationRpcError extends Schema.TaggedError<ChatOperationRpcError>()(
	"ChatOperationRpcError",
	{
		message: Schema.String,
		code: Schema.optional(Schema.String),
	},
) {}

/**
 * Tool approval request not found (no pending request with that toolCallId)
 */
export class ToolApprovalNotFoundRpcError extends Schema.TaggedError<ToolApprovalNotFoundRpcError>()(
	"ToolApprovalNotFoundRpcError",
	{
		toolCallId: Schema.String,
	},
) {}

export const ChatRpcError = Schema.Union(
	ChatSessionNotFoundRpcError,
	ChatSessionBusyRpcError,
	ChatOperationRpcError,
	ToolApprovalNotFoundRpcError,
);
export type ChatRpcError = typeof ChatRpcError.Type;
