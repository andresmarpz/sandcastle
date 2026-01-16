import { Schema } from "effect";

export const TurnStatus = Schema.Literal(
	"streaming",
	"completed",
	"interrupted",
	"error",
);
export type TurnStatus = typeof TurnStatus.Type;

export class Turn extends Schema.Class<Turn>("Turn")({
	id: Schema.String,
	sessionId: Schema.String,
	status: TurnStatus,
	startedAt: Schema.String,
	completedAt: Schema.NullOr(Schema.String),
	reason: Schema.NullOr(Schema.String),
}) {}

export class CreateTurnInput extends Schema.Class<CreateTurnInput>(
	"CreateTurnInput",
)({
	sessionId: Schema.String,
}) {}
