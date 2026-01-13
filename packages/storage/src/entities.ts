import { Schema } from "effect";

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

export class Repository extends Schema.Class<Repository>("Repository")({
	id: Schema.String,
	label: Schema.String,
	directoryPath: Schema.String,
	defaultBranch: Schema.String,
	pinned: Schema.Boolean,
	createdAt: Schema.String,
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

export class Worktree extends Schema.Class<Worktree>("Worktree")({
	id: Schema.String,
	repositoryId: Schema.String,
	path: Schema.String,
	branch: Schema.String,
	name: Schema.String,
	baseBranch: Schema.String,
	status: WorktreeStatus,
	createdAt: Schema.String,
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
	lastAccessedAt: Schema.optional(Schema.String),
}) {}

export class Session extends Schema.Class<Session>("Session")({
	id: Schema.String,
	worktreeId: Schema.String,
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	status: SessionStatus,
	claudeSessionId: Schema.NullOr(Schema.String),
	model: Schema.NullOr(Schema.String),
	totalCostUsd: Schema.Number,
	inputTokens: Schema.Number,
	outputTokens: Schema.Number,
	createdAt: Schema.String,
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
	lastActivityAt: Schema.optional(Schema.String),
}) {}

export class Agent extends Schema.Class<Agent>("Agent")({
	id: Schema.String,
	sessionId: Schema.String,
	processId: Schema.NullOr(Schema.Number),
	status: AgentStatus,
	startedAt: Schema.String,
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
	stoppedAt: Schema.optional(Schema.NullOr(Schema.String)),
	exitCode: Schema.optional(Schema.NullOr(Schema.Number)),
}) {}

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
