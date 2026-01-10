/**
 * API configuration for RPC client connections.
 *
 * Environment variable support:
 * - Vite: VITE_API_URL
 * - Next.js: NEXT_PUBLIC_API_URL
 * - Default: http://localhost:3000
 */
function getApiBaseUrl(): string {
	// Check Vite env (import.meta.env)
	const meta = import.meta as { env?: Record<string, string | undefined> };
	if (meta.env?.VITE_API_URL) {
		return meta.env.VITE_API_URL;
	}
	// Check Next.js env (process.env)
	if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) {
		return process.env.NEXT_PUBLIC_API_URL;
	}
	return "http://localhost:3000";
}

const API_BASE_URL = getApiBaseUrl();

export const RPC_URL = `${API_BASE_URL}/api/rpc`;
