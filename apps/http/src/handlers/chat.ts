import {
	ChatRpc,
	ChatRpcError,
	ChatSessionNotFoundRpcError,
	type ChatStreamEvent,
	DatabaseRpcError,
	SequencedEvent,
	SessionBusyRpcError,
	SessionSnapshotEvent,
	SessionStateEvent,
	StreamEventError,
	type StreamingStatus,
	UserMessageEvent,
} from "@sandcastle/rpc";
import {
	type DatabaseError,
	type SessionNotFoundError,
	StorageService,
	StorageServiceDefault,
	type WorktreeNotFoundError,
} from "@sandcastle/storage";
import {
	type MessagePart,
	TextPart,
	ToolCallPart,
} from "@sandcastle/storage/entities";
import {
	type Context,
	Effect,
	Fiber,
	Layer,
	Option,
	Ref,
	Stream,
} from "effect";
import { type AdapterConfig, adaptSDKStreamToEvents } from "../adapters/claude";
import {
	type ClaudeSDKError,
	ClaudeSDKService,
	ClaudeSDKServiceLive,
	type QueryOptions,
} from "../agents/claude";
import {
	type ActiveSession,
	ActiveSessionsService,
	type ActiveSessionsServiceInterface,
	ActiveSessionsServiceLive,
} from "../services/active-sessions";

// ─── Error Mapping ───────────────────────────────────────────

const mapDatabaseError = (error: DatabaseError): DatabaseRpcError =>
	new DatabaseRpcError({ operation: error.operation, message: error.message });

const mapSessionNotFoundError = (
	error: SessionNotFoundError | WorktreeNotFoundError | DatabaseError,
): ChatSessionNotFoundRpcError | DatabaseRpcError => {
	if (
		error._tag === "SessionNotFoundError" ||
		error._tag === "WorktreeNotFoundError"
	) {
		return new ChatSessionNotFoundRpcError({
			sessionId: error.id,
		});
	}
	return mapDatabaseError(error);
};

const mapClaudeError = (error: ClaudeSDKError): ChatRpcError =>
	new ChatRpcError({
		message: error.message,
		code: "CLAUDE_SDK_ERROR",
	});

// ─── Message Accumulation ────────────────────────────────────

interface AccumulatedMessage {
	parts: MessagePart[];
	currentText: { id: string; content: string } | null;
	messageId: string | null;
	claudeSessionId: string | null;
	metadata: {
		costUsd?: number;
		inputTokens?: number;
		outputTokens?: number;
	};
}

function createAccumulator(): AccumulatedMessage {
	return {
		parts: [],
		currentText: null,
		messageId: null,
		claudeSessionId: null,
		metadata: {},
	};
}

function accumulateEvent(
	acc: AccumulatedMessage,
	event: ChatStreamEvent,
): AccumulatedMessage {
	switch (event.type) {
		case "start":
			return {
				...acc,
				messageId: event.messageId,
				claudeSessionId: event.claudeSessionId ?? null,
			};

		case "text-start":
			return {
				...acc,
				currentText: { id: event.id, content: "" },
			};

		case "text-delta":
			if (acc.currentText && acc.currentText.id === event.id) {
				return {
					...acc,
					currentText: {
						...acc.currentText,
						content: acc.currentText.content + event.delta,
					},
				};
			}
			return acc;

		case "text-end":
			if (acc.currentText && acc.currentText.id === event.id) {
				return {
					...acc,
					parts: [
						...acc.parts,
						new TextPart({ type: "text", text: acc.currentText.content }),
					],
					currentText: null,
				};
			}
			return acc;

		case "tool-input-available":
			return {
				...acc,
				parts: [
					...acc.parts,
					new ToolCallPart({
						type: `tool-${event.toolName}`,
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.input,
						state: "input-available",
					}),
				],
			};

		case "tool-output-available": {
			// Update existing tool call part with output
			const updatedParts = acc.parts.map((p) => {
				// Check if this is a tool call part by checking the type prefix
				if (
					p.type.startsWith("tool-") &&
					"toolCallId" in p &&
					(p as ToolCallPart).toolCallId === event.toolCallId
				) {
					return new ToolCallPart({
						...(p as ToolCallPart),
						output: event.output,
						state: "output-available",
					});
				}
				return p;
			});
			return { ...acc, parts: updatedParts };
		}

		case "finish":
			if (event.metadata) {
				return {
					...acc,
					claudeSessionId:
						event.metadata.claudeSessionId ?? acc.claudeSessionId,
					metadata: {
						costUsd: event.metadata.costUsd,
						inputTokens: event.metadata.inputTokens,
						outputTokens: event.metadata.outputTokens,
					},
				};
			}
			return acc;

		default:
			return acc;
	}
}

