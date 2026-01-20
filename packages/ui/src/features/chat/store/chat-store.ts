/**
 * Global Chat Store
 *
 * Zustand store that manages global chat state across all sessions.
 * Multiple sessions can stream concurrently, and navigation between
 * sessions doesn't interrupt background streams.
 *
 * Architecture:
 * - Server is source of truth for all session state
 * - Store subscribes to SessionEvents via RPC WebSocket
 * - LRU cache keeps recent sessions in memory (max 20)
 * - All tabs sync via RPC subscriptions (no cross-tab coordination needed)
 */

import type {
	ChatMessage,
	QueuedMessage,
	SessionEvent,
	StreamEventToolApprovalRequest,
	ToolApprovalResponse,
} from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { Cause, Effect, Exit, Fiber, Stream } from "effect";
import { createStore } from "zustand/vanilla";
import {
	forkWithStreamingClient,
	getStreamingConnectionState,
	onStreamingConnectionEvent,
	runWithStreamingClient,
	StreamingChatClient,
	waitForStreamingConnection,
} from "@/features/chat/transport/rpc-websocket-client";
import { LRUMap } from "@/lib/lru-map";
import { MessageAccumulator } from "./message-accumulator";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HistoryCursor {
	id: string;
	timestamp: string;
}

/** Tool approval request with metadata for UI rendering */
export interface ToolApprovalRequest {
	toolCallId: string;
	toolName: string;
	input: unknown;
	messageId?: string;
	receivedAt: number;
}

export interface ChatSessionState {
	/** All messages in the session (history + streaming) */
	messages: UIMessage[];
	/** Current session status */
	status: "idle" | "streaming";
	/** Queue of pending messages */
	queue: QueuedMessage[];
	/** Active turn ID (for deduplication) */
	activeTurnId: string | null;
	/** Whether the subscription is connected */
	isConnected: boolean;
	/** Error if any */
	error: Error | null;
	/** Cursor for history pagination */
	historyCursor: HistoryCursor | null;
	/** Whether initial history has been loaded */
	historyLoaded: boolean;
	/** Pending tool approval requests (keyed by toolCallId) */
	pendingApprovalRequests: Map<string, ToolApprovalRequest>;
}

interface SubscriptionState {
	fiber: Fiber.RuntimeFiber<void, unknown> | null;
	accumulator: MessageAccumulator | null;
	connectionId: number;
	unsubscribeConnection: (() => void) | null;
	disposed: boolean;
}

export interface ChatStoreState {
	/** Session states by session ID (LRU cache) */
	sessions: LRUMap<string, ChatSessionState>;
	/** Active subscriptions */
	subscriptions: Map<string, SubscriptionState>;
	/** Session visitors (ref count) */
	visitors: Map<string, number>;
}

export interface SendResult {
	status: "started" | "queued";
	clientMessageId: string;
}

export interface ChatStoreActions {
	/** Start tracking a session (call on mount) */
	visit(sessionId: string): void;
	/** Stop tracking a session (call on unmount) */
	leave(sessionId: string): void;
	/** Send a message to a session. Returns when server acknowledges. */
	send(
		sessionId: string,
		content: string,
		parts?: UIMessage["parts"],
		mode?: "plan" | "build",
	): Promise<SendResult>;
	/** Stop the current stream for a session */
	stop(sessionId: string): Promise<void>;
	/** Remove a message from the queue */
	dequeue(sessionId: string, messageId: string): Promise<boolean>;
	/** Get session state (returns default if not found) */
	getSession(sessionId: string): ChatSessionState;
	/** Set initial history for a session */
	setHistory(sessionId: string, messages: UIMessage[]): void;
	/** Append messages from history gap */
	appendHistoryGap(sessionId: string, messages: ChatMessage[]): void;
	/** Respond to a tool approval request */
	respondToToolApproval(
		sessionId: string,
		response: ToolApprovalResponse,
	): Promise<boolean>;
}

export type ChatStore = ChatStoreState & ChatStoreActions;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_SESSIONS = 20;

const EMPTY_APPROVAL_REQUESTS: Map<string, ToolApprovalRequest> = new Map();

