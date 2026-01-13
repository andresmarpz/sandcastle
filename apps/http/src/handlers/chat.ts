import {
	ChatRpc,
	ChatRpcError,
	ChatSessionNotFoundRpcError,
	SequencedEvent,
	SessionBusyRpcError,
	SessionSnapshotEvent,
	SessionStateEvent,
	type SessionStatus,
	StreamEventError,
	UserMessageEvent,
	type ChatStreamEvent,
	DatabaseRpcError,
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
import { Effect, Fiber, Layer, Option, Ref, Stream } from "effect";
import { type AdapterConfig, adaptSDKStreamToEvents } from "../adapters/claude";
import {
	type ClaudeSDKError,
	ClaudeSDKService,
	ClaudeSDKServiceLive,
	type QueryOptions,
} from "../agents/claude";
import {
	ActiveSessionsService,
	ActiveSessionsServiceLive,
	type ActiveSession,
	type ActiveSessionsServiceInterface,
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
		const bufferMinSeq = buffer.length ? buffer[0].seq : null;
		const bufferMaxSeq = buffer.length ? buffer[buffer.length - 1].seq : null;
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
				yield* Fiber.interrupt(session.cleanupFiber).pipe(
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
						// 1. Get worktree to find working directory
						const worktree = yield* storage.worktrees.get(params.worktreeId);

						// 2. Verify session exists
						const sessionRecord = yield* storage.sessions.get(params.sessionId);

						// 3. Get or create active session
						const session = yield* activeSessions.getOrCreate(params.sessionId, {
							claudeSessionId: sessionRecord.claudeSessionId ?? null,
						});

						yield* cancelCleanup(session);

						// 4. Atomically lock the session for streaming
						const previousStatus = yield* Ref.modify(session.status, (status) =>
							status === "idle" ? ["idle", "streaming"] : [status, status],
						);

						if (previousStatus !== "idle") {
							return yield* Effect.fail(
								new ChatRpcError({
									message: "Session already has an active stream",
									code: "SESSION_ACTIVE",
								}),
							);
						}

						yield* clearBuffer(session);

						// 5. Store user message
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

						// 6. Create AbortController for interrupt capability
						const abortController = new AbortController();

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

						// 7. Build query options
						const queryOptions: QueryOptions = {
							cwd: worktree.path,
							abortController,
							resume: resumeId,
							systemPrompt: params.autonomous
								? {
										type: "preset",
										preset: "claude_code",
										append: `\n\nYou are in autonomous mode working on a new worktree of this project. First of all read @project.md to understand the project. The user requested a task that you must try to complete to the best of your ability. Use your best judgment at all times. Ensure high quality, pragmatic and clean delivery. You will continue working indefinitely until you have exhausted all your attempts at solving the problem, or successfully completed it. If you completed, run 'bun biome' in the packages/apps that have modified files, which runs tooling like linting, formatting.
After you are done working, commit your changes and push to git. Create a PR using 'gh' cli.
Do not ask questions to the user or self-doubt. Choose the best options to comply with the task.`,
									}
								: { type: "preset", preset: "claude_code" },
							permissionMode: "bypassPermissions",
							allowDangerouslySkipPermissions: true,
						};

						// 8. Create query handle
						const queryHandle = yield* claudeSDK
							.query(params.prompt, queryOptions)
							.pipe(
								Effect.catchAll((error) =>
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
										return yield* Effect.fail(error);
									}),
								),
							);

						session.queryHandle = queryHandle;
						session.abortController = abortController;

						// 9. Create accumulator ref for message persistence
						const accumulatorRef = yield* Ref.make(createAccumulator());

						// 10. Transform and return stream
						return adaptSDKStreamToEvents(
							queryHandle.stream,
							adapterConfig,
						).pipe(
							// Tap to accumulate parts for persistence
							Stream.tap((event) =>
								Ref.update(accumulatorRef, (acc) =>
									accumulateEvent(acc, event),
								),
							),
							// Update claudeSessionId in active session when we get it
							Stream.tap((event) => {
								if (event.type === "start" && event.claudeSessionId) {
									session.claudeSessionId = event.claudeSessionId;
									return activeSessions.updateClaudeSessionId(
										params.sessionId,
										event.claudeSessionId,
									);
								}
								return Effect.void;
							}),
							// Publish events to subscribers
							Stream.tap((event) => publishEvent(session, event)),
							// On stream completion, persist assistant message
							Stream.ensuring(
								Effect.gen(function* () {
									const acc = yield* Ref.get(accumulatorRef);

									// Only persist if we have parts
									if (acc.parts.length > 0) {
										yield* storage.chatMessages
											.create({
												id: acc.messageId ?? undefined,
												sessionId: params.sessionId,
												role: "assistant",
												parts: acc.parts,
												metadata: acc.metadata,
											})
											.pipe(Effect.orElse(() => Effect.void));
									}

									// Update session with claudeSessionId and metadata
									if (acc.claudeSessionId || acc.metadata.costUsd) {
										yield* storage.sessions
											.update(params.sessionId, {
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

									yield* Ref.set(session.status, "idle");
									yield* publishEvent(
										session,
										new SessionStateEvent({
											type: "session-state",
											status: "idle",
											claudeSessionId: session.claudeSessionId,
										}),
									);
									yield* clearBuffer(session);

									const count = yield* Ref.get(session.subscriberCount);
									if (count === 0) {
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
						Effect.catchAll((error) =>
							error._tag === "ChatRpcError"
								? Effect.fail(error)
								: Effect.gen(function* () {
										const maybeSession = yield* activeSessions.get(
											params.sessionId,
										);
										if (Option.isSome(maybeSession)) {
											const session = maybeSession.value;
											yield* Ref.set(session.status, "idle");
											yield* publishEvent(
												session,
												new SessionStateEvent({
													type: "session-state",
													status: "idle",
													claudeSessionId: session.claudeSessionId,
												}),
											);
										}
										return yield* Effect.fail(error);
									}),
						),
						Effect.mapError((error) => {
							if (error._tag === "ClaudeSDKError") return mapClaudeError(error);
							if (
								error._tag === "SessionNotFoundError" ||
								error._tag === "WorktreeNotFoundError"
							) {
								return mapSessionNotFoundError(error);
							}
							if (error._tag === "DatabaseError") {
								return mapDatabaseError(error);
							}
							// ForeignKeyViolationError from chatMessages.create
							if (error._tag === "ForeignKeyViolationError") {
								return new ChatSessionNotFoundRpcError({
									sessionId: params.sessionId,
								});
							}
							// ChatRpcError passes through
							if (error._tag === "ChatRpcError") {
								return error;
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
						const session = yield* activeSessions.getOrCreate(params.sessionId, {
							claudeSessionId: sessionRecord.claudeSessionId ?? null,
						});

						if (!session.claudeSessionId && sessionRecord.claudeSessionId) {
							session.claudeSessionId = sessionRecord.claudeSessionId;
						}

						yield* cancelCleanup(session);
						yield* Ref.update(session.subscriberCount, (count) => count + 1);

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
						const liveStream = yield* Stream.fromPubSub(session.pubsub, {
							scoped: true,
						});

						return Stream.concat(
							Stream.fromIterable([snapshot]),
							Stream.fromIterable(replayEvents),
							liveStream,
						).pipe(
							Stream.ensuring(
								Effect.gen(function* () {
									yield* Ref.update(session.subscriberCount, (count) =>
										Math.max(0, count - 1),
									);

									const count = yield* Ref.get(session.subscriberCount);
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
						Effect.mapError((error) => {
							if (error._tag === "SessionNotFoundError") {
								return mapSessionNotFoundError(error);
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
						}),
					),
				),

			/**
			 * Send a user message (non-streaming)
			 */
			"chat.send": (params) =>
				Effect.gen(function* () {
					const worktree = yield* storage.worktrees.get(params.worktreeId);
					const sessionRecord = yield* storage.sessions.get(params.sessionId);

					const session = yield* activeSessions.getOrCreate(params.sessionId, {
						claudeSessionId: sessionRecord.claudeSessionId ?? null,
					});

					yield* cancelCleanup(session);

					const previousStatus = yield* Ref.modify(session.status, (status) =>
						status === "idle" ? ["idle", "streaming"] : [status, status],
					);

					if (previousStatus !== "idle") {
						return yield* Effect.fail(
							new SessionBusyRpcError({
								sessionId: params.sessionId,
								currentStatus: previousStatus as SessionStatus,
							}),
						);
					}

					yield* clearBuffer(session);

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

					const abortController = new AbortController();
					const queryOptions: QueryOptions = {
						cwd: worktree.path,
						abortController,
						resume: resumeId,
						systemPrompt: params.autonomous
							? {
									type: "preset",
									preset: "claude_code",
									append: `\n\nYou are in autonomous mode working on a new worktree of this project. First of all read @project.md to understand the project. The user requested a task that you must try to complete to the best of your ability. Use your best judgment at all times. Ensure high quality, pragmatic and clean delivery. You will continue working indefinitely until you have exhausted all your attempts at solving the problem, or successfully completed it. If you completed, run 'bun biome' in the packages/apps that have modified files, which runs tooling like linting, formatting.
After you are done working, commit your changes and push to git. Create a PR using 'gh' cli.
Do not ask questions to the user or self-doubt. Choose the best options to comply with the task.`,
								}
							: { type: "preset", preset: "claude_code" },
						permissionMode: "bypassPermissions",
						allowDangerouslySkipPermissions: true,
					};

					const queryHandle = yield* claudeSDK
						.query(params.prompt, queryOptions)
						.pipe(
							Effect.catchAll((error) =>
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
							Ref.update(accumulatorRef, (acc) =>
								accumulateEvent(acc, event),
							),
						),
						Stream.tap((event) => {
							if (event.type === "start" && event.claudeSessionId) {
								session.claudeSessionId = event.claudeSessionId;
								return activeSessions.updateClaudeSessionId(
									params.sessionId,
									event.claudeSessionId,
								);
							}
							return Effect.void;
						}),
						Stream.tap((event) => publishEvent(session, event)),
						Stream.runDrain,
						Effect.catchAll((error) =>
							publishEvent(
								session,
								new StreamEventError({
									type: "error",
									errorText: String(error),
								}),
							),
						),
						Effect.ensuring(
							Effect.gen(function* () {
								const acc = yield* Ref.get(accumulatorRef);

								if (acc.parts.length > 0) {
									yield* storage.chatMessages
										.create({
											id: acc.messageId ?? undefined,
											sessionId: params.sessionId,
											role: "assistant",
											parts: acc.parts,
											metadata: acc.metadata,
										})
										.pipe(Effect.orElse(() => Effect.void));
								}

								if (acc.claudeSessionId || acc.metadata.costUsd) {
									yield* storage.sessions
										.update(params.sessionId, {
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

								yield* Ref.set(session.status, "idle");
								yield* publishEvent(
									session,
									new SessionStateEvent({
										type: "session-state",
										status: "idle",
										claudeSessionId: session.claudeSessionId,
									}),
								);
								yield* clearBuffer(session);

								const count = yield* Ref.get(session.subscriberCount);
								if (count === 0) {
									yield* scheduleCleanup(
										activeSessions,
										params.sessionId,
										session,
									);
								}
							}),
						),
					);

					yield* Effect.fork(runStream);
				}).pipe(
					Effect.catchAll((error) =>
						error._tag === "SessionBusyRpcError"
							? Effect.fail(error)
							: Effect.gen(function* () {
									const maybeSession = yield* activeSessions.get(
										params.sessionId,
									);
									if (Option.isSome(maybeSession)) {
										const session = maybeSession.value;
										yield* Ref.set(session.status, "idle");
										yield* publishEvent(
											session,
											new SessionStateEvent({
												type: "session-state",
												status: "idle",
												claudeSessionId: session.claudeSessionId,
											}),
										);
									}
									return yield* Effect.fail(error);
								}),
					),
					Effect.mapError((error) => {
						if (error._tag === "SessionBusyRpcError") return error;
						if (error._tag === "ClaudeSDKError") return mapClaudeError(error);
						if (
							error._tag === "SessionNotFoundError" ||
							error._tag === "WorktreeNotFoundError"
						) {
							return mapSessionNotFoundError(error);
						}
						if (error._tag === "DatabaseError") {
							return mapDatabaseError(error);
						}
						if (error._tag === "ForeignKeyViolationError") {
							return new ChatSessionNotFoundRpcError({
								sessionId: params.sessionId,
							});
						}
						if (error._tag === "ChatRpcError") {
							return error;
						}
						return new ChatRpcError({
							message: String(error),
							code: "UNKNOWN_ERROR",
						});
					}),
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

					return {
						status,
						claudeSessionId: session.claudeSessionId,
						epoch: session.epoch,
						subscriberCount,
						bufferMinSeq: buffer.length ? buffer[0].seq : null,
						bufferMaxSeq: buffer.length ? buffer[buffer.length - 1].seq : null,
						latestSeq,
						bufferHasGap,
					};
				}).pipe(
					Effect.mapError((error) => {
						if (error._tag === "SessionNotFoundError") {
							return mapSessionNotFoundError(error);
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
					}),
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
