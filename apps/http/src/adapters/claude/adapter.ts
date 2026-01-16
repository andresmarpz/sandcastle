import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
	ChatRpcError,
	type ChatStreamEvent,
	type StreamEventError,
	type StreamEventFinish,
} from "@sandcastle/schemas";
import { Chunk, Effect, Stream } from "effect";
import type { ClaudeSDKError } from "../../agents/claude";
import type { AdapterConfig, AgentAdapter, MessageAccumulator } from "../types";
import {
	createMessageAccumulator,
	type SessionMetadata,
} from "./message-accumulator";
import { createStreamState } from "./state-tracker";
import { processMessage } from "./transformer";
import type { StreamState } from "./types";

/**
 * Claude Code Agent Adapter
 *
 * Translates Claude Agent SDK v1 SDKMessage stream to
 * AI SDK v6 compatible ChatStreamEvent stream.
 */
export const ClaudeCodeAgentAdapter: AgentAdapter<
	SDKMessage,
	ClaudeSDKError,
	SessionMetadata
> = {
	agentType: "claude-code",

	translateStream: (sdkStream, config) =>
		Stream.suspend(() => {
			// Mutable state, encapsulated in closure
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
						{
							type: "error",
							errorText: error.message,
						} satisfies StreamEventError,
						{
							type: "finish",
							finishReason: "error",
						} satisfies StreamEventFinish,
					),
				),
			);
		}),

	createAccumulator: (config) => createMessageAccumulator(config),
};

/**
 * Result of processing a single message through both transformer and accumulator
 */
export interface DualProcessResult {
	/** Stream events for real-time broadcasting */
	events: ChatStreamEvent[];
	/** Updated stream state */
	newState: StreamState;
}

/**
 * Process a single SDK message for both streaming and accumulation.
 *
 * This convenience function enables SessionHub to process both concerns
 * in a single Stream.tap call:
 *
 * @example
 * ```ts
 * let state = createStreamState();
 * const accumulator = adapter.createAccumulator(config);
 *
 * yield* sdkStream.pipe(
 *   Stream.tap((message) =>
 *     Effect.sync(() => {
 *       const { events, newState } = processMessageDual(message, state, adapterConfig, accumulator);
 *       state = newState;
 *       for (const event of events) {
 *         buffer.push(event);
 *         broadcast(event);
 *       }
 *     })
 *   ),
 *   Stream.runDrain,
 * );
 *
 * const messages = accumulator.getMessages();
 * ```
 */
export function processMessageDual(
	message: SDKMessage,
	state: StreamState,
	config: AdapterConfig,
	accumulator: MessageAccumulator<SDKMessage, SessionMetadata>,
): DualProcessResult {
	// Transform for real-time streaming
	const { events, newState } = processMessage(message, state, config);

	// Accumulate for persistence
	accumulator.process(message);

	return { events, newState };
}
