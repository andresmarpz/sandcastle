import { Rpc, RpcGroup } from "@effect/rpc";
import { AskUserQuestionItem, ChatMessage } from "@sandcastle/storage/entities";
import { Schema } from "effect";

import { DatabaseRpcError } from "../common/errors";

/**
 * Generic chat operation error
 */
export class ChatRpcError extends Schema.TaggedError<ChatRpcError>()(
	"ChatRpcError",
	{
		message: Schema.String,
		code: Schema.optional(Schema.String),
	},
) {}

/**
 * Session not found error
 */
export class ChatSessionNotFoundRpcError extends Schema.TaggedError<ChatSessionNotFoundRpcError>()(
	"ChatSessionNotFoundRpcError",
	{
		sessionId: Schema.String,
	},
) {}

/**
 * No pending question to respond to
 */
export class NoPendingQuestionRpcError extends Schema.TaggedError<NoPendingQuestionRpcError>()(
	"NoPendingQuestionRpcError",
	{
		sessionId: Schema.String,
	},
) {}

// ─── AI SDK v6 Compatible Stream Events ──────────────────────
//
// These match the Vercel AI SDK v6 UIMessageChunk protocol.
// The frontend can use these directly with useChat's transport.

/**
 * Finish reason for chat completion
 */
export const FinishReason = Schema.Literal(
	"stop",
	"error",
	"length",
	"tool-calls",
	"other",
);
export type FinishReason = typeof FinishReason.Type;

/**
 * Message start event - begins a new assistant message
 */
export class StreamEventStart extends Schema.Class<StreamEventStart>(
	"StreamEventStart",
)({
	type: Schema.Literal("start"),
	messageId: Schema.String,
	/** Claude SDK session ID - used for resume */
	claudeSessionId: Schema.optional(Schema.String),
}) {}

/**
 * Text streaming events - start/delta/end pattern
 */
export class StreamEventTextStart extends Schema.Class<StreamEventTextStart>(
	"StreamEventTextStart",
)({
	type: Schema.Literal("text-start"),
	id: Schema.String,
}) {}

export class StreamEventTextDelta extends Schema.Class<StreamEventTextDelta>(
	"StreamEventTextDelta",
)({
	type: Schema.Literal("text-delta"),
	id: Schema.String,
	delta: Schema.String,
}) {}

export class StreamEventTextEnd extends Schema.Class<StreamEventTextEnd>(
	"StreamEventTextEnd",
)({
	type: Schema.Literal("text-end"),
	id: Schema.String,
}) {}

/**
 * Tool streaming events
 */
export class StreamEventToolInputStart extends Schema.Class<StreamEventToolInputStart>(
	"StreamEventToolInputStart",
)({
	type: Schema.Literal("tool-input-start"),
	toolCallId: Schema.String,
	toolName: Schema.String,
}) {}

