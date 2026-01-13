/**
 * Backend URL localStorage utilities.
 * Manages the user-configured backend URL for RPC connections.
 */

export const BACKEND_URL_STORAGE_KEY = "sandcastle-backend-url";
export const DEFAULT_BACKEND_URL = "http://localhost:3000";

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
 * Get the backend URL, falling back to default if not set.
 */
export function getBackendUrlOrDefault(): string {
	return getBackendUrl() ?? DEFAULT_BACKEND_URL;
}
