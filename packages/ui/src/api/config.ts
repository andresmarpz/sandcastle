import { getBackendUrlOrDefault } from "@/lib/backend-url";

/**
 * API configuration for RPC client connections.
 *
 * The backend URL is read from localStorage. If not set, falls back
 * to the default localhost:3000 URL.
 */
function getApiBaseUrl(): string {
	return getBackendUrlOrDefault();
}

const API_BASE_URL = getApiBaseUrl();

export const RPC_URL = `${API_BASE_URL}/api/rpc`;
