import { Schema } from "effect";
import { MessageRole } from "../primitives";
import { MessagePart } from "./parts";

/** Message metadata (AI SDK v6 compatible) */
export const MessageMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type MessageMetadata = typeof MessageMetadata.Type;

/** Chat message (AI SDK v6: UIMessage) */
export const ChatMessage = Schema.Struct({
	id: Schema.String,
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	createdAt: Schema.String,
	metadata: Schema.optional(MessageMetadata),
});
export type ChatMessage = typeof ChatMessage.Type;

/** Input for creating a new chat message */
export const CreateChatMessageInput = Schema.Struct({
	id: Schema.optional(Schema.String),
	sessionId: Schema.String,
	role: MessageRole,
	parts: Schema.Array(MessagePart),
	metadata: Schema.optional(MessageMetadata),
});
export type CreateChatMessageInput = typeof CreateChatMessageInput.Type;
