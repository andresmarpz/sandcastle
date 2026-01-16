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

import type { ChatStreamEvent, SessionEvent } from "@sandcastle/schemas";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { Cause, Effect, Exit, Fiber, Stream } from "effect";

import {
	forkWithStreamingClient,
	getStreamingConnectionState,
	runWithStreamingClient,
	StreamingChatClient,
	waitForStreamingConnection,
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
					p.type === "text" && "text" in p,
			)
			.map((p) => p.text)
			.join("");

		// Register with subscription manager and get abort controller
		subscriptionManager.visit(this.sessionId);
		const subscriptionController = subscriptionManager.getController(
			this.sessionId,
		);

		// Capture for use in Effect generator
		const sessionId = this.sessionId;
		const clientMessageId = lastMessage.id;

		// Extract file parts and transform to schema format
		// Text parts are not needed since content already has the text
		const fileParts = lastMessage.parts
			.filter(
				(
					p,
				): p is {
					type: "file";
					mediaType: string;
					url: string;
					filename?: string;
				} =>
					p.type === "file" &&
					"mediaType" in p &&
					typeof p.mediaType === "string" &&
					"url" in p &&
					typeof p.url === "string",
			)
			.map((p) => ({
				type: "file" as const,
				mediaType: p.mediaType,
				url: p.url,
				...(p.filename ? { filename: p.filename } : {}),
			}));

		// Send the message via RPC (returns immediately with status)
		await runWithStreamingClient(
			StreamingChatClient.pipe(
				Effect.flatMap((client) =>
					client.chat.send({
						sessionId,
						content,
						clientMessageId,
						...(fileParts.length > 0 ? { parts: fileParts } : {}),
					}),
				),
			),
		);

		// Subscribe to session events
		return this.createEventStream({
			abortSignal,
			subscriptionSignal: subscriptionController?.signal,
		});
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
			const snapshot = await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						client.chat.getState({
							sessionId,
						}),
					),
				),
			);

			// If idle with no active turn, return null (no stream to reconnect to)
			if (snapshot.status === "idle" && !snapshot.activeTurnId) {
				return null;
			}

			// Subscribe to session events
			const controller = subscriptionManager.getController(this.sessionId);
			return this.createEventStream({
				subscriptionSignal: controller?.signal,
			});
		} catch {
			return null;
		}
	}

	/**
	 * Creates a ReadableStream that converts SessionEvents to UIMessageChunks.
	 */
	private async createEventStream({
		abortSignal,
		subscriptionSignal,
	}: {
		abortSignal?: AbortSignal;
		subscriptionSignal?: AbortSignal;
	} = {}): Promise<ReadableStream<UIMessageChunk>> {
		const sessionId = this.sessionId;

		// Subscribe to session events
		// Track state for deduplication and finish detection
		let sawFinish = false;
		let activeTurnId: string | null = null;
		let hadActiveTurn = false;
		let reconnecting = false;
		let connectionId = getStreamingConnectionState().connectionId;
		let streamClosed = false;
		let aborted = false;
		let currentFiber: Fiber.RuntimeFiber<void, unknown> | null = null;
		let cleanupAbortListeners = () => {};
		let closeStream = () => {};
		let errorStream = (_error: unknown) => {};

		const resetStreamState = () => {
			activeTurnId = null;
			sawFinish = false;
			reconnecting = true;
		};

		const interruptCurrentFiber = () => {
			if (!currentFiber) {
				return;
			}
			const fiber = currentFiber;
			currentFiber = null;
			Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {
				// Ignore interruption errors
			});
		};

		return new ReadableStream<UIMessageChunk>({
			start: (controller) => {
				const handleUserAbort = () => {
					if (aborted || streamClosed) {
						return;
					}
					aborted = true;

					// Interrupt the current subscription fiber
					interruptCurrentFiber();

					// Interrupt the server-side stream
					runWithStreamingClient(
						StreamingChatClient.pipe(
							Effect.flatMap((client) =>
								client.chat.interrupt({
									sessionId,
								}),
							),
						),
					).catch(() => {
						// Ignore interrupt errors
					});

					closeStream();
				};

				const handleSubscriptionAbort = () => {
					if (aborted || streamClosed) {
						return;
					}
					aborted = true;
					interruptCurrentFiber();
					closeStream();
				};

				cleanupAbortListeners = () => {
					if (abortSignal) {
						abortSignal.removeEventListener("abort", handleUserAbort);
					}
					if (subscriptionSignal) {
						subscriptionSignal.removeEventListener(
							"abort",
							handleSubscriptionAbort,
						);
					}
				};

				closeStream = () => {
					if (streamClosed) {
						return;
					}
					streamClosed = true;
					cleanupAbortListeners();
					controller.close();
				};

				errorStream = (error: unknown) => {
					if (streamClosed) {
						return;
					}
					streamClosed = true;
					cleanupAbortListeners();
					controller.error(
						error instanceof Error ? error : new Error(String(error)),
					);
				};

				if (abortSignal) {
					if (abortSignal.aborted) {
						handleUserAbort();
						return;
					}
					abortSignal.addEventListener("abort", handleUserAbort, {
						once: true,
					});
				}

				if (subscriptionSignal) {
					if (subscriptionSignal.aborted) {
						handleSubscriptionAbort();
						return;
					}
					subscriptionSignal.addEventListener(
						"abort",
						handleSubscriptionAbort,
						{
							once: true,
						},
					);
				}

				const processEvent = (event: SessionEvent) => {
					if (aborted || streamClosed) {
						return;
					}

					if (event._tag === "InitialState") {
						if (event.snapshot.activeTurnId || event.buffer.length > 0) {
							hadActiveTurn = true;
						}

						if (
							reconnecting &&
							hadActiveTurn &&
							event.snapshot.status === "idle" &&
							event.buffer.length === 0 &&
							!event.snapshot.activeTurnId
						) {
							if (!sawFinish) {
								controller.enqueue({
									type: "finish",
									finishReason: "stop",
								});
								sawFinish = true;
							}
							closeStream();
							return;
						}

						reconnecting = false;
					} else if (event._tag === "SessionStarted") {
						hadActiveTurn = true;
					} else if (event._tag === "StreamEvent") {
						hadActiveTurn = true;
					}

					const chunks = processSessionEvent(event, activeTurnId, sawFinish);

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

					// Close stream on SessionStopped or finish event
					if (event._tag === "SessionStopped") {
						closeStream();
					} else if (
						event._tag === "StreamEvent" &&
						event.event.type === "finish"
					) {
						// Also close on finish event - SessionStopped may arrive later for cleanup
						// but the client doesn't need to wait for it
						closeStream();
					}
				};

				const runSubscription = async () => {
					while (!aborted && !streamClosed) {
						const subscriptionEffect = StreamingChatClient.pipe(
							Effect.flatMap((client) =>
								client.chat
									.subscribe({ sessionId })
									.pipe(
										Stream.runForEach((event) =>
											Effect.sync(() => processEvent(event)),
										),
									),
							),
						);

						currentFiber = forkWithStreamingClient(subscriptionEffect);
						const exit = await Effect.runPromise(Fiber.await(currentFiber));
						currentFiber = null;

						if (aborted || streamClosed) {
							return;
						}

						if (Exit.isFailure(exit)) {
							if (Cause.isInterrupted(exit.cause)) {
								return;
							}

							const failure = Cause.failureOption(exit.cause);
							if (
								failure._tag === "Some" &&
								isReconnectableFailure(failure.value)
							) {
								const next = await waitForStreamingConnection(connectionId);
								connectionId = next.connectionId;
								resetStreamState();
								continue;
							}

							const errorValue =
								failure._tag === "Some" ? failure.value : exit.cause;
							errorStream(errorValue);
							return;
						}

						const next = await waitForStreamingConnection(connectionId);
						connectionId = next.connectionId;
						resetStreamState();
					}
				};

				runSubscription().catch((error) => {
					if (!streamClosed) {
						errorStream(error);
					}
				});
			},
			cancel: () => {
				aborted = true;
				streamClosed = true;
				cleanupAbortListeners();
				interruptCurrentFiber();
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
	sawFinish: boolean,
): UIMessageChunk[] {
	const chunks: UIMessageChunk[] = [];

	switch (event._tag) {
		case "InitialState": {
			// If we have turn context, emit synthetic start chunk for late subscriber
			if (event.turnContext) {
				chunks.push({
					type: "start",
					messageId: event.turnContext.messageId,
				});
			}
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
	event: ChatStreamEvent,
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

function isReconnectableFailure(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	if (
		"_tag" in error &&
		(error as { _tag?: string })._tag === "RpcClientError"
	) {
		return true;
	}
	return false;
}

/**
 * Maps SessionStopped reason to AI SDK FinishReason.
 */
function mapStopReasonToFinishReason(
	reason: "completed" | "interrupted" | "error",
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
