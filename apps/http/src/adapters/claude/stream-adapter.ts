import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { Effect, Stream } from "effect";
import { StreamTransformError } from "./errors";
import {
	completeToolCall,
	createStreamState,
	registerToolCall,
	setMessageId,
	setSessionId,
} from "./state-tracker";
import { mapFinishReason } from "./transformer";
import type { AdapterConfig, StreamState, UIMessageChunk } from "./types";

/**
 * Create a Claude-to-AI-SDK adapter
 */
export function createClaudeToAISDKAdapter(config: AdapterConfig) {
	return {
		/**
		 * Transform an Effect Stream of SDK messages to ReadableStream<UIMessageChunk>
		 *
		 * This is designed to work with the AI SDK's useChat hook transport protocol.
		 */
		adaptStream(
			sdkStream: Stream.Stream<SDKMessage, unknown>,
		): ReadableStream<UIMessageChunk> {
			let state = createStreamState();

			return new ReadableStream<UIMessageChunk>({
				async start(controller) {
					const program = sdkStream.pipe(
						Stream.runForEach((message) =>
							Effect.sync(() => {
								const result = processMessage(message, state, config);
								state = result.newState;

								for (const chunk of result.chunks) {
									controller.enqueue(chunk);
								}
							}),
						),
						Effect.catchAll((error) =>
							Effect.sync(() => {
								controller.enqueue({
									type: "error",
									errorText:
										error instanceof Error ? error.message : String(error),
								});
								controller.enqueue({ type: "finish", finishReason: "error" });
							}),
						),
					);

					await Effect.runPromise(program);
					controller.close();
				},
			});
		},
	};
}

interface ProcessResult {
	chunks: UIMessageChunk[];
	newState: StreamState;
}

/**
 * Process a single SDK message and return UI message chunks
 */
function processMessage(
	message: SDKMessage,
	state: StreamState,
	config: AdapterConfig,
): ProcessResult {
	const chunks: UIMessageChunk[] = [];
	let newState = state;

	switch (message.type) {
		case "system":
			if (message.subtype === "init") {
				// Store session ID and emit start event
				newState = setSessionId(newState, message.session_id);
				const messageId = config.generateId();
				newState = setMessageId(newState, messageId);
				chunks.push({
					type: "start",
					messageId,
				});
			}
			break;

		case "assistant": {
			const result = processAssistantMessage(message, newState, config);
			chunks.push(...result.chunks);
			newState = result.newState;
			break;
		}

		case "user": {
			const result = processUserMessage(message, newState);
			chunks.push(...result.chunks);
			newState = result.newState;
			break;
		}

		case "result": {
			chunks.push({
				type: "finish",
				finishReason: mapFinishReason(message.subtype),
			});
			break;
		}

		// Skip stream_event for MVP (non-streaming mode)
		// Skip compact_boundary messages
	}

	return { chunks, newState };
}

/**
 * Process assistant message and emit text/tool events
 */
function processAssistantMessage(
	message: SDKAssistantMessage,
	state: StreamState,
	config: AdapterConfig,
): ProcessResult {
	const chunks: UIMessageChunk[] = [];
	let newState = state;

	// If no message started yet, start one
	if (!newState.messageId) {
		newState = setMessageId(newState, message.uuid);
		chunks.push({
			type: "start",
			messageId: message.uuid,
		});
	}

	// Process each content block
	// The SDK uses BetaContentBlock[] which includes various types
	for (const block of message.message.content) {
		if (block.type === "text" && "text" in block && block.text) {
			// For non-streaming mode, emit complete text as single delta
			const textId = config.generateId();
			chunks.push({ type: "text-start", id: textId });
			chunks.push({ type: "text-delta", id: textId, delta: block.text });
			chunks.push({ type: "text-end", id: textId });
		} else if (
			block.type === "tool_use" &&
			"id" in block &&
			"name" in block &&
			"input" in block
		) {
			// Emit tool input events
			chunks.push({
				type: "tool-input-start",
				toolCallId: block.id,
				toolName: block.name,
			});
			chunks.push({
				type: "tool-input-available",
				toolCallId: block.id,
				toolName: block.name,
				input: block.input as Record<string, unknown>,
			});

			// Track the tool call in state
			newState = registerToolCall(
				newState,
				block.id,
				block.name,
				block.input as Record<string, unknown>,
			);
		}
		// Skip thinking blocks for MVP
	}

	return { chunks, newState };
}

/**
 * Process user message (primarily for tool results)
 */
function processUserMessage(
	message: SDKUserMessage,
	state: StreamState,
): ProcessResult {
	const chunks: UIMessageChunk[] = [];
	let newState = state;

	// User message content can be string or array of content blocks
	const content = message.message.content;
	if (typeof content === "string") {
		// Simple string content - nothing to process for tool results
		return { chunks, newState };
	}

	// Process tool results from content array
	for (const block of content) {
		if (
			block.type === "tool_result" &&
			"tool_use_id" in block &&
			"content" in block
		) {
			chunks.push({
				type: "tool-output-available",
				toolCallId: block.tool_use_id,
				output: block.content,
			});

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

	return { chunks, newState };
}

/**
 * Type guard for checking if adapter error
 */
export function isAdapterError(error: unknown): error is StreamTransformError {
	return error instanceof StreamTransformError;
}
