import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	type ChatStreamEvent,
	type FinishReason,
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
				events.push(
					new StreamEventStart({
						type: "start",
						messageId,
						claudeSessionId: message.session_id,
					}),
				);
			}
			break;

		case "assistant": {
			const result = processAssistantMessage(
				message as SDKAssistantMessage,
				newState,
				config,
			);
			events.push(...result.events);
			newState = result.newState;
			break;
		}

		case "user": {
			const result = processUserMessage(
				message as SDKUserMessage,
				newState,
				config,
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
						}
					: undefined;

			events.push(
				new StreamEventFinish({
					type: "finish",
					finishReason,
					metadata,
				}),
			);
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
): ProcessResult {
	const events: ChatStreamEvent[] = [];
	let newState = state;

	// If no message started yet, start one
	if (!newState.messageId) {
		newState = setMessageId(newState, message.uuid);
		events.push(
			new StreamEventStart({
				type: "start",
				messageId: message.uuid,
				claudeSessionId: newState.sessionId ?? undefined,
			}),
		);
	}

	// Process each content block
	for (const block of message.message.content) {
		if (block.type === "text" && "text" in block && block.text) {
			// For non-streaming mode, emit complete text as single delta
			const textId = config.generateId();
			events.push(new StreamEventTextStart({ type: "text-start", id: textId }));
			events.push(
				new StreamEventTextDelta({
					type: "text-delta",
					id: textId,
					delta: block.text,
				}),
			);
			events.push(new StreamEventTextEnd({ type: "text-end", id: textId }));
		} else if (
			block.type === "tool_use" &&
			"id" in block &&
			"name" in block &&
			"input" in block
		) {
			const toolInput = block.input as Record<string, unknown>;

			// Emit tool input events
			events.push(
				new StreamEventToolInputStart({
					type: "tool-input-start",
					toolCallId: block.id,
					toolName: block.name,
				}),
			);
			events.push(
				new StreamEventToolInputAvailable({
					type: "tool-input-available",
					toolCallId: block.id,
					toolName: block.name,
					input: toolInput,
				}),
			);

			// Track the tool call in state
			newState = registerToolCall(newState, block.id, block.name, toolInput);
		} else if (block.type === "thinking" && "thinking" in block) {
			// Emit reasoning events for thinking blocks
			const reasoningId = config.generateId();
			events.push(
				new StreamEventReasoningStart({
					type: "reasoning-start",
					id: reasoningId,
				}),
			);
			events.push(
				new StreamEventReasoningDelta({
					type: "reasoning-delta",
					id: reasoningId,
					delta: block.thinking,
				}),
			);
			events.push(
				new StreamEventReasoningEnd({ type: "reasoning-end", id: reasoningId }),
			);
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
				events.push(
					new StreamEventToolOutputError({
						type: "tool-output-error",
						toolCallId: block.tool_use_id,
						errorText,
					}),
				);
			} else {
				// Emit success event for completed tool execution
				events.push(
					new StreamEventToolOutputAvailable({
						type: "tool-output-available",
						toolCallId: block.tool_use_id,
						output: block.content,
					}),
				);
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
