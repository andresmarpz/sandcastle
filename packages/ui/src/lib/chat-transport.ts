/**
 * RPC Chat Transport for AI SDK
 *
 * Bridges Effect RPC streaming with the Vercel AI SDK's useChat hook.
 * This transport subscribes to the RPC stream and converts SessionEvent/ChatStreamEvent
 * into UIMessageChunk format that useChat understands.
 *
 * @example
 * ```ts
 * import { useChat } from "@ai-sdk/react"
 * import { RpcChatTransport } from "@/lib/chat-transport"
 *
 * const transport = new RpcChatTransport(sessionId)
 * const { messages, sendMessage, stop } = useChat({ transport })
 * ```
 */

import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { Effect, Stream } from "effect";

import type {
	ChatStreamEvent,
	SessionEvent,
	MessagePart,
	SessionSnapshot,
} from "@sandcastle/schemas";
import type { SendMessageResult } from "@sandcastle/rpc";

import {
	runWithStreamingClient,
	StreamingChatClient,
} from "./rpc-websocket-client";
import { subscriptionManager } from "./subscription-manager";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for sendMessages and reconnectToStream methods.
 * Matches the AI SDK ChatTransport interface requirements.
 */
interface ChatRequestOptions {
	headers?: Record<string, string> | Headers;
	body?: object;
	metadata?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transport Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RPC-based ChatTransport implementation.
 *
 * This transport:
 * 1. Sends messages via the chat.send RPC
 * 2. Subscribes to chat.subscribe for streaming events
 * 3. Converts SessionEvent/ChatStreamEvent to UIMessageChunk
 * 4. Handles mid-stream catch-up via InitialState buffer
 * 5. Manages abort signals to interrupt streams
 */
export class RpcChatTransport implements ChatTransport<UIMessage> {
	private sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	/**
	 * Sends messages to the chat session and returns a streaming response.
	 *
	 * This method:
	 * 1. Extracts content from the last message
	 * 2. Calls chat.send RPC to submit the message
	 * 3. Subscribes to chat.subscribe for streaming events
	 * 4. Converts the Effect Stream to ReadableStream<UIMessageChunk>
	 */
	async sendMessages({
		messages,
		abortSignal,
	}: {
		trigger: "submit-message" | "regenerate-message";
		chatId: string;
		messageId: string | undefined;
		messages: UIMessage[];
		abortSignal: AbortSignal | undefined;
	} & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
		// Extract content from the last message
		const lastMessage = messages[messages.length - 1];
		if (!lastMessage) {
			throw new Error("No messages to send");
		}

		const content = lastMessage.parts
			.filter(
				(p): p is { type: "text"; text: string } =>
					p.type === "text" && "text" in p
			)
			.map((p) => p.text)
			.join("");

		// Register with subscription manager and get abort controller
		subscriptionManager.visit(this.sessionId);

		// Capture for use in Effect generator
		const sessionId = this.sessionId;
		const messageParts = lastMessage.parts as unknown as MessagePart[];
		const clientMessageId = lastMessage.id;

		// Send the message via RPC (returns immediately with status)
		// Note: Type assertion needed due to RPC client typing limitations
		await runWithStreamingClient(
			StreamingChatClient.pipe(
				Effect.flatMap((client) =>
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(client as any)["chat.send"]({
						sessionId,
						content,
						parts: messageParts,
						clientMessageId,
					}) as Effect.Effect<SendMessageResult, unknown, never>
				)
			)
		);

		// Subscribe to session events
		return this.createEventStream(abortSignal);
	}

	/**
	 * Reconnects to an existing streaming response.
	 *
	 * This method subscribes to the session and returns the stream if currently streaming.
	 * Returns null if the session is idle (no active stream to reconnect to).
	 */
	async reconnectToStream({
		chatId: _chatId,
	}: {
		chatId: string;
	} & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null> {
		try {
			// Register with subscription manager
			subscriptionManager.visit(this.sessionId);

			// Capture for use in Effect
			const sessionId = this.sessionId;

			// Get session state to check if streaming
			// Note: Type assertion needed due to RPC client typing limitations
			const snapshot = await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(client as any)["chat.getState"]({
							sessionId,
						}) as Effect.Effect<SessionSnapshot, unknown, never>
					)
				)
			);

			// If idle with no active turn, return null (no stream to reconnect to)
			if (snapshot.status === "idle" && !snapshot.activeTurnId) {
				return null;
			}

