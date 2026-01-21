import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ChatStreamEvent,
	FinishReason,
	StreamEventFinish,
	StreamEventReasoningDelta,
	StreamEventReasoningEnd,
	StreamEventReasoningStart,
	StreamEventStart,
	StreamEventTextDelta,
	StreamEventTextEnd,
	StreamEventTextStart,
	StreamEventToolInputAvailable,
	StreamEventToolInputStart,
	StreamEventToolOutputAvailable,
	StreamEventToolOutputError,
} from "@sandcastle/schemas";
import type { AdapterConfig } from "../types";
import {
	completeToolCall,
	getToolCall,
	registerToolCall,
	setMessageId,
	setSessionId,
} from "./state-tracker";
import type { StreamState } from "./types";

interface ProcessResult {
	events: ChatStreamEvent[];
	newState: StreamState;
}

/**
 * Extract the context window size from modelUsage.
 * Returns the maximum context window across all models used.
 */
function extractContextWindow(
	modelUsage: Record<string, { contextWindow?: number }> | undefined,
): number | undefined {
	if (!modelUsage) return undefined;
	const contextWindows = Object.values(modelUsage)
		.map((usage) => usage.contextWindow)
		.filter((cw): cw is number => typeof cw === "number");
	return contextWindows.length > 0 ? Math.max(...contextWindows) : undefined;
}

/**
 * Check if a tool name is ExitPlanMode (direct or MCP-prefixed)
 */
function isExitPlanModeTool(toolName: string): boolean {
	return (
		toolName === "ExitPlanMode" ||
		toolName === "mcp__plan-mode-ui__ExitPlanMode"
	);
}

/**
 * Parse ExitPlanMode output to extract approval status and feedback.
 * Returns undefined if the output doesn't match expected patterns.
 */
function parseExitPlanModeOutput(output: unknown):
	| {
			approved: boolean;
			feedback?: string;
	  }
	| undefined {
	// Extract text content from output
	let text: string | undefined;

	if (typeof output === "string") {
		text = output;
	} else if (Array.isArray(output)) {
		// Handle array format: [{ type: "text", text: "..." }]
		const textBlock = output.find(
			(block) =>
				typeof block === "object" &&
				block !== null &&
				"type" in block &&
				block.type === "text",
		);
		if (
			textBlock &&
			"text" in textBlock &&
			typeof textBlock.text === "string"
		) {
			text = textBlock.text;
		}
	}

	if (!text) return undefined;

	// Check for approval pattern
	if (text.includes("Plan approved")) {
		return { approved: true };
	}

	// Check for rejection pattern
	if (text.includes("Plan rejected")) {
		// Extract feedback if present (format: "Plan rejected. User feedback: ...")
		const feedbackMatch = text.match(/User feedback:\s*(.+)$/);
		return {
			approved: false,
			feedback: feedbackMatch?.[1]?.trim() || undefined,
		};
	}

	return undefined;
}

/**
 * Process a single SDK message and return ChatStreamEvents
 */
export function processMessage(
	message: SDKMessage,
	state: StreamState,
	config: AdapterConfig,
): ProcessResult {
	const events: ChatStreamEvent[] = [];
	let newState = state;

	switch (message.type) {
		case "system":
			if (message.subtype === "init") {
				// Store session ID and emit start event
				newState = setSessionId(newState, message.session_id);
				const messageId = config.generateId();
				newState = setMessageId(newState, messageId);
				events.push({
					type: "start",
					messageId,
					claudeSessionId: message.session_id,
				} satisfies StreamEventStart);
			}
			break;

		case "assistant": {
			const assistantMsg = message as SDKAssistantMessage;
			const parentToolUseId =
				"parent_tool_use_id" in message
					? (message.parent_tool_use_id as string | null | undefined)
					: undefined;
			const result = processAssistantMessage(
				assistantMsg,
				newState,
				config,
				parentToolUseId,
			);
			events.push(...result.events);
			newState = result.newState;
			break;
		}

		case "user": {
			const userMsg = message as SDKUserMessage;
			const parentToolUseId =
				"parent_tool_use_id" in message
					? (message.parent_tool_use_id as string | null | undefined)
					: undefined;
			const result = processUserMessage(
				userMsg,
				newState,
				config,
				parentToolUseId,
			);
			events.push(...result.events);
			newState = result.newState;
			break;
		}

		case "result": {
			const resultMsg = message as SDKResultMessage;
			const finishReason = mapFinishReason(resultMsg.subtype);

			// Extract metadata from result message
			const metadata =
				resultMsg.subtype === "success"
					? {
							claudeSessionId: resultMsg.session_id,
							costUsd: resultMsg.total_cost_usd,
							inputTokens: resultMsg.usage?.input_tokens,
							outputTokens: resultMsg.usage?.output_tokens,
							cacheReadInputTokens: resultMsg.usage?.cache_read_input_tokens,
							cacheCreationInputTokens:
								resultMsg.usage?.cache_creation_input_tokens,
							contextWindow: extractContextWindow(resultMsg.modelUsage),
						}
					: undefined;

			events.push({
				type: "finish",
				finishReason,
				metadata,
			} satisfies StreamEventFinish);
			break;
		}

		// Skip stream_event (partial messages) and compact_boundary for MVP
	}

	return { events, newState };
}

