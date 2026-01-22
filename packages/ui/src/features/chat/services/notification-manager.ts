/**
 * Session Notification Manager
 *
 * Manages sound notifications and dock badge updates when sessions complete
 * or require user input. Coordinates between the chat store and platform APIs.
 */

type NotificationType = "complete" | "waiting_input";

interface PlatformBridge {
	setDockBadge: ((count: number) => Promise<void>) | null;
}

// Module-level state
let platformBridge: PlatformBridge = { setDockBadge: null };
const sessionsNeedingAttention = new Set<string>();

// Audio elements (preloaded for instant playback)
let completeSound: HTMLAudioElement | null = null;
let waitingInputSound: HTMLAudioElement | null = null;
let audioInitialized = false;

/**
 * Initialize the notification manager with platform-specific APIs.
 * Call this once during app initialization.
 */
export function initNotificationManager(bridge: PlatformBridge): void {
	platformBridge = bridge;
	initAudio();
}

/**
 * Preload audio files for instant playback.
 */
function initAudio(): void {
	if (audioInitialized || typeof window === "undefined") return;

	try {
		completeSound = new Audio("/sounds/session-complete.mp3");
		completeSound.preload = "auto";
		completeSound.volume = 0.5;

		waitingInputSound = new Audio("/sounds/waiting-input.mp3");
		waitingInputSound.preload = "auto";
		waitingInputSound.volume = 0.6;

		audioInitialized = true;
	} catch {
		// Audio not supported (e.g., SSR or restricted environment)
		console.warn("[notification-manager] Audio initialization failed");
	}
}

/**
 * Play notification sound based on type.
 */
function playSound(type: NotificationType): void {
	const sound = type === "waiting_input" ? waitingInputSound : completeSound;
	if (!sound) return;

	// Reset and play
	sound.currentTime = 0;
	sound.play().catch(() => {
		// Autoplay may be blocked by browser policy - ignore silently
	});
}

/**
 * Update the dock badge to reflect current attention count.
 */
async function updateDockBadge(): Promise<void> {
	if (!platformBridge.setDockBadge) return;

	try {
		await platformBridge.setDockBadge(sessionsNeedingAttention.size);
	} catch {
		// IPC call failed - ignore silently
	}
}

/**
 * Notify that a session has completed and needs attention.
 * Plays the appropriate sound and updates the dock badge.
 *
 * @param sessionId - The session that completed
 * @param hasApprovals - Whether the session is waiting for user input
 */
export function notifySessionComplete(
	sessionId: string,
	hasApprovals: boolean,
): void {
	// Always play sound (even if session is already tracked)
	const type: NotificationType = hasApprovals ? "waiting_input" : "complete";
	playSound(type);

	// Track session for badge count
	if (!sessionsNeedingAttention.has(sessionId)) {
		sessionsNeedingAttention.add(sessionId);
		updateDockBadge();
	}
}

/**
 * Clear notification for a session (user has visited it).
 *
 * @param sessionId - The session to clear
 */
export function clearSessionNotification(sessionId: string): void {
	if (sessionsNeedingAttention.has(sessionId)) {
		sessionsNeedingAttention.delete(sessionId);
		updateDockBadge();
	}
}

/**
 * Get the current count of sessions needing attention.
 */
export function getAttentionCount(): number {
	return sessionsNeedingAttention.size;
}

/**
 * Check if a specific session needs attention.
 */
export function sessionNeedsAttention(sessionId: string): boolean {
	return sessionsNeedingAttention.has(sessionId);
}
