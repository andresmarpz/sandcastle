import { Schema } from "effect";
import { FinishReason, ProviderMetadata } from "../primitives";
import { MessageMetadata } from "./message";

export const StreamEventTextStart = Schema.Struct({
	type: Schema.Literal("text-start"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventTextStart = typeof StreamEventTextStart.Type;

export const StreamEventTextDelta = Schema.Struct({
	type: Schema.Literal("text-delta"),
	id: Schema.String,
	delta: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventTextDelta = typeof StreamEventTextDelta.Type;

export const StreamEventTextEnd = Schema.Struct({
	type: Schema.Literal("text-end"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventTextEnd = typeof StreamEventTextEnd.Type;

export const StreamEventReasoningStart = Schema.Struct({
	type: Schema.Literal("reasoning-start"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventReasoningStart = typeof StreamEventReasoningStart.Type;

export const StreamEventReasoningDelta = Schema.Struct({
	type: Schema.Literal("reasoning-delta"),
	id: Schema.String,
	delta: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventReasoningDelta = typeof StreamEventReasoningDelta.Type;

export const StreamEventReasoningEnd = Schema.Struct({
	type: Schema.Literal("reasoning-end"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventReasoningEnd = typeof StreamEventReasoningEnd.Type;

export const StreamEventToolInputStart = Schema.Struct({
	type: Schema.Literal("tool-input-start"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
	title: Schema.optional(Schema.String),
});
export type StreamEventToolInputStart = typeof StreamEventToolInputStart.Type;

export const StreamEventToolInputDelta = Schema.Struct({
	type: Schema.Literal("tool-input-delta"),
	toolCallId: Schema.String,
	inputTextDelta: Schema.String,
});
export type StreamEventToolInputDelta = typeof StreamEventToolInputDelta.Type;

export const StreamEventToolInputAvailable = Schema.Struct({
	type: Schema.Literal("tool-input-available"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	providerMetadata: Schema.optional(ProviderMetadata),
	dynamic: Schema.optional(Schema.Boolean),
	title: Schema.optional(Schema.String),
});
export type StreamEventToolInputAvailable =
	typeof StreamEventToolInputAvailable.Type;

export const StreamEventToolInputError = Schema.Struct({
	type: Schema.Literal("tool-input-error"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	providerMetadata: Schema.optional(ProviderMetadata),
	dynamic: Schema.optional(Schema.Boolean),
	errorText: Schema.String,
	title: Schema.optional(Schema.String),
});
export type StreamEventToolInputError = typeof StreamEventToolInputError.Type;

export const StreamEventToolApprovalRequest = Schema.Struct({
	type: Schema.Literal("tool-approval-request"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	/** ID of the message containing context (e.g., plan content for ExitPlanMode) */
	messageId: Schema.optional(Schema.String),
});
export type StreamEventToolApprovalRequest =
	typeof StreamEventToolApprovalRequest.Type;

// ============================================================================
// Tool Approval Response Payloads
// ============================================================================

/** Payload for AskUserQuestion responses */
export const AskUserQuestionPayload = Schema.Struct({
	type: Schema.Literal("AskUserQuestionPayload"),
	/** Map of question index to selected answer(s) */
	answers: Schema.Record({
		key: Schema.String,
		value: Schema.Union(Schema.String, Schema.Array(Schema.String)),
	}),
});
export type AskUserQuestionPayload = typeof AskUserQuestionPayload.Type;

/** Payload for ExitPlanMode responses */
export const ExitPlanModePayload = Schema.Struct({
	type: Schema.Literal("ExitPlanModePayload"),
	/** Optional feedback when rejecting a plan */
	feedback: Schema.optional(Schema.String),
});
export type ExitPlanModePayload = typeof ExitPlanModePayload.Type;

/** Union of tool-specific response payloads */
export const ToolApprovalPayload = Schema.Union(
	AskUserQuestionPayload,
	ExitPlanModePayload,
);
export type ToolApprovalPayload = typeof ToolApprovalPayload.Type;

/** Response to a tool approval request (sent via RPC) */
export const ToolApprovalResponse = Schema.Struct({
	type: Schema.Literal("tool-approval-response"),
	/** Must match the toolCallId from the request */
	toolCallId: Schema.String,
	/** Echo back for validation/logging */
	toolName: Schema.String,
	/** Universal approve/deny flag */
	approved: Schema.Boolean,
	/** Tool-specific response data */
	payload: Schema.optional(ToolApprovalPayload),
});
export type ToolApprovalResponse = typeof ToolApprovalResponse.Type;

export const StreamEventToolOutputAvailable = Schema.Struct({
	type: Schema.Literal("tool-output-available"),
	toolCallId: Schema.String,
	output: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
	preliminary: Schema.optional(Schema.Boolean),
});
export type StreamEventToolOutputAvailable =
	typeof StreamEventToolOutputAvailable.Type;

export const StreamEventToolOutputError = Schema.Struct({
	type: Schema.Literal("tool-output-error"),
	toolCallId: Schema.String,
	errorText: Schema.String,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
});
export type StreamEventToolOutputError = typeof StreamEventToolOutputError.Type;

export const StreamEventToolOutputDenied = Schema.Struct({
	type: Schema.Literal("tool-output-denied"),
	toolCallId: Schema.String,
});
export type StreamEventToolOutputDenied =
	typeof StreamEventToolOutputDenied.Type;

export const StreamEventSourceUrl = Schema.Struct({
	type: Schema.Literal("source-url"),
	sourceId: Schema.String,
	url: Schema.String,
	title: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventSourceUrl = typeof StreamEventSourceUrl.Type;

export const StreamEventSourceDocument = Schema.Struct({
	type: Schema.Literal("source-document"),
	sourceId: Schema.String,
	mediaType: Schema.String,
	title: Schema.String,
	filename: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventSourceDocument = typeof StreamEventSourceDocument.Type;

export const StreamEventFile = Schema.Struct({
	type: Schema.Literal("file"),
	url: Schema.String,
	mediaType: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type StreamEventFile = typeof StreamEventFile.Type;

export const StreamEventStepStart = Schema.Struct({
	type: Schema.Literal("start-step"),
});
export type StreamEventStepStart = typeof StreamEventStepStart.Type;

export const StreamEventStepEnd = Schema.Struct({
	type: Schema.Literal("finish-step"),
});
export type StreamEventStepEnd = typeof StreamEventStepEnd.Type;

export const StreamEventData = Schema.Struct({
	type: Schema.TemplateLiteral("data-", Schema.String),
	id: Schema.optional(Schema.String),
	data: Schema.Unknown,
	transient: Schema.optional(Schema.Boolean),
});
export type StreamEventData = typeof StreamEventData.Type;

export const StreamEventStart = Schema.Struct({
	type: Schema.Literal("start"),
	messageId: Schema.optional(Schema.String),
	messageMetadata: Schema.optional(MessageMetadata),
	/** Claude SDK session ID - used for resume */
	claudeSessionId: Schema.optional(Schema.String),
});
export type StreamEventStart = typeof StreamEventStart.Type;

export const StreamEventFinish = Schema.Struct({
	type: Schema.Literal("finish"),
	finishReason: Schema.optional(FinishReason),
	messageMetadata: Schema.optional(MessageMetadata),
	/** Claude-specific session metadata */
	metadata: Schema.optional(
		Schema.Struct({
			claudeSessionId: Schema.optional(Schema.String),
			costUsd: Schema.optional(Schema.Number),
			inputTokens: Schema.optional(Schema.Number),
			outputTokens: Schema.optional(Schema.Number),
		}),
	),
});
export type StreamEventFinish = typeof StreamEventFinish.Type;

export const StreamEventAbort = Schema.Struct({
	type: Schema.Literal("abort"),
	reason: Schema.optional(Schema.String),
});
export type StreamEventAbort = typeof StreamEventAbort.Type;

export const StreamEventMessageMetadata = Schema.Struct({
	type: Schema.Literal("message-metadata"),
	messageMetadata: MessageMetadata,
});
export type StreamEventMessageMetadata = typeof StreamEventMessageMetadata.Type;

export const StreamEventError = Schema.Struct({
	type: Schema.Literal("error"),
	errorText: Schema.String,
});
export type StreamEventError = typeof StreamEventError.Type;

/** Union of all stream events (AI SDK v6: UIMessageChunk) */
export const ChatStreamEvent = Schema.Union(
	// Text events
	StreamEventTextStart,
	StreamEventTextDelta,
	StreamEventTextEnd,
	// Reasoning events
	StreamEventReasoningStart,
	StreamEventReasoningDelta,
	StreamEventReasoningEnd,
	// Tool events
	StreamEventToolInputStart,
	StreamEventToolInputDelta,
	StreamEventToolInputAvailable,
	StreamEventToolInputError,
	StreamEventToolApprovalRequest,
	StreamEventToolOutputAvailable,
	StreamEventToolOutputError,
	StreamEventToolOutputDenied,
	// Source/file events
	StreamEventSourceUrl,
	StreamEventSourceDocument,
	StreamEventFile,
	// Step/data events
	StreamEventStepStart,
	StreamEventStepEnd,
	StreamEventData,
	// Lifecycle events
	StreamEventStart,
	StreamEventFinish,
	StreamEventAbort,
	StreamEventMessageMetadata,
	StreamEventError,
);
export type ChatStreamEvent = typeof ChatStreamEvent.Type;
