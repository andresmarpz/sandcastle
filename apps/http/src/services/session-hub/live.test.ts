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

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect, Layer, Mailbox, Scope } from "effect";
import { makeStorageService, StorageService } from "@sandcastle/storage";
import type { SessionEvent } from "@sandcastle/schemas";

import { makeSessionHub } from "./live";
import { ClaudeSDKService } from "../../agents/claude/service";
import { ClaudeSDKError } from "../../agents/claude/errors";
import {
	createMockClaudeSDKService,
	MockMessages,
} from "../../agents/claude/mock";

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup Helpers
// ─────────────────────────────────────────────────────────────────────────────

import { SessionHub, type SessionHubInterface } from "./service";

/**
 * Test context for each test
 */
interface TestContext {
	mockClaudeSDK: ReturnType<typeof createMockClaudeSDKService>;
	sessionHub: SessionHubInterface;
	sessionId: string;
	worktreeId: string;
	repositoryId: string;
	dbPath: string;
	cleanup: () => Promise<void>;
}

/**
 * Sets up test context with a temp file database and mock services
 */
async function setupTestContext(): Promise<TestContext> {
	// Create temp database path for each test
	const tmpDir = os.tmpdir();
	const dbPath = path.join(tmpDir, `sandcastle-test-${crypto.randomUUID()}.db`);

	// Create storage service with temp database
	const storageService = await Effect.runPromise(
		makeStorageService({ databasePath: dbPath }),
	);

	const mockClaudeSDK = createMockClaudeSDKService();

	// Create test data: repository -> worktree -> session
	const repository = await Effect.runPromise(
		storageService.repositories.create({
			label: "test-repo",
			directoryPath: "/test/path",
		}),
	);

	const worktree = await Effect.runPromise(
		storageService.worktrees.create({
			repositoryId: repository.id,
			label: "main",
			path: "/test/path",
			branch: "main",
			isMainWorktree: true,
		}),
	);

	const session = await Effect.runPromise(
		storageService.sessions.create({
			worktreeId: worktree.id,
			label: "test-session",
		}),
	);

	// Create test layer
	const testLayer = Layer.mergeAll(
		Layer.succeed(StorageService, storageService),
		Layer.succeed(ClaudeSDKService, mockClaudeSDK.service),
	);

	// Create SessionHub with test dependencies
	const sessionHub = await Effect.runPromise(
		makeSessionHub.pipe(Effect.provide(testLayer)),
	);

	return {
		mockClaudeSDK,
		sessionHub,
		sessionId: session.id,
		worktreeId: worktree.id,
		repositoryId: repository.id,
		dbPath,
		cleanup: async () => {
			await Effect.runPromise(storageService.close());
			// Clean up temp database file
			try {
				fs.unlinkSync(dbPath);
				fs.unlinkSync(`${dbPath}-wal`);
				fs.unlinkSync(`${dbPath}-shm`);
			} catch {
				// Ignore cleanup errors
			}
		},
	};
}

/**
 * Collects events from a mailbox into an array
 */
async function collectEvents(
	mailbox: Mailbox.ReadonlyMailbox<SessionEvent>,
	count: number,
	timeout = 5000,
): Promise<SessionEvent[]> {
	const events: SessionEvent[] = [];
	const startTime = Date.now();

	while (events.length < count && Date.now() - startTime < timeout) {
		const result = await Effect.runPromise(
			Mailbox.take(mailbox).pipe(
				Effect.timeout("100 millis"),
				Effect.option,
			),
		);

		if (result._tag === "Some") {
			events.push(result.value);
		}
	}

	return events;
}

/**
 * Waits for a specific event type
 */
