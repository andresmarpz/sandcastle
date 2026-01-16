/**
 * React Hook for Session Events
 *
 * Subscribes to session events via the RPC WebSocket client and exposes
 * queue state, session status, and connection information.
 *
 * This hook is separate from useChat() and handles session coordination:
 * - Queue state (pending messages)
 * - Session status (idle/streaming)
 * - Active turn tracking for deduplication
 *
 * @example
 * ```tsx
 * function ChatSession({ sessionId }: { sessionId: string }) {
 *   const { queue, sessionStatus, activeTurnId, isConnected, error } = useSessionEvents(sessionId)
 *
 *   return (
 *     <div>
 *       {sessionStatus === "streaming" && <span>AI is responding...</span>}
 *       {queue.length > 0 && (
 *         <div>Queued messages: {queue.length}</div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { Effect, Stream, Cause, Fiber, Exit } from "effect";
import type { QueuedMessage, SessionEvent } from "@sandcastle/schemas";
import {
	runWithStreamingClient,
	forkWithStreamingClient,
	StreamingChatClient,
} from "@/lib/rpc-websocket-client";
import { subscriptionManager } from "@/lib/subscription-manager";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionEventsState {
	/** Queue of pending messages waiting to be processed */
	queue: QueuedMessage[];
	/** Current session status */
	sessionStatus: "idle" | "streaming";
	/** ID of the active turn (for deduplication) */
	activeTurnId: string | null;
	/** Whether the subscription is currently active */
	isConnected: boolean;
	/** Error if subscription failed */
	error: Error | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Subscribe to session events and track queue/status state.
 *
 * @param sessionId - The session ID to subscribe to
 * @returns Current session events state
 */
export function useSessionEvents(sessionId: string): SessionEventsState {
	const [state, setState] = useState<SessionEventsState>({
		queue: [],
		sessionStatus: "idle",
		activeTurnId: null,
		isConnected: false,
		error: null,
	});

	// Track if we're mounted to prevent state updates after unmount
	const isMountedRef = useRef(true);

	// Store fiber reference for cleanup
	const fiberRef = useRef<Fiber.RuntimeFiber<void, unknown> | null>(null);

	// Safe state update that checks if component is still mounted
	const safeSetState = useCallback(
		(updater: (prev: SessionEventsState) => SessionEventsState) => {
			if (isMountedRef.current) {
				setState(updater);
			}
		},
		[]
	);

	useEffect(() => {
		isMountedRef.current = true;

		// Register with subscription manager
		const { evicted } = subscriptionManager.visit(sessionId);
		const controller = subscriptionManager.getController(sessionId);

		if (evicted) {
			console.debug(`[useSessionEvents] Evicted session: ${evicted}`);
		}

		// Reset state for new subscription
		safeSetState(() => ({
			queue: [],
			sessionStatus: "idle",
			activeTurnId: null,
			isConnected: false,
			error: null,
		}));

		// Process a single session event
		const processEvent = (event: SessionEvent) => {
			switch (event._tag) {
				case "InitialState":
					safeSetState(() => ({
						queue: event.snapshot.queue as QueuedMessage[],
						sessionStatus: event.snapshot.status,
						activeTurnId: event.snapshot.activeTurnId,
						isConnected: true,
						error: null,
					}));
					break;

				case "SessionStarted":
					safeSetState((prev) => ({
						...prev,
						sessionStatus: "streaming",
						activeTurnId: event.turnId,
					}));
					break;

				case "SessionStopped":
					safeSetState((prev) => ({
						...prev,
						sessionStatus: "idle",
						activeTurnId: null,
					}));
					break;

				case "MessageQueued":
					safeSetState((prev) => ({
						...prev,
						queue: [...prev.queue, event.message as QueuedMessage],
					}));
					break;

				case "MessageDequeued":
					safeSetState((prev) => ({
						...prev,
						queue: prev.queue.filter((m) => m.id !== event.messageId),
					}));
					break;

				case "UserMessage":
					// UserMessage is primarily for optimistic UI updates in useChat
					// We could use it here for additional UI feedback if needed
					break;

				case "SessionDeleted":
					// Clear all state when session is deleted
					safeSetState(() => ({
						queue: [],
						sessionStatus: "idle",
						activeTurnId: null,
						isConnected: false,
						error: null,
					}));
					break;

				case "StreamEvent":
					// StreamEvent is handled by useChat for message content
					// We don't need to process it here for queue/status
					break;
			}
		};

		// Create the subscription effect that runs until aborted
		const subscriptionEffect = StreamingChatClient.pipe(
			Effect.flatMap((client) => {
				// Call chat.subscribe RPC - returns a Stream
				// The type assertion is needed due to RPC client typing limitations
				return (client as any)["chat.subscribe"]({ sessionId }) as Effect.Effect<
					Stream.Stream<SessionEvent>,
					unknown,
					never
				>;
			}),
			Effect.flatMap((stream) =>
				Stream.runForEach(stream, (event: SessionEvent) =>
					Effect.sync(() => {
						// Check if we should stop processing (abort signal)
						if (controller?.signal.aborted) {
							return;
						}
						processEvent(event);
					})
				)
			)
		);

		// Fork the subscription so it runs in the background
		const fiber = forkWithStreamingClient(subscriptionEffect);
		fiberRef.current = fiber;

		// Handle abort signal - interrupt the fiber when aborted
		const handleAbort = () => {
			safeSetState((prev) => ({
				...prev,
				isConnected: false,
			}));
			// Interrupt the fiber
			if (fiberRef.current) {
				Effect.runPromise(
					Fiber.interrupt(fiberRef.current)
				).catch(() => {
					// Ignore errors during interruption
				});
			}
		};

		controller?.signal.addEventListener("abort", handleAbort);

		// Wait for the fiber to complete (or error) and handle the result
		Effect.runPromise(Fiber.await(fiber)).then((exit) => {
			// Clean up abort listener
			controller?.signal.removeEventListener("abort", handleAbort);

			// Handle completion or error
			if (Exit.isFailure(exit)) {
				// Check if this was an interruption (not an error)
				if (!Cause.isInterrupted(exit.cause)) {
					const failure = Cause.failureOption(exit.cause);
					if (failure._tag === "Some") {
						safeSetState((prev) => ({
							...prev,
							isConnected: false,
							error:
								failure.value instanceof Error
									? failure.value
									: new Error(String(failure.value)),
						}));
					}
				}
			}
		}).catch((err) => {
			safeSetState((prev) => ({
				...prev,
				isConnected: false,
				error: err instanceof Error ? err : new Error(String(err)),
			}));
		});

		return () => {
			isMountedRef.current = false;
			// Interrupt fiber on cleanup
			if (fiberRef.current) {
				Effect.runPromise(Fiber.interrupt(fiberRef.current)).catch(() => {
					// Ignore errors during interruption
				});
			}
			subscriptionManager.leave(sessionId);
		};
	}, [sessionId, safeSetState]);

	return state;
}
