import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { type ChatRespondInput, ChatStreamEvent } from "@sandcastle/rpc/chat";
import {
	type ChatMessage,
	type CreateChatMessageInput,
	TextContent,
	ToolUseContent,
} from "@sandcastle/storage/entities";
import { Context, Deferred, Effect, Layer, Ref, Stream } from "effect";

// ─── Error Types ─────────────────────────────────────────────

export class ClaudeAgentError {
	readonly _tag = "ClaudeAgentError";
	constructor(
		readonly message: string,
		readonly code?: string,
	) {}
}

export class SessionNotActiveError {
	readonly _tag = "SessionNotActiveError";
	constructor(readonly sessionId: string) {}
}

export class NoPendingQuestionError {
	readonly _tag = "NoPendingQuestionError";
	constructor(readonly sessionId: string) {}
}

// ─── Active Session State ────────────────────────────────────

interface PendingQuestion {
	toolUseId: string;
	deferred: Deferred.Deferred<Record<string, string>, never>;
}

interface ActiveSession {
	abortController: AbortController;
	pendingQuestion: PendingQuestion | null;
	claudeSessionId: string | null;
}

// ─── Service Interface ───────────────────────────────────────

// ─── Autonomous Mode System Prompt ────────────────────────────

const AUTONOMOUS_SYSTEM_PROMPT = `You are in autonomous mode working on a new worktree of this project. First of all read @project.md to understand the project. The user requested a task that you must try to complete to the best of your ability. Use your best judgment at all times. Ensure high quality, pragmatic and clean delivery. You will continue working indefinitely until you have exhausted all your attempts at solving the problem, or successfully completed it. If you completed, run 'bun check' in the root of the repository which runs tooling like linting, formatting.

After you are done working, commit your changes and push to git. Create a PR using 'gh' cli.
Do not ask questions to the user or self-doubt. Choose the best options to comply with the task.`;

export interface ClaudeAgentServiceInterface {
	readonly startChat: (params: {
		sessionId: string;
		worktreePath: string;
		prompt: string;
		claudeSessionId?: string | null;
		autonomous?: boolean;
		onMessage?: (
			input: CreateChatMessageInput,
		) => Effect.Effect<ChatMessage, unknown>;
	}) => Stream.Stream<ChatStreamEvent, ClaudeAgentError>;

	readonly respondToQuestion: (
		params: ChatRespondInput,
	) => Effect.Effect<void, NoPendingQuestionError | SessionNotActiveError>;

	readonly interrupt: (
		sessionId: string,
	) => Effect.Effect<void, SessionNotActiveError>;

	readonly isActive: (sessionId: string) => Effect.Effect<boolean>;
}

export class ClaudeAgentService extends Context.Tag("ClaudeAgentService")<
	ClaudeAgentService,
	ClaudeAgentServiceInterface
>() {}

// ─── Service Implementation ──────────────────────────────────

