import { Schema } from "effect";

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Shared Primitive Types
// ─────────────────────────────────────────────────────────────────────────────

/** Provider-specific metadata (AI SDK v6 compatible) */
export const ProviderMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type ProviderMetadata = typeof ProviderMetadata.Type;

/** Streaming state for text/reasoning parts (part-level) */
export const StreamingState = Schema.Literal("streaming", "done");
export type StreamingState = typeof StreamingState.Type;

/** Streaming status for session coordination (session-level) */
export const StreamingStatus = Schema.Literal("idle", "streaming");
export type StreamingStatus = typeof StreamingStatus.Type;

/** Finish reason for chat completion (AI SDK v6 compatible) */
export const FinishReason = Schema.Literal(
	"stop",
	"error",
	"length",
	"tool-calls",
	"content-filter",
	"other",
);
export type FinishReason = typeof FinishReason.Type;

/** Message role (AI SDK v6 compatible) */
export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: AI SDK v6 Message Parts (UIMessagePart compatible)
// ─────────────────────────────────────────────────────────────────────────────

/** Text content part (AI SDK v6: TextUIPart) */
export class TextPart extends Schema.Class<TextPart>("TextPart")({
	type: Schema.Literal("text"),
	text: Schema.String,
	state: Schema.optional(StreamingState),
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

/** Reasoning/thinking part (AI SDK v6: ReasoningUIPart) */
export class ReasoningPart extends Schema.Class<ReasoningPart>("ReasoningPart")(
	{
		type: Schema.Literal("reasoning"),
		text: Schema.String,
		state: Schema.optional(StreamingState),
		providerMetadata: Schema.optional(ProviderMetadata),
	},
) {}

/** Tool approval structure (AI SDK v6 compatible) */
export class ToolApproval extends Schema.Class<ToolApproval>("ToolApproval")({
	id: Schema.String,
	approved: Schema.optional(Schema.Boolean),
	reason: Schema.optional(Schema.String),
}) {}

/** Tool call states (AI SDK v6 compatible) */
export const ToolCallState = Schema.Literal(
	"input-streaming",
	"input-available",
	"approval-requested",
	"approval-responded",
	"output-available",
	"output-error",
	"output-denied",
);
export type ToolCallState = typeof ToolCallState.Type;

/** Tool invocation part (AI SDK v6: ToolUIPart/DynamicToolUIPart) */
export class ToolCallPart extends Schema.Class<ToolCallPart>("ToolCallPart")({
	type: Schema.String, // 'tool-{name}' or 'dynamic-tool'
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	state: ToolCallState,
	output: Schema.optional(Schema.Unknown),
	title: Schema.optional(Schema.String),
	providerExecuted: Schema.optional(Schema.Boolean),
	errorText: Schema.optional(Schema.String),
	approval: Schema.optional(ToolApproval),
	callProviderMetadata: Schema.optional(ProviderMetadata),
}) {}

/** File attachment part (AI SDK v6: FileUIPart) */
export class FilePart extends Schema.Class<FilePart>("FilePart")({
	type: Schema.Literal("file"),
	mediaType: Schema.String,
	filename: Schema.optional(Schema.String),
	url: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

/** URL source citation (AI SDK v6: SourceUrlUIPart) */
export class SourceUrlPart extends Schema.Class<SourceUrlPart>("SourceUrlPart")(
	{
		type: Schema.Literal("source-url"),
		sourceId: Schema.String,
		url: Schema.String,
		title: Schema.optional(Schema.String),
		providerMetadata: Schema.optional(ProviderMetadata),
	},
) {}

/** Document source citation (AI SDK v6: SourceDocumentUIPart) */
export class SourceDocumentPart extends Schema.Class<SourceDocumentPart>(
	"SourceDocumentPart",
)({
	type: Schema.Literal("source-document"),
	sourceId: Schema.String,
	mediaType: Schema.String,
	title: Schema.String,
	filename: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

/** Step start marker (AI SDK v6: StepStartUIPart) */
export class StepStartPart extends Schema.Class<StepStartPart>("StepStartPart")(
	{
		type: Schema.Literal("step-start"),
	},
) {}

/** Custom data part (AI SDK v6: DataUIPart) */
export class DataPart extends Schema.Class<DataPart>("DataPart")({
	type: Schema.String, // 'data-{name}'
	id: Schema.optional(Schema.String),
	data: Schema.Unknown,
}) {}

/** Union of all message parts (AI SDK v6: UIMessagePart) */
export const MessagePart = Schema.Union(
	TextPart,
	ReasoningPart,
	ToolCallPart,
	FilePart,
	SourceUrlPart,
	SourceDocumentPart,
	StepStartPart,
	DataPart,
);
export type MessagePart = typeof MessagePart.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Chat Message Types
// ─────────────────────────────────────────────────────────────────────────────

/** Message metadata (AI SDK v6 compatible) */
export const MessageMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type MessageMetadata = typeof MessageMetadata.Type;

/** Chat message (AI SDK v6: UIMessage) */
export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
	id: Schema.String,
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	createdAt: Schema.String,
	metadata: Schema.optional(MessageMetadata),
}) {}

/** Input for creating a new chat message */
export class CreateChatMessageInput extends Schema.Class<CreateChatMessageInput>(
	"CreateChatMessageInput",
)({
	id: Schema.optional(Schema.String),
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	metadata: Schema.optional(MessageMetadata),
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: AI SDK v6 Streaming Events (UIMessageChunk compatible)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Text Streaming Events ───────────────────────────────────────────────────

export class StreamEventTextStart extends Schema.Class<StreamEventTextStart>(
	"StreamEventTextStart",
)({
	type: Schema.Literal("text-start"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventTextDelta extends Schema.Class<StreamEventTextDelta>(
	"StreamEventTextDelta",
)({
	type: Schema.Literal("text-delta"),
	id: Schema.String,
	delta: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventTextEnd extends Schema.Class<StreamEventTextEnd>(
	"StreamEventTextEnd",
)({
	type: Schema.Literal("text-end"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

// ─── Reasoning Streaming Events ──────────────────────────────────────────────

export class StreamEventReasoningStart extends Schema.Class<StreamEventReasoningStart>(
	"StreamEventReasoningStart",
)({
	type: Schema.Literal("reasoning-start"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventReasoningDelta extends Schema.Class<StreamEventReasoningDelta>(
	"StreamEventReasoningDelta",
)({
	type: Schema.Literal("reasoning-delta"),
	id: Schema.String,
	delta: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventReasoningEnd extends Schema.Class<StreamEventReasoningEnd>(
	"StreamEventReasoningEnd",
)({
	type: Schema.Literal("reasoning-end"),
	id: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

// ─── Tool Streaming Events ───────────────────────────────────────────────────

export class StreamEventToolInputStart extends Schema.Class<StreamEventToolInputStart>(
	"StreamEventToolInputStart",
)({
	type: Schema.Literal("tool-input-start"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
	title: Schema.optional(Schema.String),
}) {}

export class StreamEventToolInputDelta extends Schema.Class<StreamEventToolInputDelta>(
	"StreamEventToolInputDelta",
)({
	type: Schema.Literal("tool-input-delta"),
	toolCallId: Schema.String,
	inputTextDelta: Schema.String,
}) {}

export class StreamEventToolInputAvailable extends Schema.Class<StreamEventToolInputAvailable>(
	"StreamEventToolInputAvailable",
)({
	type: Schema.Literal("tool-input-available"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	providerMetadata: Schema.optional(ProviderMetadata),
	dynamic: Schema.optional(Schema.Boolean),
	title: Schema.optional(Schema.String),
}) {}

export class StreamEventToolInputError extends Schema.Class<StreamEventToolInputError>(
	"StreamEventToolInputError",
)({
	type: Schema.Literal("tool-input-error"),
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	providerMetadata: Schema.optional(ProviderMetadata),
	dynamic: Schema.optional(Schema.Boolean),
	errorText: Schema.String,
	title: Schema.optional(Schema.String),
}) {}

export class StreamEventToolApprovalRequest extends Schema.Class<StreamEventToolApprovalRequest>(
	"StreamEventToolApprovalRequest",
)({
	type: Schema.Literal("tool-approval-request"),
	approvalId: Schema.String,
	toolCallId: Schema.String,
}) {}

export class StreamEventToolOutputAvailable extends Schema.Class<StreamEventToolOutputAvailable>(
	"StreamEventToolOutputAvailable",
)({
	type: Schema.Literal("tool-output-available"),
	toolCallId: Schema.String,
	output: Schema.Unknown,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
	preliminary: Schema.optional(Schema.Boolean),
}) {}

export class StreamEventToolOutputError extends Schema.Class<StreamEventToolOutputError>(
	"StreamEventToolOutputError",
)({
	type: Schema.Literal("tool-output-error"),
	toolCallId: Schema.String,
	errorText: Schema.String,
	providerExecuted: Schema.optional(Schema.Boolean),
	dynamic: Schema.optional(Schema.Boolean),
}) {}

export class StreamEventToolOutputDenied extends Schema.Class<StreamEventToolOutputDenied>(
	"StreamEventToolOutputDenied",
)({
	type: Schema.Literal("tool-output-denied"),
	toolCallId: Schema.String,
}) {}

// ─── Source/File Events ──────────────────────────────────────────────────────

export class StreamEventSourceUrl extends Schema.Class<StreamEventSourceUrl>(
	"StreamEventSourceUrl",
)({
	type: Schema.Literal("source-url"),
	sourceId: Schema.String,
	url: Schema.String,
	title: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventSourceDocument extends Schema.Class<StreamEventSourceDocument>(
	"StreamEventSourceDocument",
)({
	type: Schema.Literal("source-document"),
	sourceId: Schema.String,
	mediaType: Schema.String,
	title: Schema.String,
	filename: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

export class StreamEventFile extends Schema.Class<StreamEventFile>(
	"StreamEventFile",
)({
	type: Schema.Literal("file"),
	url: Schema.String,
	mediaType: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
}) {}

// ─── Step/Data Events ────────────────────────────────────────────────────────

export class StreamEventStepStart extends Schema.Class<StreamEventStepStart>(
	"StreamEventStepStart",
)({
	type: Schema.Literal("start-step"),
}) {}

export class StreamEventStepEnd extends Schema.Class<StreamEventStepEnd>(
	"StreamEventStepEnd",
)({
	type: Schema.Literal("finish-step"),
}) {}

export class StreamEventData extends Schema.Class<StreamEventData>(
	"StreamEventData",
)({
	type: Schema.String, // 'data-{name}'
	id: Schema.optional(Schema.String),
	data: Schema.Unknown,
	transient: Schema.optional(Schema.Boolean),
}) {}

// ─── Lifecycle Events ────────────────────────────────────────────────────────

export class StreamEventStart extends Schema.Class<StreamEventStart>(
	"StreamEventStart",
)({
	type: Schema.Literal("start"),
	messageId: Schema.optional(Schema.String),
	messageMetadata: Schema.optional(MessageMetadata),
	/** Claude SDK session ID - used for resume */
	claudeSessionId: Schema.optional(Schema.String),
}) {}

export class StreamEventFinish extends Schema.Class<StreamEventFinish>(
	"StreamEventFinish",
)({
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
}) {}

export class StreamEventAbort extends Schema.Class<StreamEventAbort>(
	"StreamEventAbort",
)({
	type: Schema.Literal("abort"),
	reason: Schema.optional(Schema.String),
}) {}

export class StreamEventMessageMetadata extends Schema.Class<StreamEventMessageMetadata>(
	"StreamEventMessageMetadata",
)({
	type: Schema.Literal("message-metadata"),
	messageMetadata: MessageMetadata,
}) {}

export class StreamEventError extends Schema.Class<StreamEventError>(
	"StreamEventError",
)({
	type: Schema.Literal("error"),
	errorText: Schema.String,
}) {}

// ─── Stream Event Union ──────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Session Coordination Types
// ─────────────────────────────────────────────────────────────────────────────

/** Initial snapshot for a new subscription */
export class SessionSnapshotEvent extends Schema.Class<SessionSnapshotEvent>(
	"SessionSnapshotEvent",
)({
	type: Schema.Literal("session-snapshot"),
	epoch: Schema.String,
	status: StreamingStatus,
	claudeSessionId: Schema.NullOr(Schema.String),
	bufferMinSeq: Schema.NullOr(Schema.Number),
	bufferMaxSeq: Schema.NullOr(Schema.Number),
	latestSeq: Schema.Number,
	needsHistory: Schema.Boolean,
}) {}

/** Wrapper with sequence number for replay/ordering */
export class SequencedStreamEvent extends Schema.Class<SequencedStreamEvent>(
	"SequencedStreamEvent",
)({
	seq: Schema.Number,
	timestamp: Schema.String,
	event: ChatStreamEvent,
}) {}

/** Events emitted on chat.subscribe */
export const SubscribeEvent = Schema.Union(
	SessionSnapshotEvent,
	SequencedStreamEvent,
);
export type SubscribeEvent = typeof SubscribeEvent.Type;

// ─────────────────────────────────────────────────────────────────────────────
// Section 6: RPC Input Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input for starting or continuing a chat stream */
export class ChatStreamInput extends Schema.Class<ChatStreamInput>(
	"ChatStreamInput",
)({
	sessionId: Schema.String,
	worktreeId: Schema.String,
	prompt: Schema.String,
	claudeSessionId: Schema.optional(Schema.NullOr(Schema.String)),
	autonomous: Schema.optional(Schema.Boolean),
}) {}

/** Input for subscribing to session events */
export class ChatSubscribeInput extends Schema.Class<ChatSubscribeInput>(
	"ChatSubscribeInput",
)({
	sessionId: Schema.String,
	lastSeenSeq: Schema.optional(Schema.Number),
	epoch: Schema.optional(Schema.String),
}) {}

/** Input for sending a user message (non-streaming RPC) */
export class ChatSendInput extends Schema.Class<ChatSendInput>("ChatSendInput")(
	{
		sessionId: Schema.String,
		worktreeId: Schema.String,
		prompt: Schema.String,
		claudeSessionId: Schema.optional(Schema.NullOr(Schema.String)),
		autonomous: Schema.optional(Schema.Boolean),
	},
) {}

/** Input for fetching current session state */
export class ChatGetSessionStateInput extends Schema.Class<ChatGetSessionStateInput>(
	"ChatGetSessionStateInput",
)({
	sessionId: Schema.String,
}) {}

// ─────────────────────────────────────────────────────────────────────────────
// Section 7: RPC Error Types
// ─────────────────────────────────────────────────────────────────────────────

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
