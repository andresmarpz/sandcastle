import { getBackendUrl } from "@/lib/backend-url";

/**
 * API configuration for RPC client connections.
 *
 * The backend URL is read from localStorage. If not set, returns
 * a placeholder - the app should be gated to show a setup screen.
 */
function getApiBaseUrl(): string {
	const storedUrl = getBackendUrl();
	// Return stored URL or placeholder (app should gate before making requests)
	return storedUrl ?? "";
}

const API_BASE_URL = getApiBaseUrl();

export const RPC_URL = `${API_BASE_URL}/api/rpc`;
