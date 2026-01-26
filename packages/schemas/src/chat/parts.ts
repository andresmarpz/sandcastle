import { Schema } from "effect";
import { ProviderMetadata, StreamingState } from "../primitives";

/** Text content part (AI SDK v6: TextUIPart) */
export const TextPart = Schema.Struct({
	type: Schema.Literal("text"),
	text: Schema.String,
	state: Schema.optional(StreamingState),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type TextPart = typeof TextPart.Type;

/** Reasoning/thinking part (AI SDK v6: ReasoningUIPart) */
export const ReasoningPart = Schema.Struct({
	type: Schema.Literal("reasoning"),
	text: Schema.String,
	state: Schema.optional(StreamingState),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type ReasoningPart = typeof ReasoningPart.Type;

/** Tool approval structure (AI SDK v6 compatible) */
export const ToolApproval = Schema.Struct({
	id: Schema.String,
	approved: Schema.optional(Schema.Boolean),
	reason: Schema.optional(Schema.String),
});
export type ToolApproval = typeof ToolApproval.Type;

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

/**
 * Tool-specific metadata union.
 * Discriminated by toolName field on the parent ToolCallPart.
 */

/** Metadata for Skill tool - from SDK tool_use_result */
export const SkillToolMetadata = Schema.Struct({
	tool: Schema.Literal("Skill"),
	commandName: Schema.String,
	allowedTools: Schema.optional(Schema.Array(Schema.String)),
});
export type SkillToolMetadata = typeof SkillToolMetadata.Type;

/** Metadata for ExitPlanMode tool - approval info */
export const ExitPlanModeToolMetadata = Schema.Struct({
	tool: Schema.Literal("ExitPlanMode"),
	approved: Schema.Boolean,
	reason: Schema.optional(Schema.String),
});
export type ExitPlanModeToolMetadata = typeof ExitPlanModeToolMetadata.Type;

/** Union of all tool-specific metadata */
export const ToolMetadata = Schema.Union(
	SkillToolMetadata,
	ExitPlanModeToolMetadata,
);
export type ToolMetadata = typeof ToolMetadata.Type;

/** Tool invocation part (AI SDK v6: ToolUIPart/DynamicToolUIPart) */
export const ToolCallPart = Schema.Struct({
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
	/** Parent tool call ID - links this tool to its parent subagent (Task tool) */
	parentToolCallId: Schema.optional(Schema.NullOr(Schema.String)),
	/** Tool-specific metadata - discriminated by `tool` field */
	toolMetadata: Schema.optional(ToolMetadata),
});
export type ToolCallPart = typeof ToolCallPart.Type;

/** File attachment part (AI SDK v6: FileUIPart) */
export const FilePart = Schema.Struct({
	type: Schema.Literal("file"),
	mediaType: Schema.String,
	filename: Schema.optional(Schema.String),
	url: Schema.String,
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type FilePart = typeof FilePart.Type;

/** URL source citation (AI SDK v6: SourceUrlUIPart) */
export const SourceUrlPart = Schema.Struct({
	type: Schema.Literal("source-url"),
	sourceId: Schema.String,
	url: Schema.String,
	title: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type SourceUrlPart = typeof SourceUrlPart.Type;

/** Document source citation (AI SDK v6: SourceDocumentUIPart) */
export const SourceDocumentPart = Schema.Struct({
	type: Schema.Literal("source-document"),
	sourceId: Schema.String,
	mediaType: Schema.String,
	title: Schema.String,
	filename: Schema.optional(Schema.String),
	providerMetadata: Schema.optional(ProviderMetadata),
});
export type SourceDocumentPart = typeof SourceDocumentPart.Type;

/** Step start marker (AI SDK v6: StepStartUIPart) */
export const StepStartPart = Schema.Struct({
	type: Schema.Literal("step-start"),
});
export type StepStartPart = typeof StepStartPart.Type;

/** Custom data part (AI SDK v6: DataUIPart) */
export const DataPart = Schema.Struct({
	type: Schema.String, // 'data-{name}'
	id: Schema.optional(Schema.String),
	data: Schema.Unknown,
});
export type DataPart = typeof DataPart.Type;

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