// ─── Adapter Config ──────────────────────────────────────────

const adapterConfig: AdapterConfig = {
	generateId: () => crypto.randomUUID(),
};

// ─── Session Event Helpers ───────────────────────────────────

const MAX_BUFFER_SIZE = 2000;
const CLEANUP_TIMEOUT = "5 minutes";

const replayBuffer = (
	buffer: SequencedEvent[],
	lastSeenSeq: number,
): SequencedEvent[] => buffer.filter((event) => event.seq > lastSeenSeq);

const bufferEvent = (session: ActiveSession, event: SequencedEvent) =>
	Effect.gen(function* () {
		const dropped = yield* Ref.modify(session.eventBuffer, (buffer) => {
			const next = [...buffer, event];
			if (next.length > MAX_BUFFER_SIZE) {
				return [true, next.slice(-MAX_BUFFER_SIZE)];
			}
			return [false, next];
		});

		if (dropped) {
			yield* Ref.set(session.bufferHasGap, true);
		}
	});

const publishEvent = (
	session: ActiveSession,
	event: ChatStreamEvent | UserMessageEvent | SessionStateEvent,
) =>
	Effect.gen(function* () {
		const seq = yield* Ref.modify(session.lastSeq, (current) => [
			current + 1,
			current + 1,
		]);
		const wrapped = new SequencedEvent({
			seq,
			timestamp: new Date().toISOString(),
			event,
		});

		yield* bufferEvent(session, wrapped);
		yield* session.pubsub.publish(wrapped);
	});

const buildSnapshot = (
	session: ActiveSession,
	lastSeenSeq: number | undefined,
	epoch: string | undefined,
) =>
	Effect.gen(function* () {
		const buffer = yield* Ref.get(session.eventBuffer);
		const status = yield* Ref.get(session.status);
		const latestSeq = yield* Ref.get(session.lastSeq);
		const bufferHasGap = yield* Ref.get(session.bufferHasGap);
		const firstEvent = buffer[0];
		const lastEvent = buffer[buffer.length - 1];
		const bufferMinSeq = firstEvent ? firstEvent.seq : null;
		const bufferMaxSeq = lastEvent ? lastEvent.seq : null;
		const epochMismatch = epoch !== undefined && epoch !== session.epoch;
		const needsHistory =
			lastSeenSeq === undefined ||
			epochMismatch ||
			bufferHasGap ||
			(bufferMinSeq !== null && lastSeenSeq < bufferMinSeq) ||
			(lastSeenSeq !== undefined && lastSeenSeq > latestSeq);

		return new SessionSnapshotEvent({
			type: "session-snapshot",
			epoch: session.epoch,
			status,
			claudeSessionId: session.claudeSessionId,
			bufferMinSeq,
			bufferMaxSeq,
			latestSeq,
			needsHistory,
		});
	});

const clearBuffer = (session: ActiveSession) =>
	Effect.gen(function* () {
		yield* Ref.set(session.eventBuffer, []);
		yield* Ref.set(session.bufferHasGap, false);
	});

const cancelCleanup = (session: ActiveSession) =>
	session.cleanupFiber
		? Effect.gen(function* () {
				yield* Fiber.interrupt(session.cleanupFiber!).pipe(
					Effect.catchAll(() => Effect.void),
				);
				session.cleanupFiber = null;
			})
		: Effect.void;