export class StreamEventToolInputAvailable extends Schema.Class<StreamEventToolInputAvailable>(
	"StreamEventToolInputAvailable",
)({
	type: Schema.Literal("tool-input-available"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
}) {}

export class StreamEventToolOutputAvailable extends Schema.Class<StreamEventToolOutputAvailable>(
	"StreamEventToolOutputAvailable",
)({
	type: Schema.Literal("tool-output-available"),
	toolCallId: Schema.String,
	output: Schema.Unknown,
}) {}

/**
 * Reasoning/thinking events (for extended thinking)
 */
export class StreamEventReasoningStart extends Schema.Class<StreamEventReasoningStart>(
	"StreamEventReasoningStart",
)({
	type: Schema.Literal("reasoning-start"),
	id: Schema.String,
}) {}

export class StreamEventReasoningDelta extends Schema.Class<StreamEventReasoningDelta>(
	"StreamEventReasoningDelta",
)({
	type: Schema.Literal("reasoning-delta"),
	id: Schema.String,
	delta: Schema.String,
}) {}

export class StreamEventReasoningEnd extends Schema.Class<StreamEventReasoningEnd>(
	"StreamEventReasoningEnd",
)({
	type: Schema.Literal("reasoning-end"),
	id: Schema.String,
}) {}

/**
 * AskUser event - custom extension for interactive questions
 */
export class StreamEventAskUser extends Schema.Class<StreamEventAskUser>(
	"StreamEventAskUser",
)({
	type: Schema.Literal("ask-user"),
	toolCallId: Schema.String,
	questions: Schema.Array(AskUserQuestionItem),
}) {}

/**
 * Finish event - ends the stream
 */
export class StreamEventFinish extends Schema.Class<StreamEventFinish>(
	"StreamEventFinish",
)({
	type: Schema.Literal("finish"),
	finishReason: FinishReason,
	/** Session metadata - available on finish */
	metadata: Schema.optional(
		Schema.Struct({
			claudeSessionId: Schema.optional(Schema.String),
			costUsd: Schema.optional(Schema.Number),
			inputTokens: Schema.optional(Schema.Number),
			outputTokens: Schema.optional(Schema.Number),
		}),
	),
}) {}

/**
 * Error event
 */
export class StreamEventError extends Schema.Class<StreamEventError>(
	"StreamEventError",
)({
	type: Schema.Literal("error"),
	errorText: Schema.String,
}) {}

/**
 * Union of all stream event types (AI SDK v6 compatible)
 */
export const ChatStreamEvent = Schema.Union(
	StreamEventStart,
	StreamEventTextStart,
	StreamEventTextDelta,
	StreamEventTextEnd,
	StreamEventToolInputStart,
	StreamEventToolInputAvailable,
	StreamEventToolOutputAvailable,
	StreamEventReasoningStart,
	StreamEventReasoningDelta,
	StreamEventReasoningEnd,
	StreamEventAskUser,
	StreamEventFinish,
	StreamEventError,
);
export type ChatStreamEvent = typeof ChatStreamEvent.Type;

// ─── Input Types ─────────────────────────────────────────────

/**
 * Input for starting or continuing a chat stream
 */
export class ChatStreamInput extends Schema.Class<ChatStreamInput>(
	"ChatStreamInput",
)({
	/** Session ID from storage */
	sessionId: Schema.String,
	/** Worktree ID - used to get the working directory */
	worktreeId: Schema.String,
	/** The prompt to send */
	prompt: Schema.String,
	/** Optional: Claude session ID for resume */
	claudeSessionId: Schema.optional(Schema.NullOr(Schema.String)),
	/** Optional: Enable autonomous mode with extended system prompt */
	autonomous: Schema.optional(Schema.Boolean),
}) {}

/**
 * Input for responding to AskUserQuestion
 */
export class ChatRespondInput extends Schema.Class<ChatRespondInput>(
	"ChatRespondInput",
)({
	/** Session ID */
	sessionId: Schema.String,
	/** Tool use ID from the ask_user event */
	toolUseId: Schema.String,
	/** Answers keyed by question header */
	answers: Schema.Record({ key: Schema.String, value: Schema.String }),
}) {}

// ─── RPC Group ───────────────────────────────────────────────

/**
 * Chat RPC group - full-featured chat with streaming
 */
export class ChatRpc extends RpcGroup.make(
	/**
	 * Start or continue a streaming chat session.
	 * Returns a stream of AI SDK v6 compatible events.
	 */
	Rpc.make("chat.stream", {
		payload: ChatStreamInput,
		success: ChatStreamEvent,
		error: Schema.Union(
			ChatRpcError,
			ChatSessionNotFoundRpcError,
			DatabaseRpcError,
		),
		stream: true,
	}),

	/**
	 * Interrupt a running chat session.
	 * Aborts the current Claude query.
	 */
	Rpc.make("chat.interrupt", {
		payload: { sessionId: Schema.String },
		success: Schema.Void,
		error: Schema.Union(ChatRpcError, ChatSessionNotFoundRpcError),
	}),

	/**
	 * Get message history for a session.
	 * Returns AI SDK v6 compatible UIMessages.
	 */
	Rpc.make("chat.history", {
		payload: { sessionId: Schema.String },
		success: Schema.Array(ChatMessage),
		error: Schema.Union(ChatRpcError, DatabaseRpcError),
	}),
) {}
