import {
	ChatRpc,
	ChatRpcError,
	ChatSessionNotFoundRpcError,
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
	AskUserPart,
	AskUserQuestionItem,
	AskUserQuestionOption,
	type MessagePart,
	TextPart,
	ToolCallPart,
} from "@sandcastle/storage/entities";
import { Effect, Layer, Option, Ref, Stream } from "effect";
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

		case "ask-user":
			return {
				...acc,
				parts: [
					...acc.parts,
					new AskUserPart({
						type: "ask-user",
						toolCallId: event.toolCallId,
						questions: event.questions.map(
							(q) =>
								new AskUserQuestionItem({
									question: q.question,
									header: q.header,
									options: q.options.map(
										(o) =>
											new AskUserQuestionOption({
												label: o.label,
												description: o.description,
											}),
									),
									multiSelect: q.multiSelect,
								}),
						),
					}),
				],
			};

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
						yield* storage.sessions.get(params.sessionId);

						// 3. Check if session already has an active stream
						const isActive = yield* activeSessions.isActive(params.sessionId);
						if (isActive) {
							return yield* Effect.fail(
								new ChatRpcError({
									message: "Session already has an active stream",
									code: "SESSION_ACTIVE",
								}),
							);
						}

						// 4. Store user message
						yield* storage.chatMessages.create({
							sessionId: params.sessionId,
							role: "user",
							parts: [new TextPart({ type: "text", text: params.prompt })],
						});

						// 5. Create AbortController for interrupt capability
						const abortController = new AbortController();

						// 6. Build query options
						const queryOptions: QueryOptions = {
							cwd: worktree.path,
							abortController,
							resume: params.claudeSessionId ?? undefined,
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

						// 7. Create query handle
						const queryHandle = yield* claudeSDK.query(
							params.prompt,
							queryOptions,
						);

						// 8. Register for interrupt
						yield* activeSessions.register(params.sessionId, {
							queryHandle,
							abortController,
							claudeSessionId: params.claudeSessionId ?? null,
						});

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
									return activeSessions.updateClaudeSessionId(
										params.sessionId,
										event.claudeSessionId,
									);
								}
								return Effect.void;
							}),
							// On stream completion, persist assistant message
							Stream.ensuring(
								Effect.gen(function* () {
									const acc = yield* Ref.get(accumulatorRef);

									// Only persist if we have parts
									if (acc.parts.length > 0) {
										yield* storage.chatMessages
											.create({
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

									// Remove from active sessions
									yield* activeSessions.remove(params.sessionId);
								}),
							),
						);
					}).pipe(
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
					session.abortController.abort();

					// Also call SDK interrupt
					yield* session.queryHandle.interrupt.pipe(
						Effect.catchAll(() => Effect.void),
					);

					// Remove from active sessions
					yield* activeSessions.remove(params.sessionId);
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