			// Subscribe to session events
			const controller = subscriptionManager.getController(this.sessionId);
			return this.createEventStream(controller?.signal);
		} catch {
			return null;
		}
	}

	/**
	 * Creates a ReadableStream that converts SessionEvents to UIMessageChunks.
	 */
	private async createEventStream(
		abortSignal?: AbortSignal
	): Promise<ReadableStream<UIMessageChunk>> {
		const sessionId = this.sessionId;

		// Subscribe to session events
		// Note: Type assertion needed due to RPC client typing limitations
		const eventStream = await runWithStreamingClient(
			StreamingChatClient.pipe(
				Effect.flatMap((client) =>
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(client as any)["chat.subscribe"]({
						sessionId,
					}) as Effect.Effect<Stream.Stream<SessionEvent>, unknown, never>
				)
			)
		);

		// Track state for deduplication and finish detection
		let sawFinish = false;
		let activeTurnId: string | null = null;

		return new ReadableStream<UIMessageChunk>({
			start: (controller) => {
				// Handle abort signal
				if (abortSignal) {
					const onAbort = async () => {
						try {
							// Note: Type assertion needed due to RPC client typing limitations
							await runWithStreamingClient(
								StreamingChatClient.pipe(
									Effect.flatMap((client) =>
										// eslint-disable-next-line @typescript-eslint/no-explicit-any
										(client as any)["chat.interrupt"]({
											sessionId,
										}) as Effect.Effect<{ interrupted: boolean }, unknown, never>
									)
								)
							);
						} catch {
							// Ignore interrupt errors
						}
						controller.close();
					};

					if (abortSignal.aborted) {
						onAbort();
						return;
					}

					abortSignal.addEventListener("abort", onAbort, { once: true });
				}

				// Process the stream
				const processStream = Stream.runForEach(
					eventStream,
					(event: SessionEvent) =>
						Effect.sync(() => {
							const chunks = processSessionEvent(
								event,
								activeTurnId,
								sawFinish
							);

							// Update state based on event
							if (event._tag === "InitialState") {
								activeTurnId = event.snapshot.activeTurnId;
							} else if (event._tag === "SessionStarted") {
								activeTurnId = event.turnId;
								sawFinish = false; // Reset for new turn
							} else if (event._tag === "SessionStopped") {
								// Check if we need to emit finish
								if (!sawFinish) {
									sawFinish = true;
								}
							} else if (
								event._tag === "StreamEvent" &&
								event.event.type === "finish"
							) {
								sawFinish = true;
							}

							// Enqueue all chunks
							for (const chunk of chunks) {
								controller.enqueue(chunk);
							}

							// Close stream on SessionStopped
							if (event._tag === "SessionStopped") {
								controller.close();
							}
						})
				);

				// Run the stream processing
				Effect.runPromise(processStream).catch((error) => {
					console.error("Stream processing error:", error);
					controller.error(error);
				});
			},
		});
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a SessionEvent and returns corresponding UIMessageChunks.
 */
function processSessionEvent(
	event: SessionEvent,
	activeTurnId: string | null,
	sawFinish: boolean
): UIMessageChunk[] {
	const chunks: UIMessageChunk[] = [];

	switch (event._tag) {
		case "InitialState": {
			// Replay buffer events for mid-stream catch-up
			for (const bufferEvent of event.buffer) {
				const chunk = mapChatStreamEventToChunk(bufferEvent);
				if (chunk) {
					chunks.push(chunk);
				}
			}
			break;
		}

		case "SessionStarted": {
			// Emit start chunk for new turn
			chunks.push({
				type: "start",
				messageId: event.messageId,
			});
			break;
		}

		case "SessionStopped": {
			// Emit finish chunk if not already emitted
			if (!sawFinish) {
				chunks.push({
					type: "finish",
					finishReason: mapStopReasonToFinishReason(event.reason),
				});
			}
			break;
		}

		case "StreamEvent": {
			// Filter by turnId to avoid processing stale events
			if (event.turnId === activeTurnId || activeTurnId === null) {
				const chunk = mapChatStreamEventToChunk(event.event);
				if (chunk) {
					chunks.push(chunk);
				}
			}
			break;
		}

		// Queue events, UserMessage, SessionDeleted are handled by separate hooks
		// (useSessionEvents hook in the frontend)
		default:
			break;
	}

	return chunks;
}

/**
 * Maps a ChatStreamEvent to a UIMessageChunk.
 * Returns null for events that don't map to chunks.
 *
 * Note: We cast event to `any` when accessing properties because the ChatStreamEvent
 * union includes StreamEventData with `type: string` which prevents TypeScript from
 * properly narrowing the type in the switch statement.
 */
function mapChatStreamEventToChunk(
	event: ChatStreamEvent
): UIMessageChunk | null {
	// Cast to any to work around TypeScript union narrowing issues
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const e = event as any;

	switch (event.type) {
		// Lifecycle events
		case "start":
			return {
				type: "start",
				messageId: e.messageId,
				messageMetadata: e.messageMetadata,
			};

		case "finish":
			return {
				type: "finish",
				finishReason: e.finishReason,
				messageMetadata: e.messageMetadata,
			};

		case "abort":
			return {
				type: "abort",
				reason: e.reason,
			};

		case "error":
			return {
				type: "error",
				errorText: e.errorText,
			};

		// Text streaming events
		case "text-start":
			return {
				type: "text-start",
				id: e.id,
				providerMetadata: e.providerMetadata,
			};

		case "text-delta":
			return {
				type: "text-delta",
				id: e.id,
				delta: e.delta,
				providerMetadata: e.providerMetadata,
			};

		case "text-end":
			return {
				type: "text-end",
				id: e.id,
				providerMetadata: e.providerMetadata,
			};

		// Reasoning streaming events
		case "reasoning-start":
			return {
				type: "reasoning-start",
				id: e.id,
				providerMetadata: e.providerMetadata,
			};

		case "reasoning-delta":
			return {
				type: "reasoning-delta",
				id: e.id,
				delta: e.delta,
				providerMetadata: e.providerMetadata,
			};

		case "reasoning-end":
			return {
				type: "reasoning-end",
				id: e.id,
				providerMetadata: e.providerMetadata,
			};

		// Tool streaming events
		case "tool-input-start":
			return {
				type: "tool-input-start",
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				providerExecuted: e.providerExecuted,
				dynamic: e.dynamic,
				title: e.title,
			};

		case "tool-input-delta":
			return {
				type: "tool-input-delta",
				toolCallId: e.toolCallId,
				inputTextDelta: e.inputTextDelta,
			};

		case "tool-input-available":
			return {
				type: "tool-input-available",
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				input: e.input,
				providerExecuted: e.providerExecuted,
				providerMetadata: e.providerMetadata,
				dynamic: e.dynamic,
				title: e.title,
			};

		case "tool-input-error":
			return {
				type: "tool-input-error",
				toolCallId: e.toolCallId,
				toolName: e.toolName,
				input: e.input,
				providerExecuted: e.providerExecuted,
				providerMetadata: e.providerMetadata,
				dynamic: e.dynamic,
				errorText: e.errorText,
				title: e.title,
			};

		case "tool-approval-request":
			return {
				type: "tool-approval-request",
				approvalId: e.approvalId,
				toolCallId: e.toolCallId,
			};

		case "tool-output-available":
			return {
				type: "tool-output-available",
				toolCallId: e.toolCallId,
				output: e.output,
				providerExecuted: e.providerExecuted,
				dynamic: e.dynamic,
				preliminary: e.preliminary,
			};

		case "tool-output-error":
			return {
				type: "tool-output-error",
				toolCallId: e.toolCallId,
				errorText: e.errorText,
				providerExecuted: e.providerExecuted,
				dynamic: e.dynamic,
			};

		case "tool-output-denied":
			return {
				type: "tool-output-denied",
				toolCallId: e.toolCallId,
			};

		// Source events
		case "source-url":
			return {
				type: "source-url",
				sourceId: e.sourceId,
				url: e.url,
				title: e.title,
				providerMetadata: e.providerMetadata,
			};

		case "source-document":
			return {
				type: "source-document",
				sourceId: e.sourceId,
				mediaType: e.mediaType,
				title: e.title,
				filename: e.filename,
				providerMetadata: e.providerMetadata,
			};

		// File event
		case "file":
			return {
				type: "file",
				url: e.url,
				mediaType: e.mediaType,
				providerMetadata: e.providerMetadata,
			};

		// Step events
		case "start-step":
			return {
				type: "start-step",
			};

		case "finish-step":
			return {
				type: "finish-step",
			};

		// Message metadata event
		case "message-metadata":
			return {
				type: "message-metadata",
				messageMetadata: e.messageMetadata,
			};

		default:
			// Handle data-* events or unknown event types
			if (event.type.startsWith("data-")) {
				return {
					type: event.type as `data-${string}`,
					id: e.id,
					data: e.data,
					transient: e.transient,
				};
			}
			// Unknown event type - return null
			return null;
	}
}

/**
 * Maps SessionStopped reason to AI SDK FinishReason.
 */
function mapStopReasonToFinishReason(
	reason: "completed" | "interrupted" | "error"
): "stop" | "error" | "other" {
	switch (reason) {
		case "completed":
			return "stop";
		case "interrupted":
			return "other";
		case "error":
			return "error";
	}
}
