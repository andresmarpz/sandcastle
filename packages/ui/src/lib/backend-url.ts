/**
 * Backend URL utilities.
 * Manages the backend URL for RPC connections.
 *
 * In Tauri desktop app: Gets the dynamic port from the embedded sidecar server.
 * In web/PWA: Uses localStorage configuration or falls back to default.
 */

export const BACKEND_URL_STORAGE_KEY = "sandcastle-backend-url";
export const DEFAULT_BACKEND_URL = "http://localhost:3000";

// Default port for embedded sidecar server (must match apps/http/src/server.ts)
export const DEFAULT_SIDECAR_PORT = 31822;

// Cache for the Tauri server port (populated on first call)
let cachedTauriPort: number | null = null;
let tauriPortPromise: Promise<number | null> | null = null;

// Callback for notifying about fallback port usage
type PortFallbackCallback = (port: number) => void;
let portFallbackCallback: PortFallbackCallback | null = null;

/**
 * Set a callback to be notified when falling back to a different port.
 * Useful for showing a toast notification in the UI.
 */
export function onPortFallback(callback: PortFallbackCallback): void {
	portFallbackCallback = callback;
}

/**
 * Check if running in a Tauri desktop environment.
 */
export function isTauriApp(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Get the server port from Tauri sidecar (async, with caching).
 * Returns null if not in Tauri or if the server port isn't available yet.
 */
export async function getTauriServerPort(): Promise<number | null> {
	if (!isTauriApp()) {
		return null;
	}

	// Return cached port if available
	if (cachedTauriPort !== null) {
		return cachedTauriPort;
	}

	// If already fetching, wait for that promise
	if (tauriPortPromise) {
		return tauriPortPromise;
	}

	// Fetch port from Tauri using the global __TAURI_INTERNALS__ object
	// This avoids requiring @tauri-apps/api as a dependency in the UI package
	tauriPortPromise = (async () => {
		try {
			// Access Tauri's internal invoke function directly
			// biome-ignore lint/suspicious/noExplicitAny: accessing Tauri internals
			const tauriInternals = (window as any).__TAURI_INTERNALS__;
			if (!tauriInternals?.invoke) {
				return null;
			}
			const port = await tauriInternals.invoke("get_server_port");
			if (port !== null && typeof port === "number") {
				cachedTauriPort = port;
			}
			return port as number | null;
		} catch (e) {
			console.error("[backend-url] Failed to get server port from Tauri:", e);
			return null;
		}
	})();

	return tauriPortPromise;
}

/**
 * Get the stored backend URL from localStorage.
 * Returns null if not set.
 */
export function getBackendUrl(): string | null {
	if (typeof localStorage === "undefined") {
		return null;
	}
	return localStorage.getItem(BACKEND_URL_STORAGE_KEY);
}

/**
 * Set the backend URL in localStorage.
 */
export function setBackendUrl(url: string): void {
	localStorage.setItem(BACKEND_URL_STORAGE_KEY, url);
}

/**
 * Check if a backend URL has been configured.
 */
export function hasBackendUrl(): boolean {
	return getBackendUrl() !== null;
}

/**
 * Get the backend URL synchronously.
 * For Tauri apps, this uses the cached port if available.
 * Falls back to localStorage or default.
 */
export function getBackendUrlOrDefault(): string {
	// In Tauri with cached port, use it
	if (isTauriApp() && cachedTauriPort !== null) {
		return `http://localhost:${cachedTauriPort}`;
	}

	// Otherwise use localStorage or default
	return getBackendUrl() ?? DEFAULT_BACKEND_URL;
}

/**
 * Get the backend URL asynchronously (recommended for Tauri apps).
 * This ensures the Tauri server port is fetched if needed.
 */
export async function getBackendUrlAsync(): Promise<string> {
	if (isTauriApp()) {
		const port = await getTauriServerPort();
		if (port !== null) {
			return `http://localhost:${port}`;
		}
	}

	return getBackendUrl() ?? DEFAULT_BACKEND_URL;
}

/**
 * Initialize the backend URL for Tauri apps.
 * Call this early in app startup to pre-fetch the server port.
 * Returns the port that will be used, or null if not in Tauri.
 */
export async function initializeBackendUrl(): Promise<number | null> {
	if (isTauriApp()) {
		let port = await getTauriServerPort();

		// If we couldn't get the port from Tauri, fall back to default sidecar port
		if (port === null) {
			console.warn(
				`[backend-url] Could not get port from Tauri, using default ${DEFAULT_SIDECAR_PORT}`,
			);
			port = DEFAULT_SIDECAR_PORT;
			cachedTauriPort = port;
			portFallbackCallback?.(port);
		}

		return port;
	}
	return null;
}
