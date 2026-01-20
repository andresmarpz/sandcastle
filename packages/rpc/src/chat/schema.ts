import { Rpc, RpcGroup, RpcSchema } from "@effect/rpc";
import {
	ChatMessage,
	MessagePart,
	QueuedMessage,
	SessionEvent,
	SessionSnapshot,
} from "@sandcastle/schemas";
import { Schema } from "effect";

import { ChatOperationRpcError, ChatSessionNotFoundRpcError } from "./errors";

/** Result of sending a message */
export class SendMessageResult extends Schema.Class<SendMessageResult>(
	"SendMessageResult",
)({
	status: Schema.Literal("started", "queued"),
	messageId: Schema.optional(Schema.String),
	queuedMessage: Schema.optional(QueuedMessage),
}) {}

/** Result of interrupt request */
export class InterruptResult extends Schema.Class<InterruptResult>(
	"InterruptResult",
)({
	interrupted: Schema.Boolean,
}) {}

/** Result of dequeue request */
export class DequeueResult extends Schema.Class<DequeueResult>("DequeueResult")(
	{
		removed: Schema.Boolean,
	},
) {}

/** Result of get history request */
export class GetHistoryResult extends Schema.Class<GetHistoryResult>(
	"GetHistoryResult",
)({
	messages: Schema.Array(ChatMessage),
}) {}

export class ChatRpc extends RpcGroup.make(
	/**
	 * Subscribe to session events (streaming)
	 * Returns a stream of SessionEvent for real-time updates.
	 * First event is always InitialState with current snapshot and buffer.
	 */
	Rpc.make("chat.subscribe", {
		payload: {
			sessionId: Schema.String,
		},
		success: RpcSchema.Stream({
			success: SessionEvent,
			failure: Schema.Never,
		}),
		error: ChatSessionNotFoundRpcError,
	}),

	/**
	 * Send a message to a session.
	 * If session is idle, starts streaming immediately (status: "started").
	 * If session is streaming, queues the message (status: "queued").
	 */
	Rpc.make("chat.send", {
		payload: {
			sessionId: Schema.String,
			content: Schema.String,
			parts: Schema.optional(Schema.Array(MessagePart)),
			clientMessageId: Schema.String,
			mode: Schema.optional(Schema.Literal("plan", "build")),
		},
		success: SendMessageResult,
		error: Schema.Union(ChatSessionNotFoundRpcError, ChatOperationRpcError),
	}),

	/**
	 * Interrupt a streaming session.
	 * Returns { interrupted: true } if session was streaming and is now stopped.
	 * Returns { interrupted: false } if session was already idle.
	 */
	Rpc.make("chat.interrupt", {
		payload: {
			sessionId: Schema.String,
		},
		success: InterruptResult,
		error: ChatSessionNotFoundRpcError,
	}),

	/**
	 * Remove a message from the queue.
	 * Returns { removed: true } if message was found and removed.
	 * Returns { removed: false } if message was not in queue.
	 */
	Rpc.make("chat.dequeue", {
		payload: {
			sessionId: Schema.String,
			messageId: Schema.String,
		},
		success: DequeueResult,
		error: ChatSessionNotFoundRpcError,
	}),

	/**
	 * Get current session state (non-streaming).
	 * Use this for initial page load before subscribing.
	 */
	Rpc.make("chat.getState", {
		payload: {
			sessionId: Schema.String,
		},
		success: SessionSnapshot,
		error: ChatSessionNotFoundRpcError,
	}),

	/**
	 * Get message history for a session.
	 * Supports cursor-based pagination with afterMessageId.
	 * Returns messages ordered by created_at ascending.
	 */
	Rpc.make("chat.getHistory", {
		payload: {
			sessionId: Schema.String,
			afterMessageId: Schema.optional(Schema.String),
			limit: Schema.optional(Schema.Number),
		},
		success: GetHistoryResult,
		error: ChatSessionNotFoundRpcError,
	}),
) {}