const scheduleCleanup = (
	activeSessions: ActiveSessionsServiceInterface,
	sessionId: string,
	session: ActiveSession,
) =>
	Effect.gen(function* () {
		if (session.cleanupFiber) {
			yield* Fiber.interrupt(session.cleanupFiber).pipe(
				Effect.catchAll(() => Effect.void),
			);
		}

		const fiber = yield* Effect.fork(
			Effect.gen(function* () {
				yield* Effect.sleep(CLEANUP_TIMEOUT);

				const maybeSession = yield* activeSessions.get(sessionId);
				if (Option.isNone(maybeSession)) {
					return;
				}

				const current = maybeSession.value;
				const count = yield* Ref.get(current.subscriberCount);
				const status = yield* Ref.get(current.status);

				if (count === 0 && status === "idle") {
					yield* activeSessions.remove(sessionId);
				}
			}),
		);
		session.cleanupFiber = fiber;
	});

// ─── Streaming Helpers ───────────────────────────────────────

const AUTONOMOUS_PROMPT_APPEND = `

You are in autonomous mode working on a new worktree of this project. First of all read @project.md to understand the project. The user requested a task that you must try to complete to the best of your ability. Use your best judgment at all times. Ensure high quality, pragmatic and clean delivery. You will continue working indefinitely until you have exhausted all your attempts at solving the problem, or successfully completed it. If you completed, run 'bun biome' in the packages/apps that have modified files, which runs tooling like linting, formatting.
After you are done working, commit your changes and push to git. Create a PR using 'gh' cli.
Do not ask questions to the user or self-doubt. Choose the best options to comply with the task.`;

interface PrepareStreamingParams {
	sessionId: string;
	worktreeId: string;
	prompt: string;
	claudeSessionId?: string | null;
	autonomous?: boolean;
}

interface SessionBusyError {
	readonly _tag: "SessionBusy";
	readonly previousStatus: StreamingStatus;
}

type StorageServiceType = Context.Tag.Service<typeof StorageService>;

const prepareStreamingSession = (
	params: PrepareStreamingParams,
	storage: StorageServiceType,
	activeSessions: ActiveSessionsServiceInterface,
) =>
	Effect.gen(function* () {
		const worktree = yield* storage.worktrees.get(params.worktreeId);
		const sessionRecord = yield* storage.sessions.get(params.sessionId);
		const session = yield* activeSessions.getOrCreate(params.sessionId, {
			claudeSessionId: sessionRecord.claudeSessionId ?? null,
		});

		yield* cancelCleanup(session);

		// Atomically lock session for streaming
		const previousStatus = yield* Ref.modify(session.status, (status) =>
			status === "idle"
				? (["idle", "streaming"] as const)
				: ([status, status] as const),
		);

		if (previousStatus !== "idle") {
			return yield* Effect.fail({
				_tag: "SessionBusy",
				previousStatus,
			} as SessionBusyError);
		}

		yield* clearBuffer(session);

		// Store user message
		const userMessage = yield* storage.chatMessages.create({
			sessionId: params.sessionId,
			role: "user",
			parts: [new TextPart({ type: "text", text: params.prompt })],
		});

		yield* publishEvent(
			session,
			new UserMessageEvent({
				type: "user-message",
				messageId: userMessage.id,
				text: params.prompt,
				timestamp: userMessage.createdAt,
			}),
		);

		// Resolve Claude session ID
		const resumeId =
			params.claudeSessionId ??
			session.claudeSessionId ??
			sessionRecord.claudeSessionId ??
			undefined;

		if (resumeId && resumeId !== session.claudeSessionId) {
			session.claudeSessionId = resumeId;
		}

		yield* publishEvent(
			session,
			new SessionStateEvent({
				type: "session-state",
				status: "streaming",
				claudeSessionId: session.claudeSessionId,
			}),
		);

		// Build query options
		const abortController = new AbortController();
		const queryOptions: QueryOptions = {
			cwd: worktree.path,
			abortController,
			resume: resumeId,
			systemPrompt: params.autonomous
				? {
						type: "preset",
						preset: "claude_code",
						append: AUTONOMOUS_PROMPT_APPEND,
					}
				: { type: "preset", preset: "claude_code" },
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
		};

		return { session, sessionRecord, abortController, queryOptions };
	});

