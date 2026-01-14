import { Schema } from "effect";

export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;

export class TextPart extends Schema.Class<TextPart>("TextPart")({
	type: Schema.Literal("text"),
	text: Schema.String,
}) {}

export const ToolCallState = Schema.Literal(
	"partial",
	"input-available",
	"output-available",
	"error",
);
export type ToolCallState = typeof ToolCallState.Type;

export class ToolCallPart extends Schema.Class<ToolCallPart>("ToolCallPart")({
	type: Schema.String,
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	state: ToolCallState,
	output: Schema.optional(Schema.Unknown),
}) {}

export class ReasoningPart extends Schema.Class<ReasoningPart>("ReasoningPart")(
	{
		type: Schema.Literal("reasoning"),
		reasoning: Schema.String,
	},
) {}

export class AskUserQuestionOption extends Schema.Class<AskUserQuestionOption>(
	"AskUserQuestionOption",
)({
	label: Schema.String,
	description: Schema.String,
}) {}

export class AskUserQuestionItem extends Schema.Class<AskUserQuestionItem>(
	"AskUserQuestionItem",
)({
	question: Schema.String,
	header: Schema.String,
	options: Schema.Array(AskUserQuestionOption),
	multiSelect: Schema.Boolean,
}) {}

export class AskUserPart extends Schema.Class<AskUserPart>("AskUserPart")({
	type: Schema.Literal("ask-user"),
	toolCallId: Schema.String,
	questions: Schema.Array(AskUserQuestionItem),
	answers: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
}) {}

export const MessagePart = Schema.Union(
	TextPart,
	ToolCallPart,
	ReasoningPart,
	AskUserPart,
);
export type MessagePart = typeof MessagePart.Type;

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
