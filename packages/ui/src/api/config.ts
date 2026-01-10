/**
 * API configuration for RPC client connections.
 *
 * Set VITE_API_URL environment variable to override the default.
 * - Development: http://localhost:3000
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const RPC_URL = `${API_BASE_URL}/api/rpc`;
