import { Schema } from "effect";

export const SessionStatus = Schema.Literal(
	"created",
	"active",
	"paused",
	"completed",
	"failed",
);
export type SessionStatus = typeof SessionStatus.Type;

export class Session extends Schema.Class<Session>("Session")({
	id: Schema.String,
	worktreeId: Schema.NullOr(Schema.String),
	workingPath: Schema.String,
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
	worktreeId: Schema.optional(Schema.NullOr(Schema.String)),
	workingPath: Schema.String,
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
