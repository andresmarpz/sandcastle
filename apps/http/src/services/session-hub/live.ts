import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import {
	ChatOperationRpcError,
	ChatSessionNotFoundRpcError,
	DequeueResult,
	InterruptResult,
	SendMessageResult,
} from "@sandcastle/rpc";
import type {
	ChatMessage,
	ChatStreamEvent,
	MessagePart,
	QueuedMessage,
	SessionEvent,
	SessionSnapshot,
} from "@sandcastle/schemas";
import { StorageService, StorageServiceDefault } from "@sandcastle/storage";
import { Effect, Fiber, Layer, Mailbox, PubSub, Ref, Stream } from "effect";
import {
	ClaudeCodeAgentAdapter,
	type ClaudeMessageAccumulator,
	createStreamState,
	type MessageAccumulator,
	processMessageDual,
	type SessionMetadata,
	type StreamState,
} from "../../adapters/claude";
import {
	ClaudeSDKService,
	ClaudeSDKServiceLive,
	type QueryHandle,
} from "../../agents/claude";
import { SessionHub, type SessionHubInterface } from "./service";
import type {
	ActiveTurnContext,
	HistoryCursor as HistoryCursorType,
	SessionState,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Structured Logging
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = "INFO" | "WARN" | "ERROR";

interface LogContext {
	sessionId?: string;
	turnId?: string;
	error?: { type: string; message: string };
	reason?: string;
	[key: string]: unknown;
}

const structuredLog = (
	level: LogLevel,
	event: string,
	context: LogContext = {},
): void => {
	const logEntry = {
		timestamp: new Date().toISOString(),
		level,
		event,
		...context,
	};
	const logFn = level === "ERROR" ? console.error : console.log;
	logFn(JSON.stringify(logEntry));
};

// ─────────────────────────────────────────────────────────────────────────────
// State Factory
// ─────────────────────────────────────────────────────────────────────────────

const createSessionState = (
	initialCursor?: HistoryCursorType,
	claudeSessionId?: string | null,
): Effect.Effect<SessionState> =>
	Effect.gen(function* () {
		const pubsub = yield* PubSub.unbounded<SessionEvent>();
		const statusRef = yield* Ref.make<"idle" | "streaming">("idle");
		const activeTurnIdRef = yield* Ref.make<string | null>(null);
		const bufferRef = yield* Ref.make<ChatStreamEvent[]>([]);
		const queueRef = yield* Ref.make<QueuedMessage[]>([]);
		const historyCursorRef = yield* Ref.make<HistoryCursorType>(
			initialCursor ?? { lastMessageId: null, lastMessageAt: null },
		);
		const fiberRef = yield* Ref.make<Fiber.RuntimeFiber<void, never> | null>(
			null,
		);
		const queryHandleRef = yield* Ref.make<QueryHandle | null>(null);
		const accumulatorRef = yield* Ref.make<MessageAccumulator<
			SDKMessage,
			SessionMetadata
		> | null>(null);
		const streamStateRef = yield* Ref.make<StreamState>(createStreamState());
		const claudeSessionIdRef = yield* Ref.make<string | null>(
			claudeSessionId ?? null,
		);
		const activeTurnContextRef = yield* Ref.make<ActiveTurnContext | null>(
			null,
		);

		return {
			pubsub,
			statusRef,
			activeTurnIdRef,
			bufferRef,
			queueRef,
			historyCursorRef,
			fiberRef,
			queryHandleRef,
			accumulatorRef,
			streamStateRef,
			claudeSessionIdRef,
			activeTurnContextRef,
		} satisfies SessionState;
	});

// ─────────────────────────────────────────────────────────────────────────────
// SessionHub Implementation
// ─────────────────────────────────────────────────────────────────────────────

export const makeSessionHub = Effect.gen(function* () {
	const storage = yield* StorageService;
	const claudeSDK = yield* ClaudeSDKService;

	// Map of sessionId -> SessionState (in-memory)
	const sessionsRef = yield* Ref.make<Map<string, SessionState>>(new Map());

	// ─── Helper: Get or Create Session State ─────────────────────────────────

	const getOrCreateSession = (
		sessionId: string,
	): Effect.Effect<SessionState, ChatSessionNotFoundRpcError> =>
		Effect.gen(function* () {
			// First check if already exists
			const sessions = yield* Ref.get(sessionsRef);
			const existing = sessions.get(sessionId);
			if (existing) return existing;

			// Load session from storage (also verifies it exists)
			const storedSession = yield* storage.sessions
				.get(sessionId)
				.pipe(
					Effect.mapError(() => new ChatSessionNotFoundRpcError({ sessionId })),
				);

			// Load history cursor from storage
			const cursor = yield* storage.cursors
				.get(sessionId)
				.pipe(Effect.catchAll(() => Effect.succeed(null)));

			// Create new session state with claudeSessionId from storage
			const newState = yield* createSessionState(
				cursor
					? {
							lastMessageId: cursor.lastMessageId,
							lastMessageAt: cursor.lastMessageAt,
						}
					: undefined,
				storedSession.claudeSessionId,
			);

			structuredLog("INFO", "get_or_create_result", { cursor, newState });

			// Atomically add to map (check again in case of race)
			const result = yield* Ref.modify(sessionsRef, (m) => {
				const raceExisting = m.get(sessionId);
				if (raceExisting) {
					return [raceExisting, m] as const;
				}
				const updated = new Map(m);
				updated.set(sessionId, newState);
				return [newState, updated] as const;
			});

			return result;
		});

	// ─── Helper: Broadcast Event ─────────────────────────────────────────────

	const broadcast = (session: SessionState, event: SessionEvent) =>
		Effect.gen(function* () {
			structuredLog("INFO", "broadcast_publishing", {
				eventTag: event._tag,
			});
			const result = yield* PubSub.publish(session.pubsub, event);
			structuredLog("INFO", "broadcast_published", {
				eventTag: event._tag,
				result,
			});
			return result;
		});

	// ─── Helper: Reset Session to Idle ───────────────────────────────────────

	const resetToIdle = (session: SessionState) =>
		Effect.all([
			Ref.set(session.statusRef, "idle" as const),
			Ref.set(session.activeTurnIdRef, null),
			Ref.set(session.bufferRef, []),
			Ref.set(session.fiberRef, null),
			Ref.set(session.queryHandleRef, null),
			Ref.set(session.accumulatorRef, null),
			Ref.set(session.streamStateRef, createStreamState()),
			Ref.set(session.activeTurnContextRef, null),
		]);

	// ─── Helper: Auto-Dequeue ────────────────────────────────────────────────

	const autoDequeue = (
		session: SessionState,
		sessionId: string,
	): Effect.Effect<void, never> =>
		Effect.gen(function* () {
			const queue = yield* Ref.get(session.queueRef);
			if (queue.length === 0) return;

			// Take first message from queue
			const nextMessage = queue[0];
			if (!nextMessage) return;

			const remainingQueue = queue.slice(1);
			yield* Ref.set(session.queueRef, remainingQueue);

			// Broadcast dequeue event
			yield* broadcast(session, {
				_tag: "MessageDequeued",
				messageId: nextMessage.id,
			});

			// Process as new message - need to call startStreaming directly
			yield* startStreaming(
				session,
				sessionId,
				nextMessage.content,
				nextMessage.clientMessageId ?? nextMessage.id,
				nextMessage.parts,
			);
		}).pipe(Effect.catchAll(() => Effect.void));

	// ─── Helper: On Stream Complete ──────────────────────────────────────────

	const onStreamComplete = (
		session: SessionState,
		turnId: string,
		sessionId: string,
		reason: "completed" | "interrupted" | "error",
	): Effect.Effect<void, never> =>
		Effect.gen(function* () {
			// Log turn completion with reason
			structuredLog("INFO", "turn_completed", {
				sessionId,
				turnId,
				reason,
			});

			const accumulator = yield* Ref.get(session.accumulatorRef);

			// 1. Persist accumulated messages
			if (accumulator) {
				const messages = accumulator.getMessages() as ChatMessage[];
				if (messages.length > 0) {
					yield* storage.chatMessages
						.createMany(
							messages.map((msg, index) => ({
								id: msg.id,
								sessionId,
								role: msg.role,
								parts: msg.parts,
								turnId,
								seq: index,
								metadata: msg.metadata,
							})),
						)
						.pipe(
							Effect.catchAll((error) =>
								Effect.sync(() => {
									structuredLog("ERROR", "messages_persist_failed", {
										sessionId,
										turnId,
										error: {
											type:
												error instanceof Error
													? error.constructor.name
													: "UnknownError",
											message:
												error instanceof Error ? error.message : String(error),
										},
									});
									return [];
								}),
							),
						);

					// 2. Update history cursor
					const lastMessage = messages[messages.length - 1];
					if (lastMessage) {
						yield* storage.cursors
							.upsert(sessionId, lastMessage.id, lastMessage.createdAt)
							.pipe(Effect.catchAll(() => Effect.void));

						yield* Ref.set(session.historyCursorRef, {
							lastMessageId: lastMessage.id,
							lastMessageAt: lastMessage.createdAt,
						});
					}
				}

				// 3. Update session usage stats from accumulator
				// Note: claudeSessionId is persisted immediately when captured from init message
				const metadata = accumulator.getSessionMetadata();
				if (metadata) {
					yield* storage.sessions
						.update(sessionId, {
							totalCostUsd: metadata.totalCostUsd,
							inputTokens: metadata.inputTokens,
							outputTokens: metadata.outputTokens,
						})
						.pipe(Effect.catchAll(() => Effect.void));
				}

				// Update in-memory ref if we have a session ID from metadata
				const claudeSessionId =
					metadata?.claudeSessionId ??
					(accumulator as ClaudeMessageAccumulator).getClaudeSessionId();
				if (claudeSessionId) {
					yield* Ref.set(session.claudeSessionIdRef, claudeSessionId);
				}
			}

			// 4. Complete turn in storage
			yield* storage.turns
				.complete(turnId, reason)
				.pipe(Effect.catchAll(() => Effect.void));

			// 5. Broadcast SessionStopped
			yield* broadcast(session, {
				_tag: "SessionStopped",
				turnId,
				reason,
			});

			// 6. Reset session state
			yield* resetToIdle(session);

			// 7. Auto-dequeue next message
			yield* autoDequeue(session, sessionId);
		}).pipe(Effect.catchAll(() => Effect.void));

	// ─── Helper: Process Stream ──────────────────────────────────────────────

	const processStream = (
		session: SessionState,
		queryHandle: QueryHandle,
		turnId: string,
		sessionId: string,
	): Effect.Effect<void, never> => {
		// Sync log to verify function is called
		structuredLog("INFO", "process_stream_effect_created", {
			sessionId,
			turnId,
		});

		return Effect.gen(function* () {
			const adapterConfig = { generateId: () => crypto.randomUUID() };

			structuredLog("INFO", "process_stream_started", {
				sessionId,
				turnId,
			});

			let messageCount = 0;

			// Process SDK stream
			yield* queryHandle.stream.pipe(
				Stream.tap((message: SDKMessage) =>
					Effect.gen(function* () {
						messageCount++;
						structuredLog("INFO", "sdk_message_received", {
							sessionId,
							turnId,
							messageCount,
							messageType: message.type,
							messageSubtype:
								"subtype" in message ? (message.subtype as string) : undefined,
						});

						const accumulator = yield* Ref.get(session.accumulatorRef);
						if (!accumulator) {
							structuredLog("WARN", "accumulator_missing", {
								sessionId,
								turnId,
								messageCount,
							});
							return;
						}

						const currentState = yield* Ref.get(session.streamStateRef);

						// Process through adapter (both streaming and accumulation)
						const { events, newState } = processMessageDual(
							message,
							currentState,
							adapterConfig,
							accumulator,
						);

						structuredLog("INFO", "adapter_processed", {
							sessionId,
							turnId,
							messageCount,
							eventsGenerated: events.length,
							eventTypes: events.map((e) => e.type),
						});

						yield* Ref.set(session.streamStateRef, newState);

						// Update Claude session ID if available
						if (
							message.type === "system" &&
							"subtype" in message &&
							message.subtype === "init" &&
							"session_id" in message
						) {
							const claudeSessionId = message.session_id as string;
							structuredLog("INFO", "claude_session_id_captured", {
								sessionId,
								turnId,
								claudeSessionId,
							});
							yield* Ref.set(session.claudeSessionIdRef, claudeSessionId);

							// Persist immediately to database so it survives restarts/interrupts
							yield* storage.sessions
								.update(sessionId, { claudeSessionId })
								.pipe(Effect.catchAll(() => Effect.void));
						}

						// Buffer events and broadcast
						for (const event of events) {
							yield* Ref.update(session.bufferRef, (b) => [...b, event]);
							yield* broadcast(session, {
								_tag: "StreamEvent",
								turnId,
								event,
							});
						}
					}),
				),
				Stream.runDrain,
			);

			structuredLog("INFO", "process_stream_completed", {
				sessionId,
				turnId,
				totalMessages: messageCount,
			});

			// Stream completed successfully
			yield* onStreamComplete(session, turnId, sessionId, "completed");
		}).pipe(
			Effect.onInterrupt(() =>
				Effect.sync(() => {
					structuredLog("WARN", "process_stream_fiber_interrupted", {
						sessionId,
						turnId,
					});
				}),
			),
			// Handle stream errors
			Effect.catchAll((error) =>
				Effect.gen(function* () {
					const activeTurnId = yield* Ref.get(session.activeTurnIdRef);

					// Log stream error with context
					structuredLog("ERROR", "stream_error", {
						sessionId,
						turnId: activeTurnId ?? undefined,
						error: {
							type:
								error instanceof Error
									? error.constructor.name
									: "UnknownError",
							message: error instanceof Error ? error.message : String(error),
						},
					});
					// Log stack trace separately for debugging
					if (error instanceof Error && error.stack) {
						console.error("Stack trace:", error.stack);
					}

					if (activeTurnId) {
						yield* onStreamComplete(session, activeTurnId, sessionId, "error");
					} else {
						yield* resetToIdle(session);
					}
				}),
			),
		);
	};

	// ─── Helper: Start Streaming ─────────────────────────────────────────────

	const startStreaming = (
		session: SessionState,
		sessionId: string,
		content: string,
		clientMessageId: string,
		parts?: readonly MessagePart[],
	): Effect.Effect<SendMessageResult, ChatOperationRpcError> =>
		Effect.gen(function* () {
			const messageId = crypto.randomUUID();

			// 1. Create turn in storage first to get the actual turn ID
			const turn = yield* storage.turns.create({ sessionId }).pipe(
				Effect.mapError(
					(e) =>
						new ChatOperationRpcError({
							message: `Failed to create turn: ${e._tag}`,
							code: "TURN_CREATE_ERROR",
						}),
				),
			);
			const turnId = turn.id;

			structuredLog("INFO", "start_streaming_begin", {
				sessionId,
				turnId,
				messageId,
				clientMessageId,
				contentLength: content.length,
			});

			yield* Ref.set(session.statusRef, "streaming");
			yield* Ref.set(session.activeTurnIdRef, turnId);
			yield* Ref.set(session.bufferRef, []);
			yield* Ref.set(session.streamStateRef, createStreamState());

			// 2. Persist user message
			yield* storage.chatMessages
				.create({
					id: messageId,
					sessionId,
					role: "user",
					parts: parts ?? [{ type: "text", text: content }],
				})
				.pipe(
					Effect.mapError(
						(e) =>
							new ChatOperationRpcError({
								message: `Failed to save user message: ${e._tag}`,
								code: "MESSAGE_CREATE_ERROR",
							}),
					),
				);

			// 3. Broadcast UserMessage and SessionStarted
			yield* broadcast(session, {
				_tag: "UserMessage",
				message: { id: messageId, content, parts, clientMessageId },
			});
			yield* broadcast(session, {
				_tag: "SessionStarted",
				turnId,
				messageId,
			});

			// 3b. Store turn context for late subscriber catch-up
			yield* Ref.set(session.activeTurnContextRef, {
				turnId,
				messageId,
				content,
				clientMessageId,
				...(parts && parts.length > 0 ? { parts } : {}),
			});

			// 4. Get session's working path for Claude SDK
			const dbSession = yield* storage.sessions.get(sessionId).pipe(
				Effect.mapError(
					() =>
						new ChatOperationRpcError({
							message: "Session not found in storage",
							code: "SESSION_NOT_FOUND",
						}),
				),
			);

			// 5. Start Claude stream
			const claudeSessionId = yield* Ref.get(session.claudeSessionIdRef);
			const queryHandle = yield* claudeSDK
				.query(content, {
					cwd: dbSession.workingPath,
					resume: claudeSessionId ?? undefined,
					permissionMode: "bypassPermissions",
				})
				.pipe(
					Effect.tapError((e) =>
						Effect.sync(() => {
							structuredLog("ERROR", "sdk_initialization_error", {
								sessionId,
								turnId,
								error: {
									type: e.constructor.name,
									message: e.message,
								},
							});
						}),
					),
					Effect.mapError(
						(e) =>
							new ChatOperationRpcError({
								message: `Claude SDK error: ${e.message}`,
								code: "CLAUDE_SDK_ERROR",
							}),
					),
				);

			yield* Ref.set(session.queryHandleRef, queryHandle);

			structuredLog("INFO", "claude_sdk_query_started", {
				sessionId,
				turnId,
				resumeSessionId: claudeSessionId ?? undefined,
			});

			// 6. Create accumulator for persistence
			const accumulator = ClaudeCodeAgentAdapter.createAccumulator({
				generateId: () => crypto.randomUUID(),
				storageSessionId: sessionId,
			});
			yield* Ref.set(session.accumulatorRef, accumulator);

			// 7. Fork stream processing fiber (use forkDaemon so it's not tied to request scope)
			structuredLog("INFO", "forking_stream_fiber", {
				sessionId,
				turnId,
			});

			const fiber = yield* Effect.forkDaemon(
				processStream(session, queryHandle, turnId, sessionId),
			);
			yield* Ref.set(session.fiberRef, fiber);

			structuredLog("INFO", "stream_fiber_forked", {
				sessionId,
				turnId,
				fiberId: fiber.id().toString(),
			});

			return new SendMessageResult({
				status: "started",
				messageId,
			});
		});

	// ─── Service Implementation ──────────────────────────────────────────────

	const service: SessionHubInterface = {
		sendMessage: (sessionId, content, clientMessageId, parts) =>
			Effect.gen(function* () {
				structuredLog("INFO", "send_message_begin", {
					sessionId,
					clientMessageId,
					contentLength: content.length,
				});

				const session = yield* getOrCreateSession(sessionId);

				structuredLog("INFO", "send_message_session_acquired", { sessionId });

				// Atomic status check
				const wasStreaming = yield* Ref.modify(session.statusRef, (status) => {
					if (status === "streaming") {
						return [true, status] as const;
					}
					// Don't transition yet - startStreaming will do it
					return [false, status] as const;
				});

				structuredLog("INFO", "send_message_status_check", {
					sessionId,
					wasStreaming,
				});

				if (wasStreaming) {
					// Queue the message
					const queuedMessage: QueuedMessage = {
						id: crypto.randomUUID(),
						content,
						parts: parts ? [...parts] : undefined,
						queuedAt: new Date().toISOString(),
						clientMessageId,
					};

					yield* Ref.update(session.queueRef, (q) => [...q, queuedMessage]);

					// Broadcast MessageQueued event
					yield* broadcast(session, {
						_tag: "MessageQueued",
						message: queuedMessage,
					});

					return new SendMessageResult({
						status: "queued",
						queuedMessage,
					});
				}

				// Start streaming
				return yield* startStreaming(
					session,
					sessionId,
					content,
					clientMessageId,
					parts,
				);
			}),

		subscribe: (sessionId) =>
			Effect.gen(function* () {
				structuredLog("INFO", "subscribe_begin", { sessionId });

				const session = yield* getOrCreateSession(sessionId);

				structuredLog("INFO", "subscribe_session_acquired", { sessionId });

				// Create mailbox for this subscriber
				const mailbox = yield* Mailbox.make<SessionEvent>();

				// Capture current state for InitialState
				const status = yield* Ref.get(session.statusRef);
				const activeTurnId = yield* Ref.get(session.activeTurnIdRef);
				const queue = yield* Ref.get(session.queueRef);
				const historyCursor = yield* Ref.get(session.historyCursorRef);
				const buffer = yield* Ref.get(session.bufferRef);
				const turnContext = yield* Ref.get(session.activeTurnContextRef);

				const initialState: SessionEvent = {
					_tag: "InitialState",
					snapshot: {
						status,
						activeTurnId,
						queue: [...queue],
						historyCursor,
					},
					buffer: [...buffer],
					...(turnContext ? { turnContext } : {}),
				};

				structuredLog("INFO", "subscribe_initial_state", {
					sessionId,
					status,
					activeTurnId,
					queueLength: queue.length,
					bufferLength: buffer.length,
					hasTurnContext: turnContext !== null,
				});

				// Send initial state
				yield* mailbox.offer(initialState);

				structuredLog("INFO", "subscribe_initial_state_sent", { sessionId });

				// Subscribe to PubSub and forward events to mailbox
				const fiber = yield* Stream.fromPubSub(session.pubsub).pipe(
					Stream.tap((event) =>
						Effect.sync(() => {
							structuredLog("INFO", "pubsub_event_received", {
								sessionId,
								eventTag: event._tag,
							});
						}),
					),
					Stream.runForEach((event) =>
						Effect.gen(function* () {
							structuredLog("INFO", "forwarding_to_mailbox", {
								sessionId,
								eventTag: event._tag,
							});
							yield* mailbox.offer(event);
							structuredLog("INFO", "forwarded_to_mailbox", {
								sessionId,
								eventTag: event._tag,
							});
						}),
					),
					Effect.onInterrupt(() =>
						Effect.sync(() => {
							structuredLog("WARN", "pubsub_subscription_interrupted", {
								sessionId,
							});
						}),
					),
					Effect.ensuring(
						Effect.sync(() => {
							structuredLog("INFO", "pubsub_subscription_ended", {
								sessionId,
							});
						}),
					),
					Effect.forkScoped, // Runs until subscriber disconnects
				);

				structuredLog("INFO", "subscribe_pubsub_forked", {
					sessionId,
				});

				return mailbox;
			}),

		interrupt: (sessionId) =>
			Effect.gen(function* () {
				const session = yield* getOrCreateSession(sessionId);

				const status = yield* Ref.get(session.statusRef);
				if (status === "idle") {
					return new InterruptResult({ interrupted: false });
				}

				// 1. Get the running fiber and query handle
				const fiber = yield* Ref.get(session.fiberRef);
				const queryHandle = yield* Ref.get(session.queryHandleRef);
				const turnId = yield* Ref.get(session.activeTurnIdRef);

				// Log interrupt operation
				structuredLog("WARN", "session_interrupted", {
					sessionId,
					turnId: turnId ?? undefined,
				});

				// 2. Interrupt Claude SDK (graceful)
				if (queryHandle) {
					yield* queryHandle.interrupt.pipe(Effect.ignore);
				}

				// 3. Interrupt the processing fiber
				if (fiber) {
					yield* Fiber.interrupt(fiber);
				}

				// 4. Save partial progress and cleanup
				if (turnId) {
					yield* onStreamComplete(session, turnId, sessionId, "interrupted");
				} else {
					yield* resetToIdle(session);
				}

				return new InterruptResult({ interrupted: true });
			}),

		dequeueMessage: (sessionId, messageId) =>
			Effect.gen(function* () {
				const session = yield* getOrCreateSession(sessionId);

				const removed = yield* Ref.modify(
					session.queueRef,
					(queue): [boolean, QueuedMessage[]] => {
						const index = queue.findIndex((m) => m.id === messageId);
						if (index === -1) {
							return [false, queue];
						}
						const newQueue: QueuedMessage[] = [
							...queue.slice(0, index),
							...queue.slice(index + 1),
						];
						return [true, newQueue];
					},
				);

				if (removed) {
					yield* broadcast(session, {
						_tag: "MessageDequeued",
						messageId,
					});
				}

				return new DequeueResult({ removed });
			}),

		getState: (sessionId) =>
			Effect.gen(function* () {
				const session = yield* getOrCreateSession(sessionId);

				const status = yield* Ref.get(session.statusRef);
				const activeTurnId = yield* Ref.get(session.activeTurnIdRef);
				const queue = yield* Ref.get(session.queueRef);
				const historyCursor = yield* Ref.get(session.historyCursorRef);

				return {
					status,
					activeTurnId,
					queue: [...queue],
					historyCursor,
				} satisfies SessionSnapshot;
			}),

		deleteSession: (sessionId) =>
			Effect.gen(function* () {
				// Check if session exists in hub (if not, this is a no-op)
				const sessions = yield* Ref.get(sessionsRef);
				const session = sessions.get(sessionId);

				if (!session) {
					// Session not in hub - nothing to clean up
					return;
				}

				// 1. Broadcast SessionDeleted to all subscribers
				yield* broadcast(session, {
					_tag: "SessionDeleted",
					sessionId,
				});

				// 2. Interrupt any active stream
				const status = yield* Ref.get(session.statusRef);
				if (status === "streaming") {
					const fiber = yield* Ref.get(session.fiberRef);
					const queryHandle = yield* Ref.get(session.queryHandleRef);

					// Interrupt Claude SDK (graceful)
					if (queryHandle) {
						yield* queryHandle.interrupt.pipe(Effect.ignore);
					}

					// Interrupt the processing fiber
					if (fiber) {
						yield* Fiber.interrupt(fiber);
					}
				}

				// 3. Remove session from in-memory map
				yield* Ref.update(sessionsRef, (m) => {
					const updated = new Map(m);
					updated.delete(sessionId);
					return updated;
				});
			}),

		shutdown: () =>
			Effect.gen(function* () {
				structuredLog("INFO", "session_hub_shutdown_started", {});

				const sessions = yield* Ref.get(sessionsRef);
				const sessionIds = Array.from(sessions.keys());
				let interruptedCount = 0;

				structuredLog("INFO", "session_hub_shutdown_sessions", {
					totalSessions: sessionIds.length,
				});

				// Interrupt all streaming sessions in parallel with timeout protection
				const interruptEffects = sessionIds.map((sessionId) =>
					Effect.gen(function* () {
						const session = sessions.get(sessionId);
						if (!session) return false;

						const status = yield* Ref.get(session.statusRef);
						if (status !== "streaming") return false;

						// Get the running fiber and query handle
						const fiber = yield* Ref.get(session.fiberRef);
						const queryHandle = yield* Ref.get(session.queryHandleRef);
						const turnId = yield* Ref.get(session.activeTurnIdRef);

						structuredLog("INFO", "session_hub_shutdown_interrupting", {
							sessionId,
							turnId: turnId ?? undefined,
						});

						// Interrupt Claude SDK (graceful)
						if (queryHandle) {
							yield* queryHandle.interrupt.pipe(Effect.ignore);
						}

						// Interrupt the processing fiber
						if (fiber) {
							yield* Fiber.interrupt(fiber);
						}

						// Save partial progress
						if (turnId) {
							yield* onStreamComplete(
								session,
								turnId,
								sessionId,
								"interrupted",
							);
						}

						return true;
					}).pipe(
						// Add timeout protection per session (5 seconds)
						Effect.timeout("5 seconds"),
						Effect.catchAll(() => Effect.succeed(false)),
					),
				);

				const results = yield* Effect.all(interruptEffects, {
					concurrency: "unbounded",
				});
				interruptedCount = results.filter((r) => r === true).length;

				structuredLog("INFO", "session_hub_shutdown_complete", {
					interruptedSessions: interruptedCount,
					totalSessions: sessionIds.length,
				});
			}),
	};

	// Register shutdown as a finalizer - runs when the scope closes (server shutdown)
	yield* Effect.addFinalizer(() => service.shutdown());

	return service;
});

export const SessionHubLive = Layer.scoped(SessionHub, makeSessionHub).pipe(
	Layer.provide(StorageServiceDefault),
	Layer.provide(ClaudeSDKServiceLive),
);
