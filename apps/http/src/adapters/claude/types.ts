import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Re-export SDK types for convenience
export type { SDKMessage };

// ─── Claude SDK V1 Content Block Types ────────────────────────
// These map to the content blocks inside SDKAssistantMessage/SDKUserMessage

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

// ─── AI SDK V6 Part Types ─────────────────────────────────────

export interface TextUIPart {
	type: "text";
	text: string;
}

export interface ToolCallUIPart {
	type: `tool-${string}`;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	state: "partial" | "result" | "error";
	result?: unknown;
}

export type UIMessagePart = TextUIPart | ToolCallUIPart;

// ─── AI SDK V6 Message Types ──────────────────────────────────

export interface UIMessage {
	id: string;
	role: "user" | "assistant" | "system";
	parts: UIMessagePart[];
	createdAt?: Date;
	metadata?: Record<string, unknown>;
}

// ─── AI SDK V6 Stream Event Types ─────────────────────────────

export type UIMessageChunk =
	| { type: "start"; messageId: string }
	| { type: "text-start"; id: string }
	| { type: "text-delta"; id: string; delta: string }
	| { type: "text-end"; id: string }
	| { type: "tool-input-start"; toolCallId: string; toolName: string }
	| {
			type: "tool-input-available";
			toolCallId: string;
			toolName: string;
			input: Record<string, unknown>;
	  }
	| { type: "tool-output-available"; toolCallId: string; output: unknown }
	| {
			type: "finish";
			finishReason: FinishReason;
	  }
	| { type: "error"; errorText: string };

export type FinishReason = "stop" | "error" | "length" | "tool-calls" | "other";

// ─── Adapter Configuration ────────────────────────────────────

export interface AdapterConfig {
	/** Generate unique IDs for messages and parts */
	generateId: () => string;
}

// ─── Stream State ─────────────────────────────────────────────

/** Tracks state of tool calls across messages */
export interface ToolCallState {
	toolCallId: string;
	toolName: string;
	input?: Record<string, unknown>;
	output?: unknown;
	isError?: boolean;
	state: "partial" | "input-available" | "result" | "error";
}

/** Tracks current streaming state */
export interface StreamState {
	messageId: string | null;
	currentTextId: string | null;
	toolCalls: Map<string, ToolCallState>;
	sessionId: string | null;
}
