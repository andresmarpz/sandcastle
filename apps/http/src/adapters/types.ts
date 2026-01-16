import type { ChatRpcError, ChatStreamEvent } from "@sandcastle/schemas";
import type { Stream } from "effect";

/**
 * Configuration for stream adaptation (real-time events)
 */
export interface AdapterConfig {
	/** Generate unique IDs for messages and parts */
	readonly generateId: () => string;
}

/**
 * Configuration for message accumulation (persistence)
 */
export interface AccumulatorConfig {
	/** ID generator for messages without UUID */
	readonly generateId: () => string;
	/** Storage session ID (your system's session, not the provider's) */
	readonly storageSessionId: string;
}

/**
 * Accumulated messages ready for persistence
 */
export interface MessageAccumulator<TMessage, TMetadata> {
	/** Process an SDK message and update internal state */
	process(message: TMessage): void;
	/** Get all accumulated messages for storage */
	getMessages(): readonly unknown[];
	/** Get session metadata (available after result message) */
	getSessionMetadata(): TMetadata | null;
}

/**
 * Generic adapter interface for translating agent SDK streams
 * to AI SDK compatible ChatStreamEvent streams.
 *
 * Each agent implementation provides its own concrete types for:
 * - TMessage: The SDK's message type (e.g., SDKMessage for Claude)
 * - TError: The SDK's error type (e.g., ClaudeSDKError)
 */
export interface AgentAdapter<TMessage, TError, TMetadata = unknown> {
	/**
	 * The agent type identifier for logging/debugging
	 */
	readonly agentType: string;

	/**
	 * Transform an agent SDK stream to ChatStreamEvent stream.
	 *
	 * The adapter handles:
	 * - Message type mapping (assistant, user, system, result)
	 * - Content block transformation (text, tool_use, thinking)
	 * - Tool call state tracking
	 * - Error mapping to ChatRpcError
	 */
	readonly translateStream: (
		sdkStream: Stream.Stream<TMessage, TError>,
		config: AdapterConfig,
	) => Stream.Stream<ChatStreamEvent, ChatRpcError>;

	/**
	 * Create a message accumulator for persistence.
	 *
	 * The accumulator collects messages during streaming and
	 * provides them for storage on completion or interruption.
	 */
	readonly createAccumulator: (
		config: AccumulatorConfig,
	) => MessageAccumulator<TMessage, TMetadata>;
}
