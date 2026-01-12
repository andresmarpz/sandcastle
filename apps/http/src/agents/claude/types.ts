import type {
	SDKMessage,
	SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Effect, Stream } from "effect";
import type { ClaudeSDKError } from "./errors";

// Re-export SDK types unchanged for consumers
export type { SDKMessage, SDKResultMessage };

// Permission modes supported by the SDK
export type PermissionMode =
	| "default"
	| "acceptEdits"
	| "bypassPermissions"
	| "plan";

// Common options we type explicitly
export interface QueryOptions {
	readonly cwd: string;
	readonly abortController?: AbortController;
	readonly resume?: string;
	readonly model?: string;
	readonly systemPrompt?:
		| string
		| { type: "preset"; preset: "claude_code"; append?: string };
	readonly permissionMode?: PermissionMode;
	readonly maxTurns?: number;
	readonly maxBudgetUsd?: number;
	readonly includePartialMessages?: boolean;
	readonly allowDangerouslySkipPermissions?: boolean;
	// Escape hatch for advanced options not explicitly typed
	readonly rawOptions?: Record<string, unknown>;
}

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
