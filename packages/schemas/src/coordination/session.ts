import { Schema } from "effect";
import { MessagePart } from "../chat/parts";
import { ChatStreamEvent } from "../chat/stream-events";
import { StreamingStatus } from "../primitives";

/** Message queued while session is streaming */
export const QueuedMessage = Schema.Struct({
	id: Schema.String,
	content: Schema.String,
	parts: Schema.optional(Schema.Array(MessagePart)),
	queuedAt: Schema.String,
	clientMessageId: Schema.optional(Schema.String),
});
export type QueuedMessage = typeof QueuedMessage.Type;

/** Cursor for tracking last persisted message (for gap detection) */
export const HistoryCursor = Schema.Struct({
	lastMessageId: Schema.NullOr(Schema.String),
	lastMessageAt: Schema.NullOr(Schema.String),
});
export type HistoryCursor = typeof HistoryCursor.Type;

/** Current session state snapshot */
export const SessionSnapshot = Schema.Struct({
	status: StreamingStatus,
	activeTurnId: Schema.NullOr(Schema.String),
	queue: Schema.Array(QueuedMessage),
	historyCursor: HistoryCursor,
});
export type SessionSnapshot = typeof SessionSnapshot.Type;

/** Turn context for late subscriber catch-up */
export const TurnContext = Schema.Struct({
	turnId: Schema.String,
	messageId: Schema.String,
	content: Schema.String,
	parts: Schema.optional(Schema.Array(MessagePart)),
	clientMessageId: Schema.String,
});
export type TurnContext = typeof TurnContext.Type;

/** Session events streamed to subscribers */
export const SessionEvent = Schema.Union(
	Schema.Struct({
		_tag: Schema.Literal("InitialState"),
		snapshot: SessionSnapshot,
		buffer: Schema.Array(ChatStreamEvent),
		turnContext: Schema.optional(TurnContext),
	}),
	Schema.Struct({
		_tag: Schema.Literal("SessionStarted"),
		turnId: Schema.String,
		messageId: Schema.String,
	}),
	Schema.Struct({
		_tag: Schema.Literal("SessionStopped"),
		turnId: Schema.String,
		reason: Schema.Literal("completed", "interrupted", "error"),
	}),
	Schema.Struct({
		_tag: Schema.Literal("StreamEvent"),
		turnId: Schema.String,
		event: ChatStreamEvent,
	}),
	Schema.Struct({
		_tag: Schema.Literal("MessageQueued"),
		message: QueuedMessage,
	}),
	Schema.Struct({
		_tag: Schema.Literal("MessageDequeued"),
		messageId: Schema.String,
	}),
	Schema.Struct({
		_tag: Schema.Literal("UserMessage"),
		message: Schema.Struct({
			id: Schema.String,
			content: Schema.String,
			parts: Schema.optional(Schema.Array(MessagePart)),
			clientMessageId: Schema.String,
		}),
	}),
	Schema.Struct({
		_tag: Schema.Literal("SessionDeleted"),
		sessionId: Schema.String,
	}),
);
export type SessionEvent = typeof SessionEvent.Type;
