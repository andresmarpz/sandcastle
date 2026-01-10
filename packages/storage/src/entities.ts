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

// ─── Chat Message ────────────────────────────────────────────

export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;

export const MessageContentType = Schema.Literal(
	"text",
	"tool_use",
	"tool_result",
	"thinking",
	"error",
	"ask_user",
);
export type MessageContentType = typeof MessageContentType.Type;

// Content type variants (stored as JSON in content column)
export class TextContent extends Schema.Class<TextContent>("TextContent")({
	type: Schema.Literal("text"),
	text: Schema.String,
}) {}

export class ToolUseContent extends Schema.Class<ToolUseContent>(
	"ToolUseContent",
)({
	type: Schema.Literal("tool_use"),
	toolUseId: Schema.String,
	toolName: Schema.String,
	input: Schema.Unknown,
}) {}

export class ToolResultContent extends Schema.Class<ToolResultContent>(
	"ToolResultContent",
)({
	type: Schema.Literal("tool_result"),
	toolUseId: Schema.String,
	toolName: Schema.String,
	output: Schema.Unknown,
	isError: Schema.optional(Schema.Boolean),
}) {}

export class ThinkingContent extends Schema.Class<ThinkingContent>(
	"ThinkingContent",
)({
	type: Schema.Literal("thinking"),
	text: Schema.String,
}) {}

export class ErrorContent extends Schema.Class<ErrorContent>("ErrorContent")({
	type: Schema.Literal("error"),
	error: Schema.String,
	code: Schema.optional(Schema.String),
}) {}

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

export class AskUserContent extends Schema.Class<AskUserContent>(
	"AskUserContent",
)({
	type: Schema.Literal("ask_user"),
	toolUseId: Schema.String,
	questions: Schema.Array(AskUserQuestionItem),
	answers: Schema.NullOr(
		Schema.Record({ key: Schema.String, value: Schema.String }),
	),
}) {}

export const MessageContent = Schema.Union(
	TextContent,
	ToolUseContent,
	ToolResultContent,
	ThinkingContent,
	ErrorContent,
	AskUserContent,
);
export type MessageContent = typeof MessageContent.Type;

export class ChatMessage extends Schema.Class<ChatMessage>("ChatMessage")({
	id: Schema.String,
	sessionId: Schema.String,
	sequenceNumber: Schema.Number,
	role: MessageRole,
	contentType: MessageContentType,
	content: MessageContent,
	parentToolUseId: Schema.NullOr(Schema.String),
	uuid: Schema.NullOr(Schema.String),
	/** ISO 8601 timestamp */
	createdAt: Schema.String,
}) {}

export class CreateChatMessageInput extends Schema.Class<CreateChatMessageInput>(
	"CreateChatMessageInput",
)({
	sessionId: Schema.String,
	role: MessageRole,
	contentType: MessageContentType,
	content: MessageContent,
	parentToolUseId: Schema.optional(Schema.NullOr(Schema.String)),
	uuid: Schema.optional(Schema.NullOr(Schema.String)),
}) {}