export const makeClaudeAgentService = Effect.gen(function* () {
	const activeSessions = yield* Ref.make<Map<string, ActiveSession>>(new Map());

	const getSession = (sessionId: string) =>
		Ref.get(activeSessions).pipe(
			Effect.map((sessions) => sessions.get(sessionId)),
		);

	const setSession = (sessionId: string, session: ActiveSession) =>
		Ref.update(activeSessions, (sessions) => {
			const newSessions = new Map(sessions);
			newSessions.set(sessionId, session);
			return newSessions;
		});

	const removeSession = (sessionId: string) =>
		Ref.update(activeSessions, (sessions) => {
			const newSessions = new Map(sessions);
			newSessions.delete(sessionId);
			return newSessions;
		});

	const updateSession = (sessionId: string, update: Partial<ActiveSession>) =>
		Ref.update(activeSessions, (sessions) => {
			const existing = sessions.get(sessionId);
			if (!existing) return sessions;
			const newSessions = new Map(sessions);
			newSessions.set(sessionId, { ...existing, ...update });
			return newSessions;
		});

	const service: ClaudeAgentServiceInterface = {
		startChat: (params) => {
			return Stream.unwrap(
				Effect.gen(function* () {
					const abortController = new AbortController();

					const activeSession: ActiveSession = {
						abortController,
						pendingQuestion: null,
						claudeSessionId: params.claudeSessionId ?? null,
					};

					yield* setSession(params.sessionId, activeSession);

					return Stream.async<ChatStreamEvent, ClaudeAgentError>((emit) => {
						(async () => {
							try {
								// Save and emit user message first
								if (params.onMessage) {
									const userMessageInput: CreateChatMessageInput = {
										sessionId: params.sessionId,
										role: "user",
										contentType: "text",
										content: new TextContent({
											type: "text",
											text: params.prompt,
										}),
									};
									await Effect.runPromise(
										params.onMessage(userMessageInput).pipe(
											Effect.map((msg) => {
												emit.single(
													new ChatStreamEvent({
														type: "message",
														message: msg,
													}),
												);
											}),
											Effect.catchAll(() => Effect.void),
										),
									);
								}

								const queryOptions: Parameters<typeof query>[0] = {
									prompt: params.prompt,
									options: {
										cwd: params.worktreePath,
										systemPrompt: params.autonomous
											? {
													type: "preset",
													preset: "claude_code",
													append: AUTONOMOUS_SYSTEM_PROMPT,
												}
											: { type: "preset", preset: "claude_code" },
										permissionMode: "bypassPermissions",
										abortController,
										allowDangerouslySkipPermissions: true,
										includePartialMessages: true,
									},
								};

								// Add resume if we have a Claude session ID
								if (params.claudeSessionId) {
									(queryOptions.options as Record<string, unknown>).resume =
										params.claudeSessionId;
								}

								let currentClaudeSessionId: string | null = null;

								for await (const message of query(queryOptions)) {
									await handleSDKMessage(
										message,
										params,
										emit,
										currentClaudeSessionId,
										(id: string) => {
											currentClaudeSessionId = id;
										},
										updateSession,
									);
								}

								await Effect.runPromise(removeSession(params.sessionId));
								emit.end();
							} catch (error) {
								await Effect.runPromise(removeSession(params.sessionId));

								if (error instanceof Error && error.name === "AbortError") {
									emit.end();
								} else {
									emit.fail(
										new ClaudeAgentError(
											error instanceof Error ? error.message : String(error),
										),
									);
								}
							}
						})();
					});
				}),
			);
		},

		respondToQuestion: (params) =>
			Effect.gen(function* () {
				const session = yield* getSession(params.sessionId);
				if (!session) {
					return yield* Effect.fail(
						new SessionNotActiveError(params.sessionId),
					);
				}
				if (!session.pendingQuestion) {
					return yield* Effect.fail(
						new NoPendingQuestionError(params.sessionId),
					);
				}
				if (session.pendingQuestion.toolUseId !== params.toolUseId) {
					return yield* Effect.fail(
						new NoPendingQuestionError(params.sessionId),
					);
				}

				yield* Deferred.succeed(
					session.pendingQuestion.deferred,
					params.answers,
				);
				yield* updateSession(params.sessionId, { pendingQuestion: null });
			}),

		interrupt: (sessionId) =>
			Effect.gen(function* () {
				const session = yield* getSession(sessionId);
				if (!session) {
					return yield* Effect.fail(new SessionNotActiveError(sessionId));
				}

				session.abortController.abort();
				yield* removeSession(sessionId);
			}),

		isActive: (sessionId) =>
			getSession(sessionId).pipe(
				Effect.map((session) => session !== undefined),
			),
	};

	return service;
});

// ─── Message Handler ─────────────────────────────────────────

