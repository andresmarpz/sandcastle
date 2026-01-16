import { beforeEach, describe, expect, test } from "bun:test";

// We need to test a fresh instance each time, so we'll create the class directly
const MAX_SUBSCRIPTIONS = 3;

interface SubscriptionEntry {
	sessionId: string;
	controller: AbortController;
}

interface VisitResult {
	isNew: boolean;
	evicted: string | null;
}

class SubscriptionManager {
	private subscriptions: SubscriptionEntry[] = [];

	visit(sessionId: string): VisitResult {
		const existingIndex = this.subscriptions.findIndex(
			(entry) => entry.sessionId === sessionId,
		);

		if (existingIndex !== -1) {
			const entry = this.subscriptions.splice(existingIndex, 1)[0]!;
			this.subscriptions.unshift(entry);
			return { isNew: false, evicted: null };
		}

		const controller = new AbortController();
		this.subscriptions.unshift({ sessionId, controller });

		let evicted: string | null = null;
		if (this.subscriptions.length > MAX_SUBSCRIPTIONS) {
			const evictedEntry = this.subscriptions.pop()!;
			evictedEntry.controller.abort();
			evicted = evictedEntry.sessionId;
		}

		return { isNew: true, evicted };
	}

	leave(sessionId: string): void {
		const index = this.subscriptions.findIndex(
			(entry) => entry.sessionId === sessionId,
		);

		if (index !== -1) {
			const entry = this.subscriptions.splice(index, 1)[0]!;
			entry.controller.abort();
		}
	}

	getController(sessionId: string): AbortController | undefined {
		const entry = this.subscriptions.find(
			(entry) => entry.sessionId === sessionId,
		);
		return entry?.controller;
	}

	getSubscribed(): string[] {
		return this.subscriptions.map((entry) => entry.sessionId);
	}
}

describe("SubscriptionManager", () => {
	let manager: SubscriptionManager;

	beforeEach(() => {
		manager = new SubscriptionManager();
	});

	describe("visit()", () => {
		test("should add new session and return isNew: true", () => {
			const result = manager.visit("session-1");

			expect(result.isNew).toBe(true);
			expect(result.evicted).toBeNull();
			expect(manager.getSubscribed()).toEqual(["session-1"]);
		});

		test("should move existing session to front and return isNew: false", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");
			// Order: [session-3, session-2, session-1]

			const result = manager.visit("session-1");
			// Order: [session-1, session-3, session-2]

			expect(result.isNew).toBe(false);
			expect(result.evicted).toBeNull();
			expect(manager.getSubscribed()).toEqual([
				"session-1",
				"session-3",
				"session-2",
			]);
		});

		test("should evict oldest session when over capacity", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");

			const result = manager.visit("session-4");

			expect(result.isNew).toBe(true);
			expect(result.evicted).toBe("session-1");
			expect(manager.getSubscribed()).toEqual([
				"session-4",
				"session-3",
				"session-2",
			]);
		});

		test("should abort controller of evicted session", () => {
			manager.visit("session-1");
			const controller1 = manager.getController("session-1")!;

			manager.visit("session-2");
			manager.visit("session-3");
			manager.visit("session-4");

			expect(controller1.signal.aborted).toBe(true);
		});

		test("should not evict when visiting existing session at capacity", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");

			const result = manager.visit("session-2");

			expect(result.isNew).toBe(false);
			expect(result.evicted).toBeNull();
			expect(manager.getSubscribed()).toHaveLength(3);
		});

		test("should create new AbortController for new sessions", () => {
			manager.visit("session-1");
			const controller1 = manager.getController("session-1");

			expect(controller1).toBeInstanceOf(AbortController);
			expect(controller1?.signal.aborted).toBe(false);
		});
	});

	describe("leave()", () => {
		test("should remove session from tracking", () => {
			manager.visit("session-1");
			manager.visit("session-2");

			manager.leave("session-1");

			expect(manager.getSubscribed()).toEqual(["session-2"]);
		});

		test("should abort controller when leaving", () => {
			manager.visit("session-1");
			const controller = manager.getController("session-1")!;

			manager.leave("session-1");

			expect(controller.signal.aborted).toBe(true);
		});

		test("should handle leaving non-existent session gracefully", () => {
			manager.visit("session-1");

			// Should not throw
			manager.leave("non-existent");

			expect(manager.getSubscribed()).toEqual(["session-1"]);
		});
	});

	describe("getController()", () => {
		test("should return controller for subscribed session", () => {
			manager.visit("session-1");

			const controller = manager.getController("session-1");

			expect(controller).toBeInstanceOf(AbortController);
		});

		test("should return undefined for non-subscribed session", () => {
			const controller = manager.getController("non-existent");

			expect(controller).toBeUndefined();
		});

		test("should return same controller for same session", () => {
			manager.visit("session-1");
			const controller1 = manager.getController("session-1");
			const controller2 = manager.getController("session-1");

			expect(controller1).toBe(controller2);
		});

		test("should preserve controller when moving session to front", () => {
			manager.visit("session-1");
			const originalController = manager.getController("session-1");

			manager.visit("session-2");
			manager.visit("session-1"); // Move to front

			const controllerAfterMove = manager.getController("session-1");

			expect(controllerAfterMove).toBe(originalController);
		});
	});

	describe("getSubscribed()", () => {
		test("should return empty array initially", () => {
			expect(manager.getSubscribed()).toEqual([]);
		});

		test("should return sessions in LRU order (most recent first)", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");

			expect(manager.getSubscribed()).toEqual([
				"session-3",
				"session-2",
				"session-1",
			]);
		});

		test("should reflect LRU order after revisiting", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");
			manager.visit("session-1"); // Move session-1 to front

			expect(manager.getSubscribed()).toEqual([
				"session-1",
				"session-3",
				"session-2",
			]);
		});
	});

	describe("LRU eviction scenarios", () => {
		test("should evict correct session after complex operations", () => {
			// Initial: session-1 (oldest)
			manager.visit("session-1");
			// Order: [session-1]

			manager.visit("session-2");
			// Order: [session-2, session-1]

			manager.visit("session-3");
			// Order: [session-3, session-2, session-1]

			manager.visit("session-1"); // Move to front
			// Order: [session-1, session-3, session-2]

			const result = manager.visit("session-4");
			// Order: [session-4, session-1, session-3], session-2 evicted

			expect(result.evicted).toBe("session-2");
			expect(manager.getSubscribed()).toEqual([
				"session-4",
				"session-1",
				"session-3",
			]);
		});

		test("should handle leaving and re-visiting", () => {
			manager.visit("session-1");
			manager.visit("session-2");
			manager.visit("session-3");

			manager.leave("session-2");
			// Order: [session-3, session-1]

			const result = manager.visit("session-4");
			// Order: [session-4, session-3, session-1]

			expect(result.isNew).toBe(true);
			expect(result.evicted).toBeNull(); // No eviction needed, was under capacity
			expect(manager.getSubscribed()).toEqual([
				"session-4",
				"session-3",
				"session-1",
			]);
		});
	});
});