async function waitForEvent(
	mailbox: Mailbox.ReadonlyMailbox<SessionEvent>,
	tag: SessionEvent["_tag"],
	timeout = 5000,
): Promise<SessionEvent | null> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const result = await Effect.runPromise(
			Mailbox.take(mailbox).pipe(
				Effect.timeout("100 millis"),
				Effect.option,
			),
		);

		if (result._tag === "Some" && result.value._tag === tag) {
			return result.value;
		}
	}

	return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SessionHub Integration Tests", () => {
	let ctx: TestContext;

	beforeEach(async () => {
		ctx = await setupTestContext();
	});

	afterEach(async () => {
		await ctx.cleanup();
	});

	// ─── Test 1: Basic Flow ──────────────────────────────────────────────────

	test("basic flow: send message -> receive events -> stream completes", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe first to receive all events
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);

		// Get initial state
		const initialEvent = await Effect.runPromise(Mailbox.take(mailbox));
		expect(initialEvent._tag).toBe("InitialState");
		if (initialEvent._tag === "InitialState") {
			expect(initialEvent.snapshot.status).toBe("idle");
			expect(initialEvent.snapshot.queue).toHaveLength(0);
		}

		// Send a message
		const result = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Hello, Claude!", "client-msg-1"),
		);
		expect(result.status).toBe("started");

		// Get the mock controller and emit responses
		const controller = await mockClaudeSDK.getController(0);

		// Emit SDK messages
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));
		await Effect.runPromise(controller.emit(MockMessages.text("msg-1", "Hello! How can I help?")));
		await Effect.runPromise(controller.emit(MockMessages.result(true, "claude-session-1")));
		await Effect.runPromise(controller.complete());

		// Collect events
		const events = await collectEvents(mailbox, 10, 3000);

		// Verify events received
		const eventTypes = events.map((e) => e._tag);
		expect(eventTypes).toContain("UserMessage");
		expect(eventTypes).toContain("SessionStarted");
		expect(eventTypes).toContain("StreamEvent");
		expect(eventTypes).toContain("SessionStopped");

		// Find SessionStopped and verify reason
		const sessionStopped = events.find((e) => e._tag === "SessionStopped");
		expect(sessionStopped).toBeDefined();
		if (sessionStopped?._tag === "SessionStopped") {
			expect(sessionStopped.reason).toBe("completed");
		}

		// Verify session is idle again
		const state = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(state.status).toBe("idle");

		// Cleanup scope
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	// ─── Test 2: Queuing ─────────────────────────────────────────────────────

	test("queuing: send while streaming -> message queued -> auto-dequeued on completion", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);

		// Skip initial state
		await Effect.runPromise(Mailbox.take(mailbox));

		// Send first message
		const result1 = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "First message", "client-msg-1"),
		);
		expect(result1.status).toBe("started");

		// Get controller and start streaming but don't complete
		const controller1 = await mockClaudeSDK.getController(0);
		await Effect.runPromise(controller1.emit(MockMessages.systemInit("claude-session-1")));

		// Send second message while streaming - should be queued
		const result2 = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Second message", "client-msg-2"),
		);
		expect(result2.status).toBe("queued");
		expect(result2.queuedMessage).toBeDefined();

		// Verify MessageQueued event
		const queuedEvent = await waitForEvent(mailbox, "MessageQueued", 2000);
		expect(queuedEvent).not.toBeNull();
		if (queuedEvent?._tag === "MessageQueued") {
			expect(queuedEvent.message.content).toBe("Second message");
		}

		// Complete first stream
		await Effect.runPromise(controller1.emit(MockMessages.text("msg-1", "Response to first")));
		await Effect.runPromise(controller1.emit(MockMessages.result(true, "claude-session-1")));
		await Effect.runPromise(controller1.complete());

		// Wait for MessageDequeued
		const dequeuedEvent = await waitForEvent(mailbox, "MessageDequeued", 3000);
		expect(dequeuedEvent).not.toBeNull();

		// Second message should now be processing - get its controller
		const controller2 = await mockClaudeSDK.getController(1);
		await Effect.runPromise(controller2.emit(MockMessages.systemInit("claude-session-2")));
		await Effect.runPromise(controller2.emit(MockMessages.text("msg-2", "Response to second")));
		await Effect.runPromise(controller2.emit(MockMessages.result(true, "claude-session-2")));
		await Effect.runPromise(controller2.complete());

		// Verify both messages were processed (2 queries made)
		expect(mockClaudeSDK.getQueryCount()).toBe(2);

		// Cleanup
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	// ─── Test 3: Interruption ────────────────────────────────────────────────

	test("interruption: send message -> interrupt -> partial progress saved", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);

		// Skip initial state
		await Effect.runPromise(Mailbox.take(mailbox));

		// Send message
		const result = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Long task", "client-msg-1"),
		);
		expect(result.status).toBe("started");

		// Get controller and emit some partial response
		const controller = await mockClaudeSDK.getController(0);
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));
		await Effect.runPromise(controller.emit(MockMessages.text("msg-1", "Starting task...")));

		// Allow some time for events to propagate
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Interrupt the session
		const interruptResult = await Effect.runPromise(sessionHub.interrupt(sessionId));
		expect(interruptResult.interrupted).toBe(true);

		// Verify SDK was told to interrupt
		expect(controller.wasInterrupted()).toBe(true);

		// Wait for SessionStopped event with interrupted reason
		const stoppedEvent = await waitForEvent(mailbox, "SessionStopped", 3000);
		expect(stoppedEvent).not.toBeNull();
		if (stoppedEvent?._tag === "SessionStopped") {
			expect(stoppedEvent.reason).toBe("interrupted");
		}

		// Session should be idle
		const state = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(state.status).toBe("idle");

		// Cleanup
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	// ─── Test 4: Catch-up ────────────────────────────────────────────────────

	test("catch-up: subscribe mid-stream -> receive buffer + live events", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Send message FIRST without subscribing
		const result = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Hello", "client-msg-1"),
		);
		expect(result.status).toBe("started");

		// Get controller and emit some messages
		const controller = await mockClaudeSDK.getController(0);
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));
		await Effect.runPromise(controller.emit(MockMessages.text("msg-1", "First response")));

		// Allow buffer to be populated
		await new Promise((resolve) => setTimeout(resolve, 100));

		// NOW subscribe (mid-stream)
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);

		// Initial state should show streaming and include buffer
		const initialEvent = await Effect.runPromise(Mailbox.take(mailbox));
		expect(initialEvent._tag).toBe("InitialState");
		if (initialEvent._tag === "InitialState") {
			expect(initialEvent.snapshot.status).toBe("streaming");
			// Buffer should contain events from before subscription
			expect(initialEvent.buffer.length).toBeGreaterThan(0);
		}

		// Emit more messages after subscription
		await Effect.runPromise(controller.emit(MockMessages.text("msg-2", "Second response")));
		await Effect.runPromise(controller.emit(MockMessages.result(true, "claude-session-1")));
		await Effect.runPromise(controller.complete());

		// Should receive live events
		const events = await collectEvents(mailbox, 5, 3000);
		const eventTypes = events.map((e) => e._tag);

		// Should receive the new stream events
		expect(eventTypes).toContain("StreamEvent");
		expect(eventTypes).toContain("SessionStopped");

		// Cleanup
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	// ─── Test 5: Multi-client ────────────────────────────────────────────────

	test("multi-client: two subscribers -> both receive same events", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe two clients
		const scope1 = Effect.runSync(Scope.make());
		const scope2 = Effect.runSync(Scope.make());

		const mailbox1 = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope1))),
		);
		const mailbox2 = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope2))),
		);

		// Both should receive initial state
		const initial1 = await Effect.runPromise(Mailbox.take(mailbox1));
		const initial2 = await Effect.runPromise(Mailbox.take(mailbox2));
		expect(initial1._tag).toBe("InitialState");
		expect(initial2._tag).toBe("InitialState");

		// Send message
		await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Hello", "client-msg-1"),
		);

		// Get controller and emit
		const controller = await mockClaudeSDK.getController(0);
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));
		await Effect.runPromise(controller.emit(MockMessages.text("msg-1", "Response")));
		await Effect.runPromise(controller.emit(MockMessages.result(true, "claude-session-1")));
		await Effect.runPromise(controller.complete());

		// Collect events from both mailboxes
		const events1 = await collectEvents(mailbox1, 5, 3000);
		const events2 = await collectEvents(mailbox2, 5, 3000);

		// Both should receive the same event types
		const tags1 = events1.map((e) => e._tag);
		const tags2 = events2.map((e) => e._tag);

		// Both should have UserMessage, SessionStarted, StreamEvent(s), SessionStopped
		expect(tags1).toContain("UserMessage");
		expect(tags1).toContain("SessionStarted");
		expect(tags1).toContain("SessionStopped");

		expect(tags2).toContain("UserMessage");
		expect(tags2).toContain("SessionStarted");
		expect(tags2).toContain("SessionStopped");

		// Cleanup
		await Effect.runPromise(Scope.close(scope1, Effect.void));
		await Effect.runPromise(Scope.close(scope2, Effect.void));
	});

	// ─── Test 6: Error Handling ──────────────────────────────────────────────

	test("error handling: SDK error -> error event -> session becomes idle", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);

		// Skip initial state
		await Effect.runPromise(Mailbox.take(mailbox));

		// Send message
		const result = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Hello", "client-msg-1"),
		);
		expect(result.status).toBe("started");

		// Get controller
		const controller = await mockClaudeSDK.getController(0);

		// Emit system init then fail
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));
		await Effect.runPromise(
			controller.fail(new ClaudeSDKError({ message: "API rate limit exceeded" })),
		);

		// Wait for SessionStopped with error reason
		const stoppedEvent = await waitForEvent(mailbox, "SessionStopped", 3000);
		expect(stoppedEvent).not.toBeNull();
		if (stoppedEvent?._tag === "SessionStopped") {
			expect(stoppedEvent.reason).toBe("error");
		}

		// Session should be idle after error
		const state = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(state.status).toBe("idle");

		// Cleanup
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	// ─── Additional Edge Cases ───────────────────────────────────────────────

	test("interrupt when idle returns interrupted: false", async () => {
		const { sessionHub, sessionId } = ctx;

		// Try to interrupt when session is idle
		const result = await Effect.runPromise(sessionHub.interrupt(sessionId));
		expect(result.interrupted).toBe(false);
	});

	test("dequeueMessage removes message from queue", async () => {
		const { sessionHub, sessionId, mockClaudeSDK } = ctx;

		// Subscribe
		const scope = Effect.runSync(Scope.make());
		const mailbox = await Effect.runPromise(
			sessionHub.subscribe(sessionId).pipe(Effect.provide(Layer.succeed(Scope.Scope, scope))),
		);
		await Effect.runPromise(Mailbox.take(mailbox)); // Skip initial

		// Send first message to start streaming
		await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "First", "client-msg-1"),
		);

		// Get controller but don't complete
		const controller = await mockClaudeSDK.getController(0);
		await Effect.runPromise(controller.emit(MockMessages.systemInit("claude-session-1")));

		// Queue a second message
		const result = await Effect.runPromise(
			sessionHub.sendMessage(sessionId, "Second (to dequeue)", "client-msg-2"),
		);
		expect(result.status).toBe("queued");
		const queuedId = result.queuedMessage!.id;

		// Dequeue the second message
		const dequeueResult = await Effect.runPromise(
			sessionHub.dequeueMessage(sessionId, queuedId),
		);
		expect(dequeueResult.removed).toBe(true);

		// Verify queue is empty
		const state = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(state.queue).toHaveLength(0);

		// Complete first message
		await Effect.runPromise(controller.emit(MockMessages.result(true, "claude-session-1")));
		await Effect.runPromise(controller.complete());

		// Only one query should have been made (second was dequeued)
		// Wait a bit to ensure no auto-dequeue happens
		await new Promise((resolve) => setTimeout(resolve, 200));
		expect(mockClaudeSDK.getQueryCount()).toBe(1);

		// Cleanup
		await Effect.runPromise(Scope.close(scope, Effect.void));
	});

	test("getState returns current session snapshot", async () => {
		const { sessionHub, sessionId } = ctx;

		// Get state when idle
		const idleState = await Effect.runPromise(sessionHub.getState(sessionId));
		expect(idleState.status).toBe("idle");
		expect(idleState.activeTurnId).toBeNull();
		expect(idleState.queue).toHaveLength(0);
	});
});