const finalizeStream = (
	session: ActiveSession,
	sessionId: string,
	accumulatorRef: Ref.Ref<AccumulatedMessage>,
	storage: StorageServiceType,
	activeSessions: ActiveSessionsServiceInterface,
) =>
	Effect.gen(function* () {
		const acc = yield* Ref.get(accumulatorRef);

		// Persist assistant message if we have content
		if (acc.parts.length > 0) {
			yield* storage.chatMessages
				.create({
					id: acc.messageId ?? undefined,
					sessionId,
					role: "assistant",
					parts: acc.parts,
					metadata: acc.metadata,
				})
				.pipe(Effect.orElse(() => Effect.void));
		}

		// Update session metadata
		if (acc.claudeSessionId || acc.metadata.costUsd) {
			yield* storage.sessions
				.update(sessionId, {
					claudeSessionId: acc.claudeSessionId,
					status: "active",
					lastActivityAt: new Date().toISOString(),
					totalCostUsd: acc.metadata.costUsd,
					inputTokens: acc.metadata.inputTokens,
					outputTokens: acc.metadata.outputTokens,
				})
				.pipe(Effect.orElse(() => Effect.void));
		}

		session.queryHandle = null;
		session.abortController = null;

		// Clear buffer BEFORE publishing idle state (fixes race condition)
		yield* clearBuffer(session);
		yield* Ref.set(session.status, "idle");
		yield* publishEvent(
			session,
			new SessionStateEvent({
				type: "session-state",
				status: "idle",
				claudeSessionId: session.claudeSessionId,
			}),
		);

		// Schedule cleanup if no subscribers (using atomic modify)
		const count = yield* Ref.modify(session.subscriberCount, (c) => [c, c]);
		if (count === 0) {
			yield* scheduleCleanup(activeSessions, sessionId, session);
		}
	});

const handleClaudeSessionIdUpdate = (
	session: ActiveSession,
	sessionId: string,
	event: ChatStreamEvent,
	activeSessions: ActiveSessionsServiceInterface,
) => {
	if (event.type === "start" && event.claudeSessionId) {
		session.claudeSessionId = event.claudeSessionId;
		return activeSessions.updateClaudeSessionId(
			sessionId,
			event.claudeSessionId,
		);
	}
	return Effect.void;
};

const broadcastError = (session: ActiveSession, error: unknown) =>
	publishEvent(
		session,
		new StreamEventError({
			type: "error",
			errorText: String(error),
		}),
	);

const resetSessionOnError = (session: ActiveSession) =>
	Effect.gen(function* () {
		yield* Ref.set(session.status, "idle");
		yield* publishEvent(
			session,
			new SessionStateEvent({
				type: "session-state",
				status: "idle",
				claudeSessionId: session.claudeSessionId,
			}),
		);
	});

// ─── Handlers ────────────────────────────────────────────────

