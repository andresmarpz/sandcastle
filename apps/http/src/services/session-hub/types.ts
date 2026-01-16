import type { Fiber, PubSub, Ref } from "effect";
import type {
	ChatStreamEvent,
	QueuedMessage,
	SessionEvent,
	StreamingStatus,
} from "@sandcastle/schemas";
import type { QueryHandle } from "../../agents/claude";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
	MessageAccumulator,
	SessionMetadata,
	StreamState,
} from "../../adapters/claude";

/**
 * History cursor for tracking last persisted message.
 * Used for gap detection when loading history.
 */
export interface HistoryCursor {
	readonly lastMessageId: string | null;
	readonly lastMessageAt: string | null;
}

/**
 * Per-session state maintained by SessionHub.
 *
 * Design notes:
 * - Uses Ref for mutable state to ensure atomic updates
 * - PubSub for fan-out to multiple subscribers
 * - Fiber reference for interrupt capability
 */
export interface SessionState {
	/** Session status: idle or streaming */
	readonly statusRef: Ref.Ref<StreamingStatus>;

	/** Currently active turn ID (null when idle) */
	readonly activeTurnIdRef: Ref.Ref<string | null>;

	/** Buffer of ChatStreamEvents for current turn (for catch-up) */
	readonly bufferRef: Ref.Ref<ChatStreamEvent[]>;

	/** Queue of pending messages */
	readonly queueRef: Ref.Ref<QueuedMessage[]>;

	/** Last persisted message cursor (for history gap detection) */
	readonly historyCursorRef: Ref.Ref<HistoryCursor>;

	/** PubSub for broadcasting SessionEvents to subscribers */
	readonly pubsub: PubSub.PubSub<SessionEvent>;

	/** Currently running streaming fiber (null when idle) */
	readonly fiberRef: Ref.Ref<Fiber.RuntimeFiber<void, never> | null>;

	/** Query handle for interrupt capability */
	readonly queryHandleRef: Ref.Ref<QueryHandle | null>;

	/** Message accumulator for current turn (for persistence) */
	readonly accumulatorRef: Ref.Ref<MessageAccumulator<
		SDKMessage,
		SessionMetadata
	> | null>;

	/** Adapter stream state for current turn */
	readonly streamStateRef: Ref.Ref<StreamState>;

	/** Claude SDK session ID (for resume capability) */
	readonly claudeSessionIdRef: Ref.Ref<string | null>;
}

/**
 * Input for creating a new session state (partial, with defaults)
 */
export interface CreateSessionStateInput {
	readonly historyCursor?: HistoryCursor;
}
