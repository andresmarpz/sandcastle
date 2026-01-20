import type {
	Options,
	PermissionMode,
	SDKMessage,
	SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Effect, Stream } from "effect";
import type { ClaudeSDKError } from "./errors";

// Re-export SDK types unchanged for consumers
export type { Options, PermissionMode, SDKMessage, SDKResultMessage };

// Handle returned by query() - provides stream + control methods
export interface QueryHandle {
	readonly stream: Stream.Stream<SDKMessage, ClaudeSDKError>;
	readonly interrupt: Effect.Effect<void, ClaudeSDKError>;
	readonly setModel: (model: string) => Effect.Effect<void, ClaudeSDKError>;
	readonly setPermissionMode: (
		mode: PermissionMode,
	) => Effect.Effect<void, ClaudeSDKError>;
	readonly setMaxThinkingTokens: (
		tokens: number | null,
	) => Effect.Effect<void, ClaudeSDKError>;
}
