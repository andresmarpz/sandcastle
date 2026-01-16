import { Schema } from "effect";

/** Provider-specific metadata (AI SDK v6 compatible) */
export const ProviderMetadata = Schema.Record({
	key: Schema.String,
	value: Schema.Unknown,
});
export type ProviderMetadata = typeof ProviderMetadata.Type;

/** Streaming state for text/reasoning parts (part-level) */
export const StreamingState = Schema.Literal("streaming", "done");
export type StreamingState = typeof StreamingState.Type;

/** Streaming status for session coordination (session-level) */
export const StreamingStatus = Schema.Literal("idle", "streaming");
export type StreamingStatus = typeof StreamingStatus.Type;

/** Finish reason for chat completion (AI SDK v6 compatible) */
export const FinishReason = Schema.Literal(
	"stop",
	"error",
	"length",
	"tool-calls",
	"content-filter",
	"other",
);
export type FinishReason = typeof FinishReason.Type;

/** Message role (AI SDK v6 compatible) */
export const MessageRole = Schema.Literal("user", "assistant", "system");
export type MessageRole = typeof MessageRole.Type;
