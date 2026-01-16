/**
 * LRU Subscription Manager
 *
 * Manages concurrent session subscriptions with an LRU eviction policy.
 * Each browser tab maintains its own independent subscription manager.
 *
 * When the maximum number of concurrent subscriptions is reached,
 * the oldest (least recently visited) session is automatically
 * unsubscribed to make room for new subscriptions.
 */

const MAX_SUBSCRIPTIONS = 3;

interface SubscriptionEntry {
	sessionId: string;
	controller: AbortController;
}

interface VisitResult {
	/** True if this is a new subscription, false if session was already subscribed */
	isNew: boolean;
	/** Session ID that was evicted, or null if no eviction occurred */
	evicted: string | null;
}

class SubscriptionManager {
	/**
	 * LRU list of active subscriptions.
	 * Most recently visited is at index 0, oldest at the end.
	 */
	private subscriptions: SubscriptionEntry[] = [];

	/**
	 * Visit a session, marking it as the most recently used.
	 * Creates a new AbortController for the session if it's new.
	 * If over capacity, evicts and aborts the oldest session.
	 *
	 * @param sessionId - The session ID to visit
	 * @returns Object containing isNew flag and evicted session ID (if any)
	 */
	visit(sessionId: string): VisitResult {
		const existingIndex = this.subscriptions.findIndex(
			(entry) => entry.sessionId === sessionId
		);

		// Session already exists - move to front
		if (existingIndex !== -1) {
			const entry = this.subscriptions.splice(existingIndex, 1)[0]!;
			this.subscriptions.unshift(entry);
			return { isNew: false, evicted: null };
		}

		// New session - create controller and add to front
		const controller = new AbortController();
		this.subscriptions.unshift({ sessionId, controller });

		// Check if we need to evict
		let evicted: string | null = null;
		if (this.subscriptions.length > MAX_SUBSCRIPTIONS) {
			const evictedEntry = this.subscriptions.pop()!;
			evictedEntry.controller.abort();
			evicted = evictedEntry.sessionId;
		}

		return { isNew: true, evicted };
	}

	/**
	 * Leave a session, removing it from tracking and aborting its subscription.
	 *
	 * @param sessionId - The session ID to leave
	 */
	leave(sessionId: string): void {
		const index = this.subscriptions.findIndex(
			(entry) => entry.sessionId === sessionId
		);

		if (index !== -1) {
			const entry = this.subscriptions.splice(index, 1)[0]!;
			entry.controller.abort();
		}
	}

	/**
	 * Get the AbortController for a session.
	 *
	 * @param sessionId - The session ID to get the controller for
	 * @returns The AbortController, or undefined if not subscribed
	 */
	getController(sessionId: string): AbortController | undefined {
		const entry = this.subscriptions.find(
			(entry) => entry.sessionId === sessionId
		);
		return entry?.controller;
	}

	/**
	 * Get a list of all currently subscribed session IDs.
	 * Useful for debugging and reconnection logic.
	 *
	 * @returns Array of session IDs in LRU order (most recent first)
	 */
	getSubscribed(): string[] {
		return this.subscriptions.map((entry) => entry.sessionId);
	}
}

/**
 * Singleton instance of the subscription manager.
 * Each browser tab has its own independent instance.
 */
export const subscriptionManager = new SubscriptionManager();
