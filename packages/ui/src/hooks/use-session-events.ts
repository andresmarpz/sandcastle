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

import type {
	ChatMessage,
	QueuedMessage,
	SessionEvent,
} from "@sandcastle/schemas";
import { Cause, Effect, Exit, Fiber, Stream } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatClient } from "@/api/chat-client";
import {
	forkWithStreamingClient,
	onStreamingConnectionEvent,
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

export interface SessionHistoryCursor {
	lastMessageId: string | null;
	lastMessageAt: string | null;
}

export interface UseSessionEventsOptions {
	historyCursor?: SessionHistoryCursor | null;
	onHistoryGap?: (messages: ChatMessage[]) => void;
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
export function useSessionEvents(
	sessionId: string,
	options: UseSessionEventsOptions = {},
): SessionEventsState {
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

	const historyCursorRef = useRef<SessionHistoryCursor | null>(
		options.historyCursor ?? null,
	);
	const historyGapHandlerRef = useRef(options.onHistoryGap);
	const lastGapCursorRef = useRef<string | null>(null);
	const gapFetchInFlightRef = useRef<Promise<void> | null>(null);

	useEffect(() => {
		historyCursorRef.current = options.historyCursor ?? null;
	}, [
		options.historyCursor?.lastMessageId,
		options.historyCursor?.lastMessageAt,
	]);

	useEffect(() => {
		historyGapHandlerRef.current = options.onHistoryGap;
	}, [options.onHistoryGap]);

	// Safe state update that checks if component is still mounted
	const safeSetState = useCallback(
		(updater: (prev: SessionEventsState) => SessionEventsState) => {
			if (isMountedRef.current) {
				setState(updater);
			}
		},
		[],
	);

	useEffect(() => {
		isMountedRef.current = true;
		lastGapCursorRef.current = null;
		gapFetchInFlightRef.current = null;

		// Register with subscription manager
		const { evicted } = subscriptionManager.visit(sessionId);
		const controller = subscriptionManager.getController(sessionId);
		let disposed = false;

		if (evicted) {
			console.debug(`[useSessionEvents] Evicted session: ${evicted}`);
		}

		const resetState = () => {
			safeSetState(() => ({
				queue: [],
				sessionStatus: "idle",
				activeTurnId: null,
				isConnected: false,
				error: null,
			}));
		};

		resetState();

		const maybeFetchHistoryGap = (snapshot: {
			historyCursor: SessionHistoryCursor;
		}) => {
			if (disposed) {
				return;
			}
			const serverCursor = snapshot.historyCursor;
			if (!serverCursor.lastMessageId) {
				return;
			}

			const localCursor = historyCursorRef.current;
			if (
				localCursor?.lastMessageId &&
				serverCursor.lastMessageId === localCursor.lastMessageId
			) {
				return;
			}

			if (
				localCursor?.lastMessageAt &&
				serverCursor.lastMessageAt &&
				serverCursor.lastMessageAt <= localCursor.lastMessageAt
			) {
				return;
			}

			if (lastGapCursorRef.current === serverCursor.lastMessageId) {
				return;
			}

			if (gapFetchInFlightRef.current) {
				return;
			}

			lastGapCursorRef.current = serverCursor.lastMessageId;

			const afterMessageId = localCursor?.lastMessageId ?? null;
			const fetchPromise = fetchHistoryGap(sessionId, afterMessageId)
				.then((messages) => {
					if (disposed || !isMountedRef.current) {
						return;
					}
					historyGapHandlerRef.current?.(messages);
					const lastMessage = messages[messages.length - 1];
					if (lastMessage) {
						historyCursorRef.current = {
							lastMessageId: lastMessage.id,
							lastMessageAt: lastMessage.createdAt,
						};
					} else {
						historyCursorRef.current = {
							lastMessageId: serverCursor.lastMessageId,
							lastMessageAt: serverCursor.lastMessageAt,
						};
					}
				})
				.catch((error) => {
					if (disposed || !isMountedRef.current) {
						return;
					}
					safeSetState((prev) => ({
						...prev,
						error: error instanceof Error ? error : new Error(String(error)),
					}));
				})
				.finally(() => {
					gapFetchInFlightRef.current = null;
				});

			gapFetchInFlightRef.current = fetchPromise;
		};

		// Process a single session event
		const processEvent = (event: SessionEvent) => {
			switch (event._tag) {
				case "InitialState":
					maybeFetchHistoryGap(event.snapshot);
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

		const interruptFiber = () => {
			if (!fiberRef.current) {
				return;
			}
			const fiber = fiberRef.current;
			fiberRef.current = null;
			Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {
				// Ignore errors during interruption
			});
		};

		// Handle abort signal - interrupt the fiber when aborted
		const handleAbort = () => {
			disposed = true;
			safeSetState((prev) => ({
				...prev,
				isConnected: false,
			}));
			interruptFiber();
		};

		controller?.signal.addEventListener("abort", handleAbort);

		const startSubscription = () => {
			if (disposed || controller?.signal.aborted) {
				return;
			}

			const subscriptionEffect = StreamingChatClient.pipe(
				Effect.flatMap((client) => {
					// Call chat.subscribe RPC - returns a Stream
					// The type assertion is needed due to RPC client typing limitations
					return (client as any)["chat.subscribe"]({
						sessionId,
					}) as Effect.Effect<Stream.Stream<SessionEvent>, unknown, never>;
				}),
				Effect.flatMap((stream) =>
					Stream.runForEach(stream, (event: SessionEvent) =>
						Effect.sync(() => {
							// Check if we should stop processing (abort signal)
							if (controller?.signal.aborted) {
								return;
							}
							processEvent(event);
						}),
					),
				),
			);

			const fiber = forkWithStreamingClient(subscriptionEffect);
			fiberRef.current = fiber;

			Effect.runPromise(Fiber.await(fiber))
				.then((exit) => {
					if (fiberRef.current !== fiber) {
						return;
					}

					if (Exit.isFailure(exit)) {
						if (!Cause.isInterrupted(exit.cause)) {
							const failure = Cause.failureOption(exit.cause);
							if (failure._tag === "Some") {
								if (isReconnectableFailure(failure.value)) {
									safeSetState((prev) => ({
										...prev,
										isConnected: false,
									}));
									return;
								}
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
				})
				.catch((err) => {
					if (!isMountedRef.current) {
						return;
					}
					safeSetState((prev) => ({
						...prev,
						isConnected: false,
						error: err instanceof Error ? err : new Error(String(err)),
					}));
				});
		};

		const restartSubscription = () => {
			if (disposed || controller?.signal.aborted) {
				return;
			}
			resetState();
			interruptFiber();
			startSubscription();
		};

		const unsubscribeConnection = onStreamingConnectionEvent((event) => {
			if (disposed || controller?.signal.aborted) {
				return;
			}
			if (event.status === "disconnected") {
				safeSetState((prev) => ({
					...prev,
					isConnected: false,
				}));
				return;
			}
			if (event.status === "connected" && event.isReconnect) {
				restartSubscription();
			}
		});

		startSubscription();

		return () => {
			isMountedRef.current = false;
			disposed = true;
			// Interrupt fiber on cleanup
			interruptFiber();
			unsubscribeConnection();
			controller?.signal.removeEventListener("abort", handleAbort);
			subscriptionManager.leave(sessionId);
		};
	}, [sessionId, safeSetState]);

	return state;
}

async function fetchHistoryGap(
	sessionId: string,
	afterMessageId?: string | null,
): Promise<ChatMessage[]> {
	const result = await Effect.runPromise(
		ChatClient.pipe(
			Effect.flatMap(
				(client) =>
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(client as any)("chat.getHistory", {
						sessionId,
						afterMessageId: afterMessageId ?? undefined,
					}) as Effect.Effect<{ messages: ChatMessage[] }, unknown, never>,
			),
			Effect.provide(ChatClient.layer),
		),
	);

	return result.messages;
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