/**
 * Process assistant message and emit text/tool events
 */
function processAssistantMessage(
	message: SDKAssistantMessage,
	state: StreamState,
	config: AdapterConfig,
	parentToolUseId?: string | null,
): ProcessResult {
	const events: ChatStreamEvent[] = [];
	let newState = state;

	// If no message started yet, start one
	if (!newState.messageId) {
		newState = setMessageId(newState, message.uuid);
		events.push({
			type: "start",
			messageId: message.uuid,
			claudeSessionId: newState.sessionId ?? undefined,
		} satisfies StreamEventStart);
	}

	// Process each content block
	for (const block of message.message.content) {
		if (block.type === "text" && "text" in block && block.text) {
			// For non-streaming mode, emit complete text as single delta
			const textId = config.generateId();
			events.push({
				type: "text-start",
				id: textId,
			} satisfies StreamEventTextStart);
			events.push({
				type: "text-delta",
				id: textId,
				delta: block.text,
			} satisfies StreamEventTextDelta);
			events.push({
				type: "text-end",
				id: textId,
			} satisfies StreamEventTextEnd);
		} else if (
			block.type === "tool_use" &&
			"id" in block &&
			"name" in block &&
			"input" in block
		) {
			const toolInput = block.input as Record<string, unknown>;

			// Emit tool input events with parentToolCallId
			events.push({
				type: "tool-input-start",
				toolCallId: block.id,
				toolName: block.name,
				parentToolCallId: parentToolUseId ?? null,
			} satisfies StreamEventToolInputStart);
			events.push({
				type: "tool-input-available",
				toolCallId: block.id,
				toolName: block.name,
				input: toolInput,
				parentToolCallId: parentToolUseId ?? null,
			} satisfies StreamEventToolInputAvailable);

			// Track the tool call in state
			newState = registerToolCall(newState, block.id, block.name, toolInput);
		} else if (block.type === "thinking" && "thinking" in block) {
			// Emit reasoning events for thinking blocks
			const reasoningId = config.generateId();
			events.push({
				type: "reasoning-start",
				id: reasoningId,
			} satisfies StreamEventReasoningStart);
			events.push({
				type: "reasoning-delta",
				id: reasoningId,
				delta: block.thinking,
			} satisfies StreamEventReasoningDelta);
			events.push({
				type: "reasoning-end",
				id: reasoningId,
			} satisfies StreamEventReasoningEnd);
		}
	}

	return { events, newState };
}

/**
 * Process user message (primarily for tool results)
 */
function processUserMessage(
	message: SDKUserMessage,
	state: StreamState,
	_config: AdapterConfig,
	parentToolUseId?: string | null,
): ProcessResult {
	const events: ChatStreamEvent[] = [];
	let newState = state;

	// User message content can be string or array of content blocks
	const content = message.message.content;
	if (typeof content === "string") {
		// Simple string content - nothing to process for tool results
		return { events, newState };
	}

	// Process tool results from content array
	for (const block of content) {
		if (
			block.type === "tool_result" &&
			"tool_use_id" in block &&
			"content" in block
		) {
			const isError = "is_error" in block ? (block.is_error ?? false) : false;

			if (isError) {
				// Emit error event for failed tool execution
				const errorText =
					typeof block.content === "string"
						? block.content
						: JSON.stringify(block.content);
				events.push({
					type: "tool-output-error",
					toolCallId: block.tool_use_id,
					errorText,
					parentToolCallId: parentToolUseId ?? null,
				} satisfies StreamEventToolOutputError);
			} else {
				// Emit success event for completed tool execution
				// Check if this is an ExitPlanMode tool and extract approval info
				const toolCall = getToolCall(state, block.tool_use_id);
				const approvalInfo =
					toolCall && isExitPlanModeTool(toolCall.toolName)
						? parseExitPlanModeOutput(block.content)
						: undefined;

				events.push({
					type: "tool-output-available",
					toolCallId: block.tool_use_id,
					output: block.content,
					parentToolCallId: parentToolUseId ?? null,
					...(approvalInfo && {
						approved: approvalInfo.approved,
						...(approvalInfo.feedback && { feedback: approvalInfo.feedback }),
					}),
				} satisfies StreamEventToolOutputAvailable);
			}

			// Update state with tool result
			newState = completeToolCall(
				newState,
				block.tool_use_id,
				block.content,
				isError,
			);
		}
	}

	return { events, newState };
}

/**
 * Map SDK result subtype to AI SDK finish reason
 */
export function mapFinishReason(subtype: string): FinishReason {
	switch (subtype) {
		case "success":
			return "stop";
		case "error_max_turns":
		case "error_max_budget_usd":
			return "length";
		case "error_during_execution":
		case "error_max_structured_output_retries":
			return "error";
		default:
			return "other";
	}
}