const DEFAULT_SESSION_STATE: ChatSessionState = {
	messages: [],
	status: "idle",
	queue: [],
	activeTurnId: null,
	isConnected: false,
	error: null,
	historyCursor: null,
	historyLoaded: false,
	pendingApprovalRequests: new Map(),
};

// Frozen singleton to return for sessions that don't exist yet
// This prevents infinite re-renders in useStore since the reference is stable
const EMPTY_MESSAGES: UIMessage[] = [];
const EMPTY_QUEUE: QueuedMessage[] = [];
const EMPTY_SESSION_STATE: ChatSessionState = {
	messages: EMPTY_MESSAGES,
	status: "idle",
	queue: EMPTY_QUEUE,
	activeTurnId: null,
	isConnected: false,
	error: null,
	historyCursor: null,
	historyLoaded: false,
	pendingApprovalRequests: EMPTY_APPROVAL_REQUESTS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store Creation
// ─────────────────────────────────────────────────────────────────────────────

export const chatStore = createStore<ChatStore>((set, get) => {
	// Internal helpers
	const getOrCreateSession = (sessionId: string): ChatSessionState => {
		const state = get();
		const existing = state.sessions.get(sessionId);
		if (existing) return existing;

		const newSession = { ...DEFAULT_SESSION_STATE };
		state.sessions.set(sessionId, newSession);
		return newSession;
	};

	const updateSession = (
		sessionId: string,
		updater: (prev: ChatSessionState) => ChatSessionState,
	) => {
		set((state) => {
			const current = state.sessions.get(sessionId);
			if (!current) return state;

			const updated = updater(current);
			state.sessions.set(sessionId, updated);

			// Force re-render by returning a new state reference
			return { ...state };
		});
	};

	const startSubscription = (sessionId: string) => {
		const state = get();
		const existing = state.subscriptions.get(sessionId);
		if (existing && !existing.disposed) {
			return; // Already subscribed
		}

		const subscriptionState: SubscriptionState = {
			fiber: null,
			accumulator: null,
			connectionId: getStreamingConnectionState().connectionId,
			unsubscribeConnection: null,
			disposed: false,
		};

		state.subscriptions.set(sessionId, subscriptionState);

		// Listen for connection events to restart subscription on reconnect
		subscriptionState.unsubscribeConnection = onStreamingConnectionEvent(
			(event) => {
				if (subscriptionState.disposed) return;

				if (event.status === "disconnected") {
					updateSession(sessionId, (prev) => ({
						...prev,
						isConnected: false,
					}));
				} else if (event.status === "connected" && event.isReconnect) {
					// Restart subscription on reconnect
					restartSubscription(sessionId);
				}
			},
		);

		runSubscriptionLoop(sessionId);
	};

	const restartSubscription = (sessionId: string) => {
		const state = get();
		const sub = state.subscriptions.get(sessionId);
		if (!sub || sub.disposed) return;

		// Interrupt current fiber
		if (sub.fiber) {
			const fiber = sub.fiber;
			sub.fiber = null;
			Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
		}

		// Reset accumulator
		sub.accumulator = null;

		// Update connection ID
		sub.connectionId = getStreamingConnectionState().connectionId;

		// Restart
		runSubscriptionLoop(sessionId);
	};

	const runSubscriptionLoop = async (sessionId: string) => {
		const state = get();
		const sub = state.subscriptions.get(sessionId);
		if (!sub || sub.disposed) return;

		while (!sub.disposed) {
			const subscriptionEffect = StreamingChatClient.pipe(
				Effect.flatMap((client) =>
					client.chat
						.subscribe({ sessionId })
						.pipe(
							Stream.runForEach((event) =>
								Effect.sync(() => processSessionEvent(sessionId, event)),
							),
						),
				),
			);

			sub.fiber = forkWithStreamingClient(subscriptionEffect);
			const exit = await Effect.runPromise(Fiber.await(sub.fiber));
			sub.fiber = null;

			if (sub.disposed) return;

			if (Exit.isFailure(exit)) {
				if (Cause.isInterrupted(exit.cause)) {
					return;
				}

				const failure = Cause.failureOption(exit.cause);
				if (failure._tag === "Some" && isReconnectableFailure(failure.value)) {
					// Wait for reconnection
					updateSession(sessionId, (prev) => ({
						...prev,
						isConnected: false,
					}));

					const next = await waitForStreamingConnection(sub.connectionId);
					sub.connectionId = next.connectionId;
					continue;
				}

				// Non-reconnectable error
				const errorValue = failure._tag === "Some" ? failure.value : exit.cause;
				updateSession(sessionId, (prev) => ({
					...prev,
					isConnected: false,
					error:
						errorValue instanceof Error
							? errorValue
							: new Error(String(errorValue)),
				}));
				return;
			}

			// Stream ended normally, wait for reconnection
			const next = await waitForStreamingConnection(sub.connectionId);
			sub.connectionId = next.connectionId;
		}
	};

	const processSessionEvent = (sessionId: string, event: SessionEvent) => {
		const state = get();
		const sub = state.subscriptions.get(sessionId);
		if (!sub || sub.disposed) return;

		switch (event._tag) {
			case "InitialState": {
				// Initialize session state from snapshot
				updateSession(sessionId, (prev) => ({
					...prev,
					queue: event.snapshot.queue as QueuedMessage[],
					status: event.snapshot.status,
					activeTurnId: event.snapshot.activeTurnId,
					isConnected: true,
					error: null,
					historyCursor: event.snapshot.historyCursor.lastMessageId
						? {
								id: event.snapshot.historyCursor.lastMessageId,
								timestamp: event.snapshot.historyCursor.lastMessageAt ?? "",
							}
						: null,
				}));

				// If there's an active turn, create accumulator and process buffer
				if (event.turnContext) {
					sub.accumulator = new MessageAccumulator(event.turnContext.messageId);

					// Process buffered events
					for (const bufferEvent of event.buffer) {
						sub.accumulator.processEvent(bufferEvent);
					}

					// Update messages with accumulated content
					if (sub.accumulator.hasContent()) {
						updateSession(sessionId, (prev) => {
							const streamingMessage = sub.accumulator!.getMessage();
							// Check if we already have this message (from history)
							const existingIdx = prev.messages.findIndex(
								(m) => m.id === streamingMessage.id,
							);
							if (existingIdx >= 0) {
								// Replace existing message with streaming version
								const newMessages = [...prev.messages];
								newMessages[existingIdx] = streamingMessage;
								return { ...prev, messages: newMessages };
							}
							// Append new streaming message
							return {
								...prev,
								messages: [...prev.messages, streamingMessage],
							};
						});
					}
				}
				break;
			}

			case "SessionStarted": {
				// Start new turn
				sub.accumulator = new MessageAccumulator(event.messageId);

				updateSession(sessionId, (prev) => ({
					...prev,
					status: "streaming",
					activeTurnId: event.turnId,
				}));
				break;
			}

			case "SessionStopped": {
				// Finalize the message and reset accumulator
				if (sub.accumulator && sub.accumulator.hasContent()) {
					const finalMessage = sub.accumulator.getMessage();
					updateSession(sessionId, (prev) => {
						const existingIdx = prev.messages.findIndex(
							(m) => m.id === finalMessage.id,
						);
						if (existingIdx >= 0) {
							const newMessages = [...prev.messages];
							newMessages[existingIdx] = finalMessage;
							return {
								...prev,
								messages: newMessages,
								status: "idle",
								activeTurnId: null,
								pendingApprovalRequests: new Map(),
							};
						}
						return {
							...prev,
							messages: [...prev.messages, finalMessage],
							status: "idle",
							activeTurnId: null,
							pendingApprovalRequests: new Map(),
						};
					});
				} else {
					updateSession(sessionId, (prev) => ({
						...prev,
						status: "idle",
						activeTurnId: null,
						pendingApprovalRequests: new Map(),
					}));
				}

				sub.accumulator = null;
				break;
			}

			case "StreamEvent": {
				// Check for tool approval request before processing through accumulator
				const streamEvent = event.event as { type?: string };
				if (streamEvent.type === "tool-approval-request") {
					const approvalEvent = event.event as StreamEventToolApprovalRequest;
					const request: ToolApprovalRequest = {
						toolCallId: approvalEvent.toolCallId,
						toolName: approvalEvent.toolName,
						input: approvalEvent.input,
						messageId: approvalEvent.messageId,
						receivedAt: Date.now(),
					};
					updateSession(sessionId, (prev) => {
						const newPendingRequests = new Map(prev.pendingApprovalRequests);
						newPendingRequests.set(request.toolCallId, request);
						return { ...prev, pendingApprovalRequests: newPendingRequests };
					});
					// Don't pass to accumulator - approval requests are handled separately
					return;
				}

				// Process stream event through accumulator
				const session = state.sessions.get(sessionId);
				if (
					!session ||
					(event.turnId !== session.activeTurnId &&
						session.activeTurnId !== null)
				) {
					return; // Ignore events for old turns
				}

				if (!sub.accumulator) {
					// Late subscriber without SessionStarted - create accumulator
					// This shouldn't happen normally but handle it gracefully
					sub.accumulator = new MessageAccumulator(
						(event.event as { messageId?: string }).messageId ??
							`msg-${Date.now()}`,
					);
				}

				sub.accumulator.processEvent(event.event);

				// Update messages with current accumulated state
				if (sub.accumulator.hasContent()) {
					updateSession(sessionId, (prev) => {
						const streamingMessage = sub.accumulator!.getMessage();
						const existingIdx = prev.messages.findIndex(
							(m) => m.id === streamingMessage.id,
						);
						if (existingIdx >= 0) {
							const newMessages = [...prev.messages];
							newMessages[existingIdx] = streamingMessage;
							return { ...prev, messages: newMessages };
						}
						return { ...prev, messages: [...prev.messages, streamingMessage] };
					});
				}
				break;
			}

			case "MessageQueued": {
				updateSession(sessionId, (prev) => ({
					...prev,
					queue: [...prev.queue, event.message as QueuedMessage],
				}));
				break;
			}

			case "MessageDequeued": {
				updateSession(sessionId, (prev) => ({
					...prev,
					queue: prev.queue.filter((m) => m.id !== event.messageId),
				}));
				break;
			}

			case "UserMessage": {
				// Add user message to messages array (server is source of truth)
				const userMessage: UIMessage = {
					id: event.message.id,
					role: "user",
					parts: event.message.parts
						? (event.message.parts as UIMessage["parts"])
						: [{ type: "text", text: event.message.content }],
				};

				updateSession(sessionId, (prev) => {
					// Check if message already exists (deduplication)
					if (prev.messages.some((m) => m.id === userMessage.id)) {
						return prev;
					}
					return { ...prev, messages: [...prev.messages, userMessage] };
				});
				break;
			}

			case "SessionDeleted": {
				updateSession(sessionId, () => ({
					...DEFAULT_SESSION_STATE,
				}));
				break;
			}
		}
	};

	// const stopSubscription = (sessionId: string) => {
	// 	const state = get();
	// 	const sub = state.subscriptions.get(sessionId);
	// 	if (!sub) return;

	// 	sub.disposed = true;

	// 	if (sub.fiber) {
	// 		const fiber = sub.fiber;
	// 		sub.fiber = null;
	// 		Effect.runPromise(Fiber.interrupt(fiber)).catch(() => {});
	// 	}

	// 	if (sub.unsubscribeConnection) {
	// 		sub.unsubscribeConnection();
	// 		sub.unsubscribeConnection = null;
	// 	}

	// 	state.subscriptions.delete(sessionId);
	// };

	return {
		// State
		sessions: new LRUMap<string, ChatSessionState>(MAX_SESSIONS),
		subscriptions: new Map(),
		visitors: new Map(),

		// Actions
		visit(sessionId: string) {
			const state = get();
			const currentCount = state.visitors.get(sessionId) ?? 0;
			state.visitors.set(sessionId, currentCount + 1);

			// Ensure session exists
			getOrCreateSession(sessionId);

			// Start subscription if first visitor
			if (currentCount === 0) {
				startSubscription(sessionId);
			}
		},

		leave(sessionId: string) {
			const state = get();
			const currentCount = state.visitors.get(sessionId) ?? 0;

			if (currentCount <= 1) {
				state.visitors.delete(sessionId);
				// Don't stop subscription immediately - keep it alive in LRU cache
				// This allows quick navigation back without re-subscribing
				// Subscription will be stopped when evicted from LRU
			} else {
				state.visitors.set(sessionId, currentCount - 1);
			}
		},

		async send(
			sessionId: string,
			content: string,
			parts?: UIMessage["parts"],
			mode?: "plan" | "build",
		): Promise<{ status: "started" | "queued"; clientMessageId: string }> {
			const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;

			// Extract file parts for the RPC call
			const fileParts = parts
				?.filter(
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
						typeof (p as { mediaType?: unknown }).mediaType === "string" &&
						"url" in p &&
						typeof (p as { url?: unknown }).url === "string",
				)
				.map((p) => ({
					type: "file" as const,
					mediaType: p.mediaType,
					url: p.url,
					...(p.filename ? { filename: p.filename } : {}),
				}));

			// Send via RPC - no optimistic update, wait for UserMessage event
			const result = await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						client.chat.send({
							sessionId,
							content,
							clientMessageId,
							...(fileParts && fileParts.length > 0
								? { parts: fileParts }
								: {}),
							...(mode ? { mode } : {}),
						}),
					),
				),
			);

			return {
				status: result.status as "started" | "queued",
				clientMessageId,
			};
		},

		async stop(sessionId: string) {
			await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						client.chat.interrupt({
							sessionId,
						}),
					),
				),
			);
		},

		async dequeue(sessionId: string, messageId: string): Promise<boolean> {
			const result = await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						client.chat.dequeue({
							sessionId,
							messageId,
						}),
					),
				),
			);
			return result.removed;
		},

		getSession(sessionId: string) {
			const state = get();
			// Return frozen singleton for non-existent sessions to prevent infinite re-renders
			return state.sessions.get(sessionId) ?? EMPTY_SESSION_STATE;
		},

		setHistory(sessionId: string, messages: UIMessage[]) {
			updateSession(sessionId, (prev) => {
				// If already streaming, merge with existing messages
				if (prev.status === "streaming" && prev.messages.length > 0) {
					// Keep streaming messages, prepend history
					const streamingMessages = prev.messages.filter(
						(m) => !messages.some((h) => h.id === m.id),
					);
					return {
						...prev,
						messages: [...messages, ...streamingMessages],
						historyLoaded: true,
					};
				}
				return {
					...prev,
					messages,
					historyLoaded: true,
				};
			});
		},

		appendHistoryGap(sessionId: string, gapMessages: ChatMessage[]) {
			if (gapMessages.length === 0) return;

			updateSession(sessionId, (prev) => {
				// Convert ChatMessage to UIMessage
				const uiMessages: UIMessage[] = gapMessages.map((m) => ({
					id: m.id,
					role: m.role,
					parts: m.parts as UIMessage["parts"],
					...(m.metadata ? { metadata: m.metadata } : {}),
				}));

				// Find insertion point - after last known message, before streaming
				const existingIds = new Set(prev.messages.map((m) => m.id));
				const newMessages = uiMessages.filter((m) => !existingIds.has(m.id));

				if (newMessages.length === 0) return prev;

				// Insert before any streaming assistant message
				const lastHistoryIdx = prev.messages.findLastIndex(
					(m) => m.role === "user" || m.role === "assistant",
				);
				const insertIdx = lastHistoryIdx + 1;

				const combined = [
					...prev.messages.slice(0, insertIdx),
					...newMessages,
					...prev.messages.slice(insertIdx),
				];

				// Update history cursor
				// Note: lastGapMessage is guaranteed to exist because we check
				// gapMessages.length === 0 at the top of the function
				const lastGapMessage = gapMessages[gapMessages.length - 1]!;
				return {
					...prev,
					messages: combined,
					historyCursor: {
						id: lastGapMessage.id,
						timestamp: lastGapMessage.createdAt,
					},
				};
			});
		},

		async respondToToolApproval(
			sessionId: string,
			response: ToolApprovalResponse,
		): Promise<boolean> {
			// Remove from pending requests immediately (optimistic)
			updateSession(sessionId, (prev) => {
				const newPendingRequests = new Map(prev.pendingApprovalRequests);
				newPendingRequests.delete(response.toolCallId);
				return { ...prev, pendingApprovalRequests: newPendingRequests };
			});

			// Send response via RPC
			const result = await runWithStreamingClient(
				StreamingChatClient.pipe(
					Effect.flatMap((client) =>
						client.chat.respondToToolApproval({
							sessionId,
							response,
						}),
					),
				),
			);
			return result.acknowledged;
		},
	};
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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
