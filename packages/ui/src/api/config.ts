import { DEFAULT_BACKEND_URL, getBackendUrl } from "@/lib/backend-url";

/**
 * API configuration for RPC client connections.
 *
 * URL priority:
 * 1. localStorage (user-configured via Settings)
 * 2. Vite: VITE_API_URL
 * 3. Next.js: NEXT_PUBLIC_API_URL
 * 4. Default: http://localhost:3000
 */
function getApiBaseUrl(): string {
	// Priority 1: User-configured URL from localStorage
	const storedUrl = getBackendUrl();
	if (storedUrl) {
		return storedUrl;
	}
	// Priority 2: Check Vite env (import.meta.env)
	const meta = import.meta as { env?: Record<string, string | undefined> };
	if (meta.env?.VITE_API_URL) {
		return meta.env.VITE_API_URL;
	}
	// Priority 3: Check Next.js env (process.env)
	if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
		return process.env.NEXT_PUBLIC_API_URL;
	}
	// Priority 4: Default
	return DEFAULT_BACKEND_URL;
}

const API_BASE_URL = getApiBaseUrl();

export const RPC_URL = `${API_BASE_URL}/api/rpc`;
