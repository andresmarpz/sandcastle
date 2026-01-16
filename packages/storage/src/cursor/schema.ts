import { Schema } from "effect";

export class SessionCursor extends Schema.Class<SessionCursor>("SessionCursor")(
	{
		sessionId: Schema.String,
		lastMessageId: Schema.NullOr(Schema.String),
		lastMessageAt: Schema.NullOr(Schema.String),
		updatedAt: Schema.String,
	},
) {}
