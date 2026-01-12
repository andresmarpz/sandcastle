import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { ChatRpc, type ChatStreamEvent } from "@sandcastle/rpc";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { Effect, Fiber, Layer, Stream } from "effect";
import { RPC_URL } from "@/api/config";
import type {
	RpcTransportConfig,
	SessionMetadata,
	TransportCallbacks,
} from "./transport-types";

/**
 * Create RPC client layer for chat streaming.
 */
function makeRpcClientLayer(rpcUrl: string) {
	return RpcClient.layerProtocolHttp({ url: rpcUrl }).pipe(
		Layer.provide(RpcSerialization.layerNdjson),
		Layer.provide(FetchHttpClient.layer),
	);
}

/**
 * Map ChatStreamEvent to UIMessageChunk.
 * The types are structurally compatible - this handles the mapping.
 */
function mapEventToChunk(event: ChatStreamEvent): UIMessageChunk | null {
	switch (event.type) {
		case "start":
			return { type: "start", messageId: event.messageId };
		case "text-start":
			return { type: "text-start", id: event.id };
		case "text-delta":
			return { type: "text-delta", id: event.id, delta: event.delta };
		case "text-end":
			return { type: "text-end", id: event.id };
		case "tool-input-start":
			return {
				type: "tool-input-start",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
			};
		case "tool-input-available":
			return {
				type: "tool-input-available",
				toolCallId: event.toolCallId,
				toolName: event.toolName,
				input: event.input,
			};
		case "tool-output-available":
			return {
				type: "tool-output-available",
				toolCallId: event.toolCallId,
				output: event.output,
			};
		case "reasoning-start":
			return { type: "reasoning-start", id: event.id };
		case "reasoning-delta":
			return { type: "reasoning-delta", id: event.id, delta: event.delta };
		case "reasoning-end":
			return { type: "reasoning-end", id: event.id };
		case "finish":
			return { type: "finish", finishReason: event.finishReason };
		case "error":
			return { type: "error", errorText: event.errorText };
		case "ask-user":
			// This is handled via callback, not as a chunk
			return null;
		default:
			return null;
	}
}

/**
 * Create a ChatTransport that bridges Effect RPC streaming to AI SDK.
 *
 * This transport:
 * - Extracts the prompt from the last user message
 * - Calls the Effect RPC streaming endpoint
 * - Converts Effect Stream to ReadableStream<UIMessageChunk>
 * - Handles cancellation via AbortSignal → Fiber.interrupt
 * - Provides callbacks for session events (AskUser, metadata, etc.)
 *
 * @param config - Transport configuration (sessionId, worktreeId, etc.)
 * @param callbacks - Optional callbacks for stream events
 * @returns ChatTransport compatible with AI SDK's useChat
 */
export function createRpcTransport(
	config: RpcTransportConfig,
	callbacks?: TransportCallbacks,
): ChatTransport<UIMessage> {
	const rpcUrl = config.rpcUrl || RPC_URL;
	let currentFiber: Fiber.RuntimeFiber<void, unknown> | null = null;
	let latestClaudeSessionId = config.claudeSessionId ?? null;

	return {
		async sendMessages({ messages, abortSignal }) {
			// Extract prompt from last user message
			const lastMessage = messages[messages.length - 1];
			const prompt =
				lastMessage?.parts?.find((p) => p.type === "text")?.text ?? "";

			if (!prompt) {
				throw new Error("No prompt found in messages");
			}

			return new ReadableStream<UIMessageChunk>({
				start(controller) {
					const program = Effect.gen(function* () {
						const client = yield* RpcClient.make(ChatRpc);

						// Access the streaming RPC
						// Using type assertion due to complex RPC client types
						// biome-ignore lint/suspicious/noExplicitAny: RPC client types are complex
						const clientAny = client as any;
						const stream = clientAny.chat.stream({
							sessionId: config.sessionId,
							worktreeId: config.worktreeId,
							prompt,
							claudeSessionId: latestClaudeSessionId,
							autonomous: config.autonomous,
						}) as Stream.Stream<ChatStreamEvent, unknown>;

						// Process each event from the stream
						yield* Stream.runForEach(stream, (event) =>
							Effect.sync(() => {
								// Handle special events via callbacks
								if (event.type === "start" && event.claudeSessionId) {
									latestClaudeSessionId = event.claudeSessionId;
									callbacks?.onSessionStart?.(event.claudeSessionId);
								}

								if (event.type === "ask-user") {
									callbacks?.onAskUser?.({
										toolCallId: event.toolCallId,
										questions: event.questions,
									});
									// Don't enqueue - handled by callback
									return;
								}

								if (event.type === "finish" && event.metadata) {
									const metadata: SessionMetadata = {
										claudeSessionId:
											event.metadata.claudeSessionId ?? latestClaudeSessionId,
										costUsd: event.metadata.costUsd ?? 0,
										inputTokens: event.metadata.inputTokens ?? 0,
										outputTokens: event.metadata.outputTokens ?? 0,
									};
									callbacks?.onMetadata?.(metadata);
								}

								console.log("raw event", event);

								// Map and enqueue the chunk
								const chunk = mapEventToChunk(event);
								if (chunk) {
									controller.enqueue(chunk);
								}
							}),
						);
					}).pipe(
						Effect.scoped,
						Effect.provide(makeRpcClientLayer(rpcUrl)),
						Effect.catchAll((error) =>
							Effect.sync(() => {
								console.error("[RpcTransport] Stream error:", error);
								controller.enqueue({
									type: "error",
									errorText:
										error instanceof Error ? error.message : String(error),
								});
							}),
						),
						Effect.ensuring(
							Effect.sync(() => {
								controller.close();
								currentFiber = null;
							}),
						),
						Effect.interruptible,
					);

					// Run the Effect program
					currentFiber = Effect.runFork(
						program as Effect.Effect<void, never, never>,
					);

					// Handle AbortSignal for cancellation
					if (abortSignal) {
						const handleAbort = () => {
							if (currentFiber) {
								Effect.runFork(Fiber.interrupt(currentFiber));
							}
						};
						abortSignal.addEventListener("abort", handleAbort);
					}
				},

				cancel() {
					if (currentFiber) {
						Effect.runFork(Fiber.interrupt(currentFiber));
						currentFiber = null;
					}
				},
			});
		},

		async reconnectToStream() {
			// Could implement reconnection to active server stream in future
			return null;
		},
	};
}
