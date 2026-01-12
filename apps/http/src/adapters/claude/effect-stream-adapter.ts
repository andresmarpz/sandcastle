import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	ChatRpcError,
	type ChatStreamEvent,
	StreamEventAskUser,
	StreamEventError,
	StreamEventFinish,
	StreamEventStart,
	StreamEventTextDelta,
	StreamEventTextEnd,
	StreamEventTextStart,
	StreamEventToolInputAvailable,
	StreamEventToolInputStart,
	StreamEventToolOutputAvailable,
} from "@sandcastle/rpc";
import {
	AskUserQuestionItem,
	AskUserQuestionOption,
} from "@sandcastle/storage/entities";
import { Chunk, Effect, Stream } from "effect";
import type { ClaudeSDKError } from "../../agents/claude";
import {
	completeToolCall,
	createStreamState,
	registerToolCall,
	setMessageId,
	setSessionId,
} from "./state-tracker";
import { mapFinishReason } from "./transformer";
import type { AdapterConfig, StreamState } from "./types";

/**
 * Transform a Claude SDK Effect Stream to a stream of ChatStreamEvents
 * suitable for RPC streaming.
 */
export function adaptSDKStreamToEvents(
	sdkStream: Stream.Stream<SDKMessage, ClaudeSDKError>,
	config: AdapterConfig,
): Stream.Stream<ChatStreamEvent, ChatRpcError> {
	return Stream.suspend(() => {
		let state = createStreamState();

		return sdkStream.pipe(
			Stream.mapConcatEffect((message) =>
				Effect.sync(() => {
					const result = processMessage(message, state, config);
					state = result.newState;
					return Chunk.fromIterable(result.events);
				}),
			),
			Stream.mapError(
				(error) =>
					new ChatRpcError({
						message: error.message,
						code: "CLAUDE_SDK_ERROR",
					}),
			),
			// On error, emit error event before failing
			Stream.catchAll((error) =>
				Stream.make(
					new StreamEventError({ type: "error", errorText: error.message }),
					new StreamEventFinish({ type: "finish", finishReason: "error" }),
				),
			),
		);
	});
}

interface ProcessResult {
	events: ChatStreamEvent[];
	newState: StreamState;
}

/**
 * Process a single SDK message and return ChatStreamEvents
 */
function processMessage(
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

			// Check if this is an AskUserQuestion tool
			if (block.name === "AskUserQuestion") {
				const askInput = toolInput as {
					questions?: Array<{
						question: string;
						header: string;
						options: Array<{ label: string; description: string }>;
						multiSelect: boolean;
					}>;
				};

				if (askInput.questions) {
					events.push(
						new StreamEventAskUser({
							type: "ask-user",
							toolCallId: block.id,
							questions: askInput.questions.map(
								(q) =>
									new AskUserQuestionItem({
										question: q.question,
										header: q.header,
										options: q.options.map(
											(o) =>
												new AskUserQuestionOption({
													label: o.label,
													description: o.description,
												}),
										),
										multiSelect: q.multiSelect,
									}),
							),
						}),
					);
				}
			}

			// Track the tool call in state
			newState = registerToolCall(newState, block.id, block.name, toolInput);
		}
		// Skip thinking blocks for MVP
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
			events.push(
				new StreamEventToolOutputAvailable({
					type: "tool-output-available",
					toolCallId: block.tool_use_id,
					output: block.content,
				}),
			);

			// Update state with tool result
			const isError = "is_error" in block ? (block.is_error ?? false) : false;
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
