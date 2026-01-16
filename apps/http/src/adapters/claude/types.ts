import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { FinishReason } from "@sandcastle/schemas";

export type { SDKMessage };

export interface TextContentBlock {
	type: "text";
	text: string;
}

export interface ToolUseContentBlock {
	type: "tool_use";
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
	type: "tool_result";
	tool_use_id: string;
	content: string | Array<{ type: string; [key: string]: unknown }>;
	is_error?: boolean;
}

export interface ThinkingContentBlock {
	type: "thinking";
	thinking: string;
}

export type ContentBlock =
	| TextContentBlock
	| ToolUseContentBlock
	| ToolResultContentBlock
	| ThinkingContentBlock;

/** Tracks state of tool calls across messages (AI SDK v6 compatible) */
export interface ToolCallState {
	toolCallId: string;
	toolName: string;
	input?: Record<string, unknown>;
	output?: unknown;
	isError?: boolean;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
}

/** Tracks current streaming state */
export interface StreamState {
	messageId: string | null;
	currentTextId: string | null;
	toolCalls: Map<string, ToolCallState>;
	sessionId: string | null;
}

export type { FinishReason };
