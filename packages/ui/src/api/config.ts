import { getBackendUrlOrDefault } from "@/lib/backend-url";

/**
 * API configuration for RPC client connections.
 *
 * The backend URL is determined by:
 * 1. In Tauri desktop app: Dynamically from the embedded sidecar server port
 * 2. In web/PWA: From localStorage, falling back to localhost:3000
 *
 * Note: This is called at runtime (not cached at module load) to ensure
 * Tauri apps can get the dynamic port after initialization.
 */
export function getRpcUrl(): string {
	return `${getBackendUrlOrDefault()}/api/rpc`;
}

// For backward compatibility - but prefer getRpcUrl() for Tauri apps
export const RPC_URL = getRpcUrl();
