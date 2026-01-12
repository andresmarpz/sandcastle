import type { StreamState, ToolCallState } from "./types";

/**
 * Creates a new stream state tracker
 */
export function createStreamState(): StreamState {
	return {
		messageId: null,
		currentTextId: null,
		toolCalls: new Map(),
		sessionId: null,
	};
}

/**
 * Set the session ID
 */
export function setSessionId(
	state: StreamState,
	sessionId: string,
): StreamState {
	return { ...state, sessionId };
}

/**
 * Set the current message ID
 */
export function setMessageId(
	state: StreamState,
	messageId: string,
): StreamState {
	return { ...state, messageId };
}

/**
 * Register a tool call when tool_use is encountered
 */
export function registerToolCall(
	state: StreamState,
	toolCallId: string,
	toolName: string,
	input?: Record<string, unknown>,
): StreamState {
	const toolCall: ToolCallState = {
		toolCallId,
		toolName,
		input,
		state: input ? "input-available" : "partial",
	};

	const newToolCalls = new Map(state.toolCalls);
	newToolCalls.set(toolCallId, toolCall);

	return { ...state, toolCalls: newToolCalls };
}

/**
 * Update tool call when tool_result arrives
 */
export function completeToolCall(
	state: StreamState,
	toolUseId: string,
	output: unknown,
	isError = false,
): StreamState {
	const existing = state.toolCalls.get(toolUseId);
	if (!existing) return state;

	const updated: ToolCallState = {
		...existing,
		output,
		isError,
		state: isError ? "error" : "result",
	};

	const newToolCalls = new Map(state.toolCalls);
	newToolCalls.set(toolUseId, updated);

	return { ...state, toolCalls: newToolCalls };
}

/**
 * Get a tool call by ID
 */
export function getToolCall(
	state: StreamState,
	toolCallId: string,
): ToolCallState | undefined {
	return state.toolCalls.get(toolCallId);
}