export const ChatRpcHandlers = ChatRpc.toLayer(
	Effect.gen(function* () {
		const storage = yield* StorageService;
		const claudeSDK = yield* ClaudeSDKService;
		const activeSessions = yield* ActiveSessionsService;

		return ChatRpc.of({
			/**
			 * Start or continue a streaming chat session
			 */
			"chat.stream": (params) =>
				Stream.unwrap(
					Effect.gen(function* () {
						const { session, abortController, queryOptions } =
							yield* prepareStreamingSession(params, storage, activeSessions);

						const queryHandle = yield* claudeSDK
							.query(params.prompt, queryOptions)
							.pipe(
								Effect.catchAll((error) =>
									Effect.gen(function* () {
										yield* resetSessionOnError(session);
										return yield* Effect.fail(error);
									}),
								),
							);

						session.queryHandle = queryHandle;
						session.abortController = abortController;

						const accumulatorRef = yield* Ref.make(createAccumulator());

						return adaptSDKStreamToEvents(
							queryHandle.stream,
							adapterConfig,
						).pipe(
							Stream.tap((event) =>
								Ref.update(accumulatorRef, (acc) =>
									accumulateEvent(acc, event),
								),
							),
							Stream.tap((event) =>
								handleClaudeSessionIdUpdate(
									session,
									params.sessionId,
									event,
									activeSessions,
								),
							),
							Stream.tap((event) => publishEvent(session, event)),
							// Broadcast errors to all subscribers (consistent with chat.send)
							Stream.tapError((error) => broadcastError(session, error)),
							Stream.ensuring(
								finalizeStream(
									session,
									params.sessionId,
									accumulatorRef,
									storage,
									activeSessions,
								),
							),
						);
					}).pipe(
						Effect.catchTag("SessionBusy", () =>
							Effect.fail(
								new ChatRpcError({
									message: "Session already has an active stream",
									code: "SESSION_ACTIVE",
								}),
							),
						),
						Effect.tapError((error) =>
							Effect.gen(function* () {
								if (
									typeof error === "object" &&
									error !== null &&
									"_tag" in error &&
									(error as { _tag: string })._tag !== "ChatRpcError" &&
									(error as { _tag: string })._tag !== "SessionBusy"
								) {
									const maybeSession = yield* activeSessions.get(
										params.sessionId,
									);
									if (Option.isSome(maybeSession)) {
										yield* resetSessionOnError(maybeSession.value);
									}
								}
							}),
						),
						Effect.mapError((error) => {
							if (
								typeof error === "object" &&
								error !== null &&
								"_tag" in error
							) {
								const tagged = error as { _tag: string };
								if (tagged._tag === "ClaudeSDKError")
									return mapClaudeError(error as ClaudeSDKError);
								if (
									tagged._tag === "SessionNotFoundError" ||
									tagged._tag === "WorktreeNotFoundError"
								) {
									return mapSessionNotFoundError(
										error as SessionNotFoundError | WorktreeNotFoundError,
									);
								}
								if (tagged._tag === "DatabaseError") {
									return mapDatabaseError(error as DatabaseError);
								}
								if (tagged._tag === "ForeignKeyViolationError") {
									return new ChatSessionNotFoundRpcError({
										sessionId: params.sessionId,
									});
								}
								if (tagged._tag === "ChatRpcError") {
									return error as ChatRpcError;
								}
							}
							return new ChatRpcError({
								message: String(error),
								code: "UNKNOWN_ERROR",
							});
						}),
					),
				),

			/**
			 * Subscribe to session events (read-only stream)
			 */
			"chat.subscribe": (params) =>
				Stream.unwrapScoped(
					Effect.gen(function* () {
						const sessionRecord = yield* storage.sessions.get(params.sessionId);
						const session = yield* activeSessions.getOrCreate(
							params.sessionId,
							{
								claudeSessionId: sessionRecord.claudeSessionId ?? null,
							},
						);

						if (!session.claudeSessionId && sessionRecord.claudeSessionId) {
							session.claudeSessionId = sessionRecord.claudeSessionId;
						}

						yield* cancelCleanup(session);
						yield* Ref.update(session.subscriberCount, (count) => count + 1);

						// FIX: Subscribe to PubSub FIRST to avoid gaps
						// Events published between buffer read and subscription are captured
						const liveStream = yield* Stream.fromPubSub(session.pubsub, {
							scoped: true,
						});

						// THEN build snapshot and get buffer
						const snapshot = yield* buildSnapshot(
							session,
							params.lastSeenSeq,
							params.epoch,
						);
						const buffer = yield* Ref.get(session.eventBuffer);
						const replayFromSeq = snapshot.needsHistory
							? 0
							: (params.lastSeenSeq ?? 0);
						const replayEvents = replayBuffer(buffer, replayFromSeq);
						const lastReplayEvent = replayEvents[replayEvents.length - 1];
						const replayMaxSeq = lastReplayEvent
							? lastReplayEvent.seq
							: (params.lastSeenSeq ?? 0);
						const liveAfterReplay = Stream.filter(
							liveStream,
							(event) => event.seq > replayMaxSeq,
						);

						return Stream.concat(
							Stream.fromIterable([snapshot]),
							Stream.concat(Stream.fromIterable(replayEvents), liveAfterReplay),
						).pipe(
							Stream.ensuring(
								Effect.gen(function* () {
									// FIX: Use atomic modify to decrement and get count
									const count = yield* Ref.modify(
										session.subscriberCount,
										(c) => {
											const next = Math.max(0, c - 1);
											return [next, next];
										},
									);
									const status = yield* Ref.get(session.status);

									if (count === 0 && status === "idle") {
										yield* scheduleCleanup(
											activeSessions,
											params.sessionId,
											session,
										);
									}
								}),
							),
						);
					}).pipe(
						Effect.mapError(
							(error): ChatRpcError | ChatSessionNotFoundRpcError => {
								if (
									typeof error === "object" &&
									error !== null &&
									"_tag" in error
								) {
									const tagged = error as { _tag: string };
									if (tagged._tag === "SessionNotFoundError") {
										return new ChatSessionNotFoundRpcError({
											sessionId: (error as SessionNotFoundError).id,
										});
									}
									if (tagged._tag === "DatabaseError") {
										return new ChatRpcError({
											message: (error as DatabaseError).message,
											code: "DATABASE_ERROR",
										});
									}
								}
								return new ChatRpcError({
									message: String(error),
									code: "UNKNOWN_ERROR",
								});
							},
						),
					),
				),

			/**
			 * Send a user message (non-streaming)
			 */
			"chat.send": (params) =>
				Effect.gen(function* () {
					const { session, abortController, queryOptions } =
						yield* prepareStreamingSession(params, storage, activeSessions);

					const queryHandle = yield* claudeSDK
						.query(params.prompt, queryOptions)
						.pipe(
							Effect.catchAll((error) =>
								Effect.gen(function* () {
									yield* resetSessionOnError(session);
									return yield* Effect.fail(error);
								}),
							),
						);

					session.queryHandle = queryHandle;
					session.abortController = abortController;

					const accumulatorRef = yield* Ref.make(createAccumulator());

					const runStream = adaptSDKStreamToEvents(
						queryHandle.stream,
						adapterConfig,
					).pipe(
						Stream.tap((event) =>
							Ref.update(accumulatorRef, (acc) => accumulateEvent(acc, event)),
						),
						Stream.tap((event) =>
							handleClaudeSessionIdUpdate(
								session,
								params.sessionId,
								event,
								activeSessions,
							),
						),
						Stream.tap((event) => publishEvent(session, event)),
						Stream.runDrain,
						Effect.catchAll((error) => broadcastError(session, error)),
						Effect.ensuring(
							finalizeStream(
								session,
								params.sessionId,
								accumulatorRef,
								storage,
								activeSessions,
							),
						),
					);

					yield* Effect.fork(runStream);
				}).pipe(
					Effect.catchTag("SessionBusy", (error) =>
						Effect.fail(
							new SessionBusyRpcError({
								sessionId: params.sessionId,
								currentStatus: error.previousStatus,
							}),
						),
					),
					Effect.tapError((error) =>
						Effect.gen(function* () {
							if (
								typeof error === "object" &&
								error !== null &&
								"_tag" in error &&
								(error as { _tag: string })._tag !== "SessionBusyRpcError" &&
								(error as { _tag: string })._tag !== "SessionBusy"
							) {
								const maybeSession = yield* activeSessions.get(
									params.sessionId,
								);
								if (Option.isSome(maybeSession)) {
									yield* resetSessionOnError(maybeSession.value);
								}
							}
						}),
					),
					Effect.mapError(
						(
							error,
						):
							| SessionBusyRpcError
							| ChatRpcError
							| ChatSessionNotFoundRpcError => {
							if (
								typeof error === "object" &&
								error !== null &&
								"_tag" in error
							) {
								const tagged = error as { _tag: string };
								if (tagged._tag === "SessionBusyRpcError")
									return error as SessionBusyRpcError;
								if (tagged._tag === "ClaudeSDKError")
									return mapClaudeError(error as ClaudeSDKError);
								if (
									tagged._tag === "SessionNotFoundError" ||
									tagged._tag === "WorktreeNotFoundError"
								) {
									return new ChatSessionNotFoundRpcError({
										sessionId: (
											error as SessionNotFoundError | WorktreeNotFoundError
										).id,
									});
								}
								if (tagged._tag === "DatabaseError") {
									return new ChatRpcError({
										message: (error as DatabaseError).message,
										code: "DATABASE_ERROR",
									});
								}
								if (tagged._tag === "ForeignKeyViolationError") {
									return new ChatSessionNotFoundRpcError({
										sessionId: params.sessionId,
									});
								}
							}
							return new ChatRpcError({
								message: String(error),
								code: "UNKNOWN_ERROR",
							});
						},
					),
				),

			/**
			 * Get current session state
			 */
			"chat.getSessionState": (params) =>
				Effect.gen(function* () {
					const sessionRecord = yield* storage.sessions.get(params.sessionId);
					const session = yield* activeSessions.getOrCreate(params.sessionId, {
						claudeSessionId: sessionRecord.claudeSessionId ?? null,
					});

					if (!session.claudeSessionId && sessionRecord.claudeSessionId) {
						session.claudeSessionId = sessionRecord.claudeSessionId;
					}

					const status = yield* Ref.get(session.status);
					const subscriberCount = yield* Ref.get(session.subscriberCount);
					const buffer = yield* Ref.get(session.eventBuffer);
					const latestSeq = yield* Ref.get(session.lastSeq);
					const bufferHasGap = yield* Ref.get(session.bufferHasGap);

					const firstBufferEvent = buffer[0];
					const lastBufferEvent = buffer[buffer.length - 1];

					return {
						status,
						claudeSessionId: session.claudeSessionId,
						epoch: session.epoch,
						subscriberCount,
						bufferMinSeq: firstBufferEvent ? firstBufferEvent.seq : null,
						bufferMaxSeq: lastBufferEvent ? lastBufferEvent.seq : null,
						latestSeq,
						bufferHasGap,
					};
				}).pipe(
					Effect.mapError(
						(error): ChatRpcError | ChatSessionNotFoundRpcError => {
							if (error._tag === "SessionNotFoundError") {
								return new ChatSessionNotFoundRpcError({
									sessionId: error.id,
								});
							}
							if (error._tag === "DatabaseError") {
								return new ChatRpcError({
									message: error.message,
									code: "DATABASE_ERROR",
								});
							}
							return new ChatRpcError({
								message: String(error),
								code: "UNKNOWN_ERROR",
							});
						},
					),
				),

			/**
			 * Interrupt a running chat session
			 */
			"chat.interrupt": (params) =>
				Effect.gen(function* () {
					const maybeSession = yield* activeSessions.get(params.sessionId);

					if (Option.isNone(maybeSession)) {
						return yield* Effect.fail(
							new ChatSessionNotFoundRpcError({
								sessionId: params.sessionId,
							}),
						);
					}

					const session = maybeSession.value;

					// Abort via controller
					if (session.abortController) {
						session.abortController.abort();
					}

					// Also call SDK interrupt
					if (session.queryHandle) {
						yield* session.queryHandle.interrupt.pipe(
							Effect.catchAll(() => Effect.void),
						);
					}

					session.queryHandle = null;
					session.abortController = null;

					yield* Ref.set(session.status, "idle");
					yield* publishEvent(
						session,
						new SessionStateEvent({
							type: "session-state",
							status: "idle",
							claudeSessionId: session.claudeSessionId,
						}),
					);

					const count = yield* Ref.get(session.subscriberCount);
					if (count === 0) {
						yield* scheduleCleanup(activeSessions, params.sessionId, session);
					}
				}),

			/**
			 * Get message history for a session
			 */
			"chat.history": (params) =>
				storage.chatMessages
					.listBySession(params.sessionId)
					.pipe(Effect.mapError(mapDatabaseError)),
		});
	}),
);

export const ChatRpcHandlersLive = ChatRpcHandlers.pipe(
	Layer.provide(StorageServiceDefault),
	Layer.provide(ClaudeSDKServiceLive),
	Layer.provide(ActiveSessionsServiceLive),
);
