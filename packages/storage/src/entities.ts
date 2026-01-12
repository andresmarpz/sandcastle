import { Schema } from "effect";

// ─── Status Enums ─────────────────────────────────────────────

export const WorktreeStatus = Schema.Literal("active", "stale", "archived");
export type WorktreeStatus = typeof WorktreeStatus.Type;

export const SessionStatus = Schema.Literal(
	"created",
	"active",
	"paused",
	"completed",
	"failed",
);
export type SessionStatus = typeof SessionStatus.Type;

export const AgentStatus = Schema.Literal(
	"starting",
	"running",
	"idle",
	"stopped",
	"crashed",
);
export type AgentStatus = typeof AgentStatus.Type;

// ─── Repository ───────────────────────────────────────────────

export class Repository extends Schema.Class<Repository>("Repository")({
	id: Schema.String,
	label: Schema.String,
	directoryPath: Schema.String,
	defaultBranch: Schema.String,
	pinned: Schema.Boolean,
	/** ISO 8601 timestamp */
	createdAt: Schema.String,
	/** ISO 8601 timestamp */
	updatedAt: Schema.String,
}) {}

export class CreateRepositoryInput extends Schema.Class<CreateRepositoryInput>(
	"CreateRepositoryInput",
)({
	label: Schema.String,
	directoryPath: Schema.String,
	defaultBranch: Schema.optional(Schema.String),
}) {}

export class UpdateRepositoryInput extends Schema.Class<UpdateRepositoryInput>(
	"UpdateRepositoryInput",
)({
	label: Schema.optional(Schema.String),
	defaultBranch: Schema.optional(Schema.String),
	pinned: Schema.optional(Schema.Boolean),
}) {}

// ─── Worktree ─────────────────────────────────────────────────

export class Worktree extends Schema.Class<Worktree>("Worktree")({
	id: Schema.String,
	repositoryId: Schema.String,
	path: Schema.String,
	branch: Schema.String,
	name: Schema.String,
	baseBranch: Schema.String,
	status: WorktreeStatus,
	/** ISO 8601 timestamp */
	createdAt: Schema.String,
	/** ISO 8601 timestamp */
	lastAccessedAt: Schema.String,
}) {}

export class CreateWorktreeInput extends Schema.Class<CreateWorktreeInput>(
	"CreateWorktreeInput",
)({
	repositoryId: Schema.String,
	path: Schema.String,
	branch: Schema.String,
	name: Schema.String,
	baseBranch: Schema.String,
	status: Schema.optional(WorktreeStatus),
}) {}

export class UpdateWorktreeInput extends Schema.Class<UpdateWorktreeInput>(
	"UpdateWorktreeInput",
)({
	status: Schema.optional(WorktreeStatus),
	/** ISO 8601 timestamp */
	lastAccessedAt: Schema.optional(Schema.String),
}) {}

// ─── Session ──────────────────────────────────────────────────

export class Session extends Schema.Class<Session>("Session")({
	id: Schema.String,
	worktreeId: Schema.String,
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	status: SessionStatus,
	/** Claude Code session ID for resume capability */
	claudeSessionId: Schema.NullOr(Schema.String),
	/** Model used for this session */
	model: Schema.NullOr(Schema.String),
	/** Total cost in USD */
	totalCostUsd: Schema.Number,
	/** Input tokens used */
	inputTokens: Schema.Number,
	/** Output tokens used */
	outputTokens: Schema.Number,
	/** ISO 8601 timestamp */
	createdAt: Schema.String,
	/** ISO 8601 timestamp */
	lastActivityAt: Schema.String,
}) {}

export class CreateSessionInput extends Schema.Class<CreateSessionInput>(
	"CreateSessionInput",
)({
	worktreeId: Schema.String,
	title: Schema.String,
	description: Schema.optional(Schema.NullOr(Schema.String)),
	status: Schema.optional(SessionStatus),
}) {}

export class UpdateSessionInput extends Schema.Class<UpdateSessionInput>(
	"UpdateSessionInput",
)({
	title: Schema.optional(Schema.String),
	description: Schema.optional(Schema.NullOr(Schema.String)),
	status: Schema.optional(SessionStatus),
	claudeSessionId: Schema.optional(Schema.NullOr(Schema.String)),
	model: Schema.optional(Schema.NullOr(Schema.String)),
	totalCostUsd: Schema.optional(Schema.Number),
	inputTokens: Schema.optional(Schema.Number),
	outputTokens: Schema.optional(Schema.Number),
	/** ISO 8601 timestamp */
	lastActivityAt: Schema.optional(Schema.String),
}) {}

// ─── Agent ────────────────────────────────────────────────────

export class Agent extends Schema.Class<Agent>("Agent")({
	id: Schema.String,
	sessionId: Schema.String,
	processId: Schema.NullOr(Schema.Number),
	status: AgentStatus,
	/** ISO 8601 timestamp */
	startedAt: Schema.String,
	/** ISO 8601 timestamp, null if agent is still running */
	stoppedAt: Schema.NullOr(Schema.String),
	exitCode: Schema.NullOr(Schema.Number),
}) {}

