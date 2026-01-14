import { Schema } from "effect";

// Shared types

export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;

/** Provider-specific metadata (AI SDK v6 compatible) */
export const ProviderMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type ProviderMetadata = typeof ProviderMetadata.Type;

/** Streaming state for text/reasoning parts */
export const StreamingState = Schema.Literal("streaming", "done");
export type StreamingState = typeof StreamingState.Type;

/** Tool approval structure (AI SDK v6 compatible) */
export class ToolApproval extends Schema.Class<ToolApproval>("ToolApproval")({
	id: Schema.String,
	approved: Schema.optional(Schema.Boolean),
	reason: Schema.optional(Schema.String),
}) {}

// Message Parts

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
	// AI SDK v6 fields
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

// Message Part Union

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

// Message Types

export const MessageMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type MessageMetadata = typeof MessageMetadata.Type;

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
	id: Schema.String,
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	createdAt: Schema.String,
	metadata: Schema.optional(MessageMetadata),
}) {}

export class CreateChatMessageInput extends Schema.Class<CreateChatMessageInput>(
	"CreateChatMessageInput",
)({
	/** Optional explicit ID (for stream/history dedup) */
	id: Schema.optional(Schema.String),
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	metadata: Schema.optional(MessageMetadata),
}) {}
