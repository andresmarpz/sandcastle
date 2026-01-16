/**
 * Integration tests for SessionHub
 *
 * Tests cover:
 * 1. Basic flow: Send message -> receive events -> stream completes
 * 2. Queuing: Send while streaming -> message queued -> auto-dequeued on completion
 * 3. Interruption: Send message -> interrupt -> partial progress saved
 * 4. Catch-up: Subscribe mid-stream -> receive buffer + live events
 * 5. Multi-client: Two subscribers -> both receive same events
 * 6. Error handling: SDK error -> error event -> session becomes idle
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ChatMessage, type SessionEvent, TextPart } from "@sandcastle/schemas";
import { StorageService } from "@sandcastle/storage";
import { Effect, Fiber, Layer, type Mailbox, Scope } from "effect";
import { ClaudeSDKError } from "../../agents/claude/errors";
import {
	createMockClaudeSDKService,
	MockMessages,
} from "../../agents/claude/mock";
import { ClaudeSDKService } from "../../agents/claude/service";
import { makeSessionHub } from "./live";
import type { SessionHubInterface } from "./service";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Storage Service
// ─────────────────────────────────────────────────────────────────────────────

function createMockStorageService() {
	const repositories = new Map<
		string,
		{ id: string; directoryPath: string; label: string }
	>();
	const worktrees = new Map<
		string,
		{
			id: string;
			repositoryId: string;
			path: string;
			branch: string;
			label: string;
		}
	>();
	const sessions = new Map<
		string,
		{
			id: string;
			worktreeId: string;
			label: string;
			claudeSessionId?: string;
			totalCostUsd?: number;
			inputTokens?: number;
			outputTokens?: number;
		}
	>();
	const chatMessages = new Map<string, ChatMessage>();
	const turns = new Map<
		string,
		{
			id: string;
			sessionId: string;
			status: string;
			startedAt: string;
			completedAt?: string;
			reason?: string;
		}
	>();
	const cursors = new Map<
		string,
		{ sessionId: string; lastMessageId: string; lastMessageAt: string }
	>();

	const generateId = () => crypto.randomUUID();
	const nowIso = () => new Date().toISOString();

	const service: typeof StorageService.Service = {
		initialize: () => Effect.void,
		close: () => Effect.void,

		repositories: {
			list: () => Effect.succeed([...repositories.values()] as never),
			get: (id: string) =>
				Effect.gen(function* () {
					const repo = repositories.get(id);
					if (!repo)
						return yield* Effect.fail({
							_tag: "RepositoryNotFoundError",
							id,
						} as never);
					return repo as never;
				}),
			getByPath: (path: string) =>
				Effect.gen(function* () {
					const repo = [...repositories.values()].find(
						(r) => r.directoryPath === path,
					);
					if (!repo)
						return yield* Effect.fail({
							_tag: "RepositoryNotFoundError",
							id: path,
						} as never);
					return repo as never;
				}),
			create: (input: { label: string; directoryPath: string }) =>
				Effect.sync(() => {
					const id = generateId();
					const repo = { id, ...input };
					repositories.set(id, repo);
					return repo as never;
				}),
			update: () => Effect.succeed({} as never),
			delete: () => Effect.void,
		},

		worktrees: {
			list: () => Effect.succeed([...worktrees.values()] as never),
			listByRepository: (repositoryId: string) =>
				Effect.succeed(
					[...worktrees.values()].filter(
						(w) => w.repositoryId === repositoryId,
					) as never,
				),
			get: (id: string) =>
				Effect.gen(function* () {
					const worktree = worktrees.get(id);
					if (!worktree)
						return yield* Effect.fail({
							_tag: "WorktreeNotFoundError",
							id,
						} as never);
					return worktree as never;
				}),
			getByPath: (path: string) =>
				Effect.gen(function* () {
					const worktree = [...worktrees.values()].find((w) => w.path === path);
					if (!worktree)
						return yield* Effect.fail({
							_tag: "WorktreeNotFoundError",
							id: path,
						} as never);
					return worktree as never;
				}),
			create: (input: {
				repositoryId: string;
				path: string;
				branch: string;
				label: string;
			}) =>
				Effect.sync(() => {
					const id = generateId();
					const worktree = { id, ...input };
					worktrees.set(id, worktree);
					return worktree as never;
				}),
			update: () => Effect.succeed({} as never),
			delete: () => Effect.void,
			touch: () => Effect.void,
		},

		sessions: {
			list: () => Effect.succeed([...sessions.values()] as never),
			listByWorktree: (worktreeId: string) =>
				Effect.succeed(
					[...sessions.values()].filter(
						(s) => s.worktreeId === worktreeId,
					) as never,
				),
			get: (id: string) =>
				Effect.gen(function* () {
					const session = sessions.get(id);
					if (!session)
						return yield* Effect.fail({
							_tag: "SessionNotFoundError",
							id,
						} as never);
					return session as never;
				}),
			create: (input: { worktreeId: string; label: string }) =>
				Effect.sync(() => {
					const id = generateId();
					const session = { id, ...input };
					sessions.set(id, session);
					return session as never;
				}),
			update: (id: string, input: Record<string, unknown>) =>
				Effect.gen(function* () {
					const session = sessions.get(id);
					if (!session)
						return yield* Effect.fail({
							_tag: "SessionNotFoundError",
							id,
						} as never);
					const updated = { ...session, ...input };
					sessions.set(id, updated);
					return updated as never;
				}),
			delete: () => Effect.void,
			touch: () => Effect.void,
		},

		chatMessages: {
			listBySession: (sessionId: string) =>
				Effect.succeed(
					[...chatMessages.values()].filter(
						(m) => m.sessionId === sessionId,
					) as never,
				),
			get: (id: string) =>
				Effect.gen(function* () {
					const msg = chatMessages.get(id);
					if (!msg)
						return yield* Effect.fail({
							_tag: "ChatMessageNotFoundError",
							id,
						} as never);
					return msg as never;
				}),
			create: (input: {
				id?: string;
				sessionId: string;
				role: string;
				parts: unknown[];
			}) =>
				Effect.sync(() => {
					const id = input.id ?? generateId();
					const typedParts = (
						input.parts as Array<{ type: string; text?: string }>
					).map((p) => {
						if (p.type === "text" && p.text !== undefined) {
							return new TextPart({ type: "text", text: p.text });
						}
						return p;
					});
					const msg = new ChatMessage({
						id,
						sessionId: input.sessionId,
						role: input.role as "user" | "assistant" | "system",
						parts: typedParts as never,
						createdAt: nowIso(),
					});
					chatMessages.set(id, msg);
					return msg as never;
				}),
			createMany: (
				inputs: Array<{
					id?: string;
					sessionId: string;
					role: string;
					parts: unknown[];
				}>,
			) =>
				Effect.sync(() => {
					const results: ChatMessage[] = [];
					for (const input of inputs) {
						const id = input.id ?? generateId();
						const typedParts = (
							input.parts as Array<{ type: string; text?: string }>
						).map((p) => {
							if (p.type === "text" && p.text !== undefined) {
								return new TextPart({ type: "text", text: p.text });
							}
							return p;
						});
						const msg = new ChatMessage({
							id,
							sessionId: input.sessionId,
							role: input.role as "user" | "assistant" | "system",
							parts: typedParts as never,
							createdAt: nowIso(),
						});
						chatMessages.set(id, msg);
						results.push(msg);
					}
					return results as never;
				}),
			listByTurn: () => Effect.succeed([] as never),
			getMessagesSince: () => Effect.succeed([] as never),
			getLatestBySession: () => Effect.succeed(null as never),
			delete: () => Effect.void,
			deleteBySession: () => Effect.void,
		},

		turns: {
			list: () => Effect.succeed([...turns.values()] as never),
			listBySession: (sessionId: string) =>
				Effect.succeed(
					[...turns.values()].filter((t) => t.sessionId === sessionId) as never,
				),
			get: (id: string) =>
				Effect.gen(function* () {
					const turn = turns.get(id);
					if (!turn)
						return yield* Effect.fail({
							_tag: "TurnNotFoundError",
							id,
						} as never);
					return turn as never;
				}),
			create: (input: { sessionId: string }) =>
				Effect.sync(() => {
					const id = generateId();
					const turn = {
						id,
						sessionId: input.sessionId,
						status: "streaming",
						startedAt: nowIso(),
					};
					turns.set(id, turn);
					return turn as never;
				}),
			complete: (id: string, reason: string) =>
				Effect.gen(function* () {
					const turn = turns.get(id);
					if (!turn)
						return yield* Effect.fail({
							_tag: "TurnNotFoundError",
							id,
						} as never);
					const updated = {
						...turn,
						status: reason,
						completedAt: nowIso(),
						reason,
					};
					turns.set(id, updated);
					return updated as never;
				}),
			delete: () => Effect.void,
		},

		cursors: {
			get: (sessionId: string) =>
				Effect.succeed(cursors.get(sessionId) ?? null),
			upsert: (
				sessionId: string,
				lastMessageId: string,
				lastMessageAt: string,
			) =>
				Effect.sync(() => {
					const cursor = { sessionId, lastMessageId, lastMessageAt };
					cursors.set(sessionId, cursor);
					return cursor as never;
				}),
			delete: () => Effect.void,
		},
	};

	return {
		service,
		addRepository: (
			id: string,
			data: { directoryPath: string; label: string },
		) => {
			repositories.set(id, { id, ...data });
		},
		addWorktree: (
			id: string,
			data: {
				repositoryId: string;
				path: string;
				branch: string;
				label: string;
			},
		) => {
			worktrees.set(id, { id, ...data });
		},
		addSession: (id: string, data: { worktreeId: string; label: string }) => {
			sessions.set(id, { id, ...data });
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

interface TestContext {
	mockClaudeSDK: ReturnType<typeof createMockClaudeSDKService>;
	sessionHub: SessionHubInterface;
	sessionId: string;
	worktreeId: string;
	repositoryId: string;
}

async function setupTestContext(): Promise<TestContext> {
	const mockStorage = createMockStorageService();
	const mockClaudeSDK = createMockClaudeSDKService();

	const repositoryId = crypto.randomUUID();
	const worktreeId = crypto.randomUUID();
	const sessionId = crypto.randomUUID();

	mockStorage.addRepository(repositoryId, {
		directoryPath: "/test/path",
		label: "test-repo",
	});
	mockStorage.addWorktree(worktreeId, {
		repositoryId,
		path: "/test/path",
		branch: "main",
		label: "main",
	});
	mockStorage.addSession(sessionId, { worktreeId, label: "test-session" });

	const testLayer = Layer.mergeAll(
		Layer.succeed(StorageService, mockStorage.service),
		Layer.succeed(ClaudeSDKService, mockClaudeSDK.service),
	);

	const sessionHub = await Effect.runPromise(
		makeSessionHub.pipe(Effect.provide(testLayer), Effect.scoped),
	);

	return { mockClaudeSDK, sessionHub, sessionId, worktreeId, repositoryId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SessionHub Integration Tests", () => {
	let ctx: TestContext;

	beforeEach(async () => {
		ctx = await setupTestContext();
	});

	afterEach(() => {
		// No cleanup needed
	});

	// ─── Test 1: Basic Flow ──────────────────────────────────────────────────

	test("basic flow: send message -> receive events -> stream completes", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox = yield* sessionHub.subscribe(sessionId);
					const events: SessionEvent[] = [];

					const collectUntil = (
						targetTag: SessionEvent["_tag"],
						timeout = 5000,
					) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (Date.now() - startTime < timeout) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") {
									events.push(result.value);
									if (result.value._tag === targetTag) return;
								}
							}
						});

					const initialEvent = yield* mailbox.take;
					expect(initialEvent._tag).toBe("InitialState");

					const collectFiber = yield* Effect.fork(
						collectUntil("SessionStopped"),
					);
					yield* Effect.sleep("10 millis");

					const result = yield* sessionHub.sendMessage(
						sessionId,
						"Hello, Claude!",
						"client-msg-1",
					);
					expect(result.status).toBe("started");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);

					yield* controller.emit(MockMessages.systemInit("claude-session-1"));
					yield* controller.emit(
						MockMessages.text("msg-1", "Hello! How can I help?"),
					);
					yield* controller.emit(MockMessages.result(true, "claude-session-1"));
					yield* controller.complete();

					yield* Fiber.join(collectFiber);

					const eventTypes = events.map((e) => e._tag);
					expect(eventTypes).toContain("UserMessage");
					expect(eventTypes).toContain("SessionStarted");
					expect(eventTypes).toContain("StreamEvent");
					expect(eventTypes).toContain("SessionStopped");

					const sessionStopped = events.find(
						(e) => e._tag === "SessionStopped",
					);
					if (sessionStopped?._tag === "SessionStopped") {
						expect(sessionStopped.reason).toBe("completed");
					}

					const state = yield* sessionHub.getState(sessionId);
					expect(state.status).toBe("idle");
				}),
			),
		);
	});

	// ─── Test 2: Queuing ─────────────────────────────────────────────────────

	test("queuing: send while streaming -> message queued -> auto-dequeued on completion", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox = yield* sessionHub.subscribe(sessionId);
					const events: SessionEvent[] = [];

					const collectUntilCount = (targetCount: number, timeout = 10000) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (
								events.length < targetCount &&
								Date.now() - startTime < timeout
							) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") events.push(result.value);
							}
						});

					yield* mailbox.take; // Skip initial

					const collectFiber = yield* Effect.fork(collectUntilCount(20));
					yield* Effect.sleep("10 millis");

					const result1 = yield* sessionHub.sendMessage(
						sessionId,
						"First message",
						"client-msg-1",
					);
					expect(result1.status).toBe("started");

					const controller1 = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller1.emit(MockMessages.systemInit("claude-session-1"));

					const result2 = yield* sessionHub.sendMessage(
						sessionId,
						"Second message",
						"client-msg-2",
					);
					expect(result2.status).toBe("queued");
					expect(result2.queuedMessage).toBeDefined();

					yield* controller1.emit(
						MockMessages.text("msg-1", "Response to first"),
					);
					yield* controller1.emit(
						MockMessages.result(true, "claude-session-1"),
					);
					yield* controller1.complete();

					// Wait for auto-dequeue
					yield* Effect.sleep("200 millis");

					const controller2 = yield* Effect.promise(() =>
						mockClaudeSDK.getController(1),
					);
					yield* controller2.emit(MockMessages.systemInit("claude-session-2"));
					yield* controller2.emit(
						MockMessages.text("msg-2", "Response to second"),
					);
					yield* controller2.emit(
						MockMessages.result(true, "claude-session-2"),
					);
					yield* controller2.complete();

					yield* Effect.sleep("200 millis");
					yield* Fiber.interrupt(collectFiber);

					expect(mockClaudeSDK.getQueryCount()).toBe(2);

					const eventTypes = events.map((e) => e._tag);
					expect(eventTypes).toContain("MessageQueued");
					expect(eventTypes).toContain("MessageDequeued");
				}),
			),
		);
	});

	// ─── Test 3: Interruption ────────────────────────────────────────────────

	test("interruption: send message -> interrupt -> partial progress saved", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox = yield* sessionHub.subscribe(sessionId);
					const events: SessionEvent[] = [];

					const collectUntil = (
						targetTag: SessionEvent["_tag"],
						timeout = 5000,
					) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (Date.now() - startTime < timeout) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") {
									events.push(result.value);
									if (result.value._tag === targetTag) return;
								}
							}
						});

					yield* mailbox.take; // Skip initial

					const collectFiber = yield* Effect.fork(
						collectUntil("SessionStopped"),
					);
					yield* Effect.sleep("10 millis");

					const result = yield* sessionHub.sendMessage(
						sessionId,
						"Long task",
						"client-msg-1",
					);
					expect(result.status).toBe("started");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller.emit(MockMessages.systemInit("claude-session-1"));
					yield* controller.emit(
						MockMessages.text("msg-1", "Starting task..."),
					);

					yield* Effect.sleep("50 millis");

					const interruptResult = yield* sessionHub.interrupt(sessionId);
					expect(interruptResult.interrupted).toBe(true);
					expect(controller.wasInterrupted()).toBe(true);

					yield* Fiber.join(collectFiber);

					const stoppedEvent = events.find((e) => e._tag === "SessionStopped");
					expect(stoppedEvent).toBeDefined();
					if (stoppedEvent?._tag === "SessionStopped") {
						expect(stoppedEvent.reason).toBe("interrupted");
					}

					const state = yield* sessionHub.getState(sessionId);
					expect(state.status).toBe("idle");
				}),
			),
		);
	});

	// ─── Test 4: Catch-up ────────────────────────────────────────────────────

	test("catch-up: subscribe mid-stream -> receive buffer + live events", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					// Send message BEFORE subscribing
					const result = yield* sessionHub.sendMessage(
						sessionId,
						"Hello",
						"client-msg-1",
					);
					expect(result.status).toBe("started");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller.emit(MockMessages.systemInit("claude-session-1"));
					yield* controller.emit(MockMessages.text("msg-1", "First response"));

					// Allow buffer to populate
					yield* Effect.sleep("100 millis");

					// NOW subscribe mid-stream
					const mailbox = yield* sessionHub.subscribe(sessionId);

					const initialEvent = yield* mailbox.take;
					expect(initialEvent._tag).toBe("InitialState");
					if (initialEvent._tag === "InitialState") {
						expect(initialEvent.snapshot.status).toBe("streaming");
						// Buffer should contain events from BEFORE subscription
						// This is the key test - we get catch-up data
						expect(initialEvent.buffer.length).toBeGreaterThan(0);
					}

					const events: SessionEvent[] = [];
					const collectUntil = (targetTag: SessionEvent["_tag"]) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (Date.now() - startTime < 5000) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") {
									events.push(result.value);
									if (result.value._tag === targetTag) return;
								}
							}
						});

					const collectFiber = yield* Effect.fork(
						collectUntil("SessionStopped"),
					);

					// Emit more messages after subscription - these will arrive as live events
					yield* controller.emit(MockMessages.text("msg-2", "Second response"));
					yield* controller.emit(MockMessages.result(true, "claude-session-1"));
					yield* controller.complete();

					yield* Fiber.join(collectFiber);

					// Live events should include the stream events emitted AFTER subscribe
					// and the final SessionStopped event
					const eventTypes = events.map((e) => e._tag);
					expect(eventTypes).toContain("SessionStopped");
					// StreamEvent may or may not be in the live events depending on timing,
					// but we should definitely get SessionStopped
					// The key assertion is that the buffer (catch-up) contained earlier events
				}),
			),
		);
	});

	// ─── Test 5: Multi-client ────────────────────────────────────────────────

	test("multi-client: two subscribers -> both receive same events", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox1 = yield* sessionHub.subscribe(sessionId);
					const mailbox2 = yield* sessionHub.subscribe(sessionId);

					const events1: SessionEvent[] = [];
					const events2: SessionEvent[] = [];

					const collectUntil = (
						mailbox: Mailbox.ReadonlyMailbox<SessionEvent>,
						events: SessionEvent[],
						targetTag: SessionEvent["_tag"],
					) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (Date.now() - startTime < 5000) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") {
									events.push(result.value);
									if (result.value._tag === targetTag) return;
								}
							}
						});

					yield* mailbox1.take; // Initial state 1
					yield* mailbox2.take; // Initial state 2

					const collect1 = yield* Effect.fork(
						collectUntil(mailbox1, events1, "SessionStopped"),
					);
					const collect2 = yield* Effect.fork(
						collectUntil(mailbox2, events2, "SessionStopped"),
					);
					yield* Effect.sleep("10 millis");

					yield* sessionHub.sendMessage(sessionId, "Hello", "client-msg-1");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller.emit(MockMessages.systemInit("claude-session-1"));
					yield* controller.emit(MockMessages.text("msg-1", "Response"));
					yield* controller.emit(MockMessages.result(true, "claude-session-1"));
					yield* controller.complete();

					yield* Fiber.join(collect1);
					yield* Fiber.join(collect2);

					const tags1 = events1.map((e) => e._tag);
					const tags2 = events2.map((e) => e._tag);

					expect(tags1).toContain("UserMessage");
					expect(tags1).toContain("SessionStarted");
					expect(tags1).toContain("SessionStopped");

					expect(tags2).toContain("UserMessage");
					expect(tags2).toContain("SessionStarted");
					expect(tags2).toContain("SessionStopped");
				}),
			),
		);
	});

	// ─── Test 6: Error Handling ──────────────────────────────────────────────

	test("error handling: SDK error -> error event -> session becomes idle", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox = yield* sessionHub.subscribe(sessionId);
					const events: SessionEvent[] = [];

					const collectUntil = (targetTag: SessionEvent["_tag"]) =>
						Effect.gen(function* () {
							const startTime = Date.now();
							while (Date.now() - startTime < 5000) {
								const result = yield* mailbox.take.pipe(
									Effect.timeout("100 millis"),
									Effect.option,
								);
								if (result._tag === "Some") {
									events.push(result.value);
									if (result.value._tag === targetTag) return;
								}
							}
						});

					yield* mailbox.take; // Skip initial

					const collectFiber = yield* Effect.fork(
						collectUntil("SessionStopped"),
					);
					yield* Effect.sleep("10 millis");

					yield* sessionHub.sendMessage(sessionId, "Hello", "client-msg-1");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller.emit(MockMessages.systemInit("claude-session-1"));
					yield* controller.fail(
						new ClaudeSDKError({ message: "API rate limit exceeded" }),
					);

					yield* Fiber.join(collectFiber);

					const stoppedEvent = events.find((e) => e._tag === "SessionStopped");
					expect(stoppedEvent).toBeDefined();
					if (stoppedEvent?._tag === "SessionStopped") {
						expect(stoppedEvent.reason).toBe("error");
					}

					const state = yield* sessionHub.getState(sessionId);
					expect(state.status).toBe("idle");
				}),
			),
		);
	});

	// ─── Additional Edge Cases ───────────────────────────────────────────────

	test("interrupt when idle returns interrupted: false", async () => {
		const { sessionHub, sessionId } = ctx;
		const result = await Effect.runPromise(sessionHub.interrupt(sessionId));
		expect(result.interrupted).toBe(false);
	});

	test("getState returns current session snapshot", async () => {
		const { sessionHub, sessionId } = ctx;
		const state = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(state.status).toBe("idle");
		expect(state.activeTurnId).toBeNull();
		expect(state.queue).toHaveLength(0);
	});

	test("dequeueMessage removes message from queue", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const mailbox = yield* sessionHub.subscribe(sessionId);
					yield* mailbox.take; // Skip initial

					// Start streaming
					yield* sessionHub.sendMessage(sessionId, "First", "client-msg-1");

					const controller = yield* Effect.promise(() =>
						mockClaudeSDK.getController(0),
					);
					yield* controller.emit(MockMessages.systemInit("claude-session-1"));

					// Queue second message
					const result = yield* sessionHub.sendMessage(
						sessionId,
						"Second (to dequeue)",
						"client-msg-2",
					);
					expect(result.status).toBe("queued");
					// biome-ignore lint/style/noNonNullAssertion: test code
					const queuedId = result.queuedMessage!.id;

					// Dequeue it
					const dequeueResult = yield* sessionHub.dequeueMessage(
						sessionId,
						queuedId,
					);
					expect(dequeueResult.removed).toBe(true);

					const state = yield* sessionHub.getState(sessionId);
					expect(state.queue).toHaveLength(0);

					// Complete first message
					yield* controller.emit(MockMessages.result(true, "claude-session-1"));
					yield* controller.complete();

					yield* Effect.sleep("200 millis");
					expect(mockClaudeSDK.getQueryCount()).toBe(1);
				}),
			),
		);
	});
});