async function handleSDKMessage(
	message: SDKMessage,
	params: {
		sessionId: string;
		onMessage?: (
			input: CreateChatMessageInput,
		) => Effect.Effect<ChatMessage, unknown>;
	},
	emit: {
		single: (event: ChatStreamEvent) => void;
	},
	currentClaudeSessionId: string | null,
	setClaudeSessionId: (id: string) => void,
	updateSession: (
		sessionId: string,
		update: { claudeSessionId: string | null },
	) => Effect.Effect<void>,
) {
	// Handle init message
	if (
		message.type === "system" &&
		"subtype" in message &&
		message.subtype === "init"
	) {
		const initMsg = message as { session_id: string };
		setClaudeSessionId(initMsg.session_id);
		await Effect.runPromise(
			updateSession(params.sessionId, { claudeSessionId: initMsg.session_id }),
		);
		emit.single(
			new ChatStreamEvent({
				type: "init",
				claudeSessionId: initMsg.session_id,
			}),
		);
		return;
	}

	// Handle assistant message (contains the actual response content)
	if (message.type === "assistant") {
		const assistantMsg = message as {
			message: {
				content: Array<{
					type: string;
					text?: string;
					id?: string;
					name?: string;
					input?: unknown;
				}>;
			};
		};

		// Process content blocks
		for (const block of assistantMsg.message.content) {
			if (block.type === "text" && block.text) {
				// Text content
				if (params.onMessage) {
					const textInput: CreateChatMessageInput = {
						sessionId: params.sessionId,
						role: "assistant",
						contentType: "text",
						content: new TextContent({ type: "text", text: block.text }),
					};
					await Effect.runPromise(
						params.onMessage(textInput).pipe(
							Effect.map((msg) => {
								emit.single(
									new ChatStreamEvent({ type: "message", message: msg }),
								);
							}),
							Effect.catchAll(() => Effect.void),
						),
					);
				}
			} else if (block.type === "tool_use" && block.id && block.name) {
				// Tool use
				emit.single(
					new ChatStreamEvent({
						type: "tool_start",
						toolUseId: block.id,
						toolName: block.name,
					}),
				);

				if (params.onMessage) {
					const toolUseInput: CreateChatMessageInput = {
						sessionId: params.sessionId,
						role: "assistant",
						contentType: "tool_use",
						content: new ToolUseContent({
							type: "tool_use",
							toolUseId: block.id,
							toolName: block.name,
							input: block.input,
						}),
					};
					await Effect.runPromise(
						params.onMessage(toolUseInput).pipe(
							Effect.map((msg) => {
								emit.single(
									new ChatStreamEvent({ type: "message", message: msg }),
								);
							}),
							Effect.catchAll(() => Effect.void),
						),
					);
				}
			}
		}
		return;
	}

	// Handle tool progress
	if (message.type === "tool_progress") {
		const progressMsg = message as {
			tool_use_id: string;
			tool_name: string;
			elapsed_time_seconds: number;
		};
		emit.single(
			new ChatStreamEvent({
				type: "progress",
				toolUseId: progressMsg.tool_use_id,
				toolName: progressMsg.tool_name,
				elapsedSeconds: progressMsg.elapsed_time_seconds,
			}),
		);
		return;
	}

	// Handle result message
	if (message.type === "result") {
		const resultMsg = message as {
			subtype: string;
			result?: string;
			total_cost_usd?: number;
			usage?: { input_tokens?: number; output_tokens?: number };
			session_id: string;
		};

		emit.single(
			new ChatStreamEvent({
				type: "result",
				result: resultMsg.result ?? "",
				costUsd: resultMsg.total_cost_usd,
				inputTokens: resultMsg.usage?.input_tokens,
				outputTokens: resultMsg.usage?.output_tokens,
				claudeSessionId:
					resultMsg.session_id ?? currentClaudeSessionId ?? undefined,
			}),
		);
		return;
	}

	// Handle streaming partial messages (text deltas)
	if (message.type === "stream_event") {
		const streamMsg = message as {
			type: "stream_event";
			event: {
				type: string;
				index?: number;
				delta?: { type: string; text?: string };
			};
			uuid: string;
		};

		// Only process content_block_delta events with text deltas
		if (
			streamMsg.event.type === "content_block_delta" &&
			streamMsg.event.delta?.type === "text_delta" &&
			streamMsg.event.delta?.text
		) {
			emit.single(
				new ChatStreamEvent({
					type: "text_delta",
					textDelta: streamMsg.event.delta.text,
					contentBlockIndex: streamMsg.event.index ?? 0,
					uuid: streamMsg.uuid,
				}),
			);
		}
		return;
	}
}

// ─── Layer ───────────────────────────────────────────────────

export const ClaudeAgentServiceLive = Layer.effect(
	ClaudeAgentService,
	makeClaudeAgentService,
);