export class CreateAgentInput extends Schema.Class<CreateAgentInput>(
	"CreateAgentInput",
)({
	sessionId: Schema.String,
	processId: Schema.optional(Schema.NullOr(Schema.Number)),
	status: Schema.optional(AgentStatus),
}) {}

export class UpdateAgentInput extends Schema.Class<UpdateAgentInput>(
	"UpdateAgentInput",
)({
	processId: Schema.optional(Schema.NullOr(Schema.Number)),
	status: Schema.optional(AgentStatus),
	/** ISO 8601 timestamp */
	stoppedAt: Schema.optional(Schema.NullOr(Schema.String)),
	exitCode: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

// ─── Chat Message (AI SDK v6 Compatible) ─────────────────────

export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;

// ─── Message Part Types (AI SDK v6 Compatible) ───────────────

/**
 * Text part - simple text content
 */
export class TextPart extends Schema.Class<TextPart>("TextPart")({
	type: Schema.Literal("text"),
	text: Schema.String,
}) {}

/**
 * Tool call state - tracks the lifecycle of a tool invocation
 * Aligned with AI SDK v6 UIToolInvocation states
 */
export const ToolCallState = Schema.Literal(
	"partial",
	"input-available",
	"output-available",
	"error",
);
export type ToolCallState = typeof ToolCallState.Type;

/**
 * Tool call part - represents a tool invocation
 * Type is dynamic: `tool-${toolName}` (e.g., "tool-Read", "tool-Bash")
 * Field names aligned with AI SDK v6 UIToolInvocation
 */
export class ToolCallPart extends Schema.Class<ToolCallPart>("ToolCallPart")({
	type: Schema.String, // "tool-{toolName}" pattern
	toolCallId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
	state: ToolCallState,
	output: Schema.optional(Schema.Unknown),
}) {}

/**
 * Reasoning part - for Claude's thinking/reasoning output
 */
export class ReasoningPart extends Schema.Class<ReasoningPart>("ReasoningPart")(
	{
		type: Schema.Literal("reasoning"),
		reasoning: Schema.String,
	},
) {}

/**
 * AskUser question option
 */
export class AskUserQuestionOption extends Schema.Class<AskUserQuestionOption>(
	"AskUserQuestionOption",
)({
	label: Schema.String,
	description: Schema.String,
}) {}

/**
 * AskUser question item
 */
export class AskUserQuestionItem extends Schema.Class<AskUserQuestionItem>(
	"AskUserQuestionItem",
)({
	question: Schema.String,
	header: Schema.String,
	options: Schema.Array(AskUserQuestionOption),
	multiSelect: Schema.Boolean,
}) {}

/**
 * AskUser part - for interactive user questions
 * This is a custom extension to AI SDK for Claude's AskUserQuestion tool
 */
export class AskUserPart extends Schema.Class<AskUserPart>("AskUserPart")({
	type: Schema.Literal("ask-user"),
	toolCallId: Schema.String,
	questions: Schema.Array(AskUserQuestionItem),
	answers: Schema.optional(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
}) {}

/**
 * Union of all message part types
 */
export const MessagePart = Schema.Union(
	TextPart,
	ToolCallPart,
	ReasoningPart,
	AskUserPart,
);
export type MessagePart = typeof MessagePart.Type;

// ─── Chat Message ────────────────────────────────────────────

/**
 * Message metadata - optional extra info
 */
export const MessageMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type MessageMetadata = typeof MessageMetadata.Type;

/**
 * Chat message entity - AI SDK v6 UIMessage compatible
 *
 * Stores messages with a parts[] array, matching the AI SDK format.
 * Messages are ordered by createdAt timestamp.
 */
export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
	id: Schema.String,
	sessionId: Schema.String,
	role: MessageRole,
	/** Array of message parts (text, tool calls, reasoning, etc.) */
	parts: Schema.Array(MessagePart),
	/** ISO 8601 timestamp - used for ordering */
	createdAt: Schema.String,
	/** Optional metadata */
	metadata: Schema.optional(MessageMetadata),
}) {}

/**
 * Input for creating a new chat message
 */
export class CreateChatMessageInput extends Schema.Class<CreateChatMessageInput>(
	"CreateChatMessageInput",
)({
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	metadata: Schema.optional(MessageMetadata),
}) {}

// ─── Legacy Types (for migration reference) ──────────────────
// These are kept temporarily for reference during migration

/** @deprecated Use MessagePart instead */
export const MessageContentType = Schema.Literal(
	"text",
	"tool_use",
	"tool_result",
	"thinking",
	"error",
	"ask_user",
);
/** @deprecated Use MessagePart instead */
export type MessageContentType = typeof MessageContentType.Type;
