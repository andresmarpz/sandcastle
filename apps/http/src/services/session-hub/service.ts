import type {
	ChatOperationRpcError,
	ChatSessionNotFoundRpcError,
	DequeueResult,
	InterruptResult,
	SendMessageResult,
} from "@sandcastle/rpc";
import type {
	MessagePart,
	SessionEvent,
	SessionSnapshot,
} from "@sandcastle/schemas";
import { Context, type Effect, type Mailbox, type Scope } from "effect";

/**
 * SessionHub service interface.
 *
 * SessionHub is the core service that manages real-time chat session state,
 * coordinates message streaming from the Claude SDK, handles message queuing,
 * and broadcasts events to all subscribers via PubSub.
 *
 * Key responsibilities:
 * - Session state machine (idle ↔ streaming)
 * - Message queuing when streaming
 * - Buffer management for catch-up
 * - Fiber management for interrupt capability
 * - Event broadcasting via PubSub
 * - Persistence via StorageService
 */
export interface SessionHubInterface {
	/**
	 * Send a message to a session.
	 *
	 * - If session is idle: starts streaming immediately, returns `{ status: "started" }`
	 * - If session is streaming: queues message, returns `{ status: "queued" }`
	 *
	 * Broadcasts: UserMessage, SessionStarted (if started), MessageQueued (if queued)
	 */
	readonly sendMessage: (
		sessionId: string,
		content: string,
		clientMessageId: string,
		parts?: readonly MessagePart[],
	) => Effect.Effect<
		SendMessageResult,
		ChatSessionNotFoundRpcError | ChatOperationRpcError
	>;

	/**
	 * Subscribe to session events.
	 *
	 * Returns a Mailbox that emits:
	 * 1. InitialState (first event) - snapshot + buffer for catch-up
	 * 2. Live events from PubSub - StreamEvent, SessionStarted/Stopped, etc.
	 *
	 * The mailbox continues until the subscriber disconnects or the session is deleted.
	 * Requires a Scope for the subscription lifecycle.
	 */
	readonly subscribe: (
		sessionId: string,
	) => Effect.Effect<
		Mailbox.ReadonlyMailbox<SessionEvent>,
		ChatSessionNotFoundRpcError,
		Scope.Scope
	>;

	/**
	 * Interrupt a streaming session.
	 *
	 * - If session is idle: returns `{ interrupted: false }`
	 * - If session is streaming: interrupts, saves partial progress, returns `{ interrupted: true }`
	 *
	 * On interrupt:
	 * 1. Gracefully stops Claude SDK stream
	 * 2. Interrupts processing fiber
	 * 3. Saves partial messages to storage
	 * 4. Completes turn with "interrupted" status
	 * 5. Broadcasts SessionStopped
	 * 6. Auto-dequeues next message if queue not empty
	 */
	readonly interrupt: (
		sessionId: string,
	) => Effect.Effect<InterruptResult, ChatSessionNotFoundRpcError>;

	/**
	 * Remove a message from the queue.
	 *
	 * - Returns `{ removed: true }` if message was found and removed
	 * - Returns `{ removed: false }` if message was not in queue
	 *
	 * Broadcasts: MessageDequeued (if removed)
	 */
	readonly dequeueMessage: (
		sessionId: string,
		messageId: string,
	) => Effect.Effect<DequeueResult, ChatSessionNotFoundRpcError>;

	/**
	 * Get current session state snapshot.
	 *
	 * Returns the current status, active turn ID, queue, and history cursor.
	 * Use this for initial page load before subscribing.
	 */
	readonly getState: (
		sessionId: string,
	) => Effect.Effect<SessionSnapshot, ChatSessionNotFoundRpcError>;

	/**
	 * Delete a session from the hub.
	 *
	 * This method:
	 * 1. Broadcasts SessionDeleted event to all subscribers via PubSub
	 * 2. Interrupts any active stream (if streaming)
	 * 3. Removes session from in-memory sessions map
	 *
	 * Note: Does NOT handle storage deletion - that's the caller's responsibility.
	 * If the session doesn't exist in the hub, this is a no-op (succeeds silently).
	 */
	readonly deleteSession: (sessionId: string) => Effect.Effect<void>;

	/**
	 * Gracefully shutdown the SessionHub.
	 *
	 * This method:
	 * 1. Iterates all sessions in the sessions map
	 * 2. For each streaming session, interrupts the stream and saves partial progress
	 * 3. Logs shutdown progress
	 *
	 * Called automatically via Effect's finalizer system when the server shuts down.
	 * The BunRuntime handles SIGTERM/SIGINT signals automatically.
	 */
	readonly shutdown: () => Effect.Effect<void>;
}

/**
 * SessionHub service Context.Tag for dependency injection.
 */
export class SessionHub extends Context.Tag("SessionHub")<
	SessionHub,
	SessionHubInterface
>() {}
