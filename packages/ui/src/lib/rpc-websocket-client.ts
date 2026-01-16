/**
 * WebSocket RPC Client Singleton for Chat Streaming
 *
 * Provides a singleton WebSocket connection for streaming RPC operations.
 * Uses Effect's built-in reconnection with exponential backoff.
 *
 * Usage:
 * ```ts
 * import { makeStreamingRpcClient, StreamingChatClient, runWithStreamingClient } from "@/lib/rpc-websocket-client"
 *
 * // Option 1: Run an Effect that needs the client
 * const result = await runWithStreamingClient(
 *   Effect.gen(function* () {
 *     const client = yield* StreamingChatClient
 *     const result = yield* client.chat.send({
 *       sessionId: "...",
 *       content: "Hello",
 *       clientMessageId: "..."
 *     })
 *     return result
 *   })
 * )
 *
 * // Option 2: Subscribe to a stream (requires manual scope management)
 * const result = await runWithStreamingClient(
 *   Effect.gen(function* () {
 *     const client = yield* StreamingChatClient
 *     yield* client.chat.subscribe({ sessionId: "..." }).pipe(
 *       Stream.tap((event) => Effect.log("Event:", event)),
 *       Stream.runDrain
 *     )
 *   })
 * )
 * ```
 */
import { BrowserSocket } from "@effect/platform-browser";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import type { RpcClientError } from "@effect/rpc/RpcClientError";
import { ChatRpc } from "@sandcastle/rpc";
import { Context, type Effect, Layer, ManagedRuntime } from "effect";
import { getBackendUrl } from "./backend-url";

// ─────────────────────────────────────────────────────────────────────────────
// URL Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert HTTP URL to WebSocket URL.
 * - http:// -> ws://
 * - https:// -> wss://
 * - Appends /ws path
 */
function getWebSocketUrl(): string {
	const httpUrl = getBackendUrl() ?? "http://localhost:3000";

	// Convert protocol
	let wsUrl = httpUrl.replace(/^http:\/\//, "ws://");
	wsUrl = wsUrl.replace(/^https:\/\//, "wss://");

	// Ensure it ends with /ws path (removing any trailing slash first)
	wsUrl = wsUrl.replace(/\/$/, "");

	// Add /ws path
	return `${wsUrl}/ws`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client Type & Service Tag
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The streaming RPC client type for ChatRpc operations.
 * Provides typed access to all chat.* methods.
 */
export type StreamingRpcClient = RpcClient.FromGroup<
	typeof ChatRpc,
	RpcClientError
>;

/**
 * Service tag for the streaming chat client.
 * Use this to access the client in Effect programs.
 */
export class StreamingChatClient extends Context.Tag("StreamingChatClient")<
	StreamingChatClient,
	StreamingRpcClient
>() {}

// ─────────────────────────────────────────────────────────────────────────────
// Protocol Layer Setup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates the WebSocket protocol layer for a given URL.
 * Uses Effect's built-in reconnection with exponential backoff:
 * - 500ms initial delay
 * - 1.5x multiplier
 * - 5s maximum delay
 */
function createWebSocketProtocolLayer(wsUrl: string) {
	return RpcClient.layerProtocolSocket({
		retryTransientErrors: true,
	}).pipe(
		Layer.provide(BrowserSocket.layerWebSocket(wsUrl)),
		Layer.provide(RpcSerialization.layerNdjson),
	);
}

/**
 * Creates a layer that provides the StreamingChatClient.
 * This layer creates the RPC client using the WebSocket protocol.
 */
function createStreamingChatClientLayer(
	wsUrl: string,
): Layer.Layer<StreamingChatClient> {
	const protocol = createWebSocketProtocolLayer(wsUrl);

	// Create a layer that makes the RPC client and provides it as StreamingChatClient
	const clientLayer = Layer.scoped(
		StreamingChatClient,
		RpcClient.make(ChatRpc),
	);

	return clientLayer.pipe(Layer.provide(protocol));
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Runtime Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached singleton runtime.
 * We use a simple cache with the URL as key to invalidate if backend URL changes.
 */
let cachedRuntime: {
	wsUrl: string;
	runtime: ManagedRuntime.ManagedRuntime<StreamingChatClient, never>;
} | null = null;

/**
 * Get or create the singleton managed runtime.
 * The runtime maintains a long-lived scope that keeps the WebSocket connection alive.
 */
function getOrCreateRuntime(): ManagedRuntime.ManagedRuntime<
	StreamingChatClient,
	never
> {
	const wsUrl = getWebSocketUrl();

	// Return cached runtime if URL hasn't changed
	if (cachedRuntime && cachedRuntime.wsUrl === wsUrl) {
		return cachedRuntime.runtime;
	}

	// Dispose old runtime if URL changed (async, but we don't need to wait)
	if (cachedRuntime && cachedRuntime.wsUrl !== wsUrl) {
		const oldRuntime = cachedRuntime.runtime;
		cachedRuntime = null;
		// Fire and forget disposal
		oldRuntime.dispose().catch(console.error);
	}

	// Create the client layer
	const clientLayer = createStreamingChatClientLayer(wsUrl);

	// Create a managed runtime with the client layer
	const runtime = ManagedRuntime.make(clientLayer);

	// Cache the runtime
	cachedRuntime = {
		wsUrl,
		runtime,
	};

	return runtime;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run an Effect that requires StreamingChatClient.
 *
 * This function uses a singleton managed runtime that keeps the WebSocket
 * connection alive across multiple calls. The connection will automatically
 * reconnect on failures with exponential backoff.
 *
 * @example
 * ```ts
 * // Send a message
 * const result = await runWithStreamingClient(
 *   Effect.gen(function* () {
 *     const client = yield* StreamingChatClient
 *     return yield* client.chat.send({
 *       sessionId: "...",
 *       content: "Hello",
 *       clientMessageId: "..."
 *     })
 *   })
 * )
 *
 * // Subscribe to events (stream will run until completion or error)
 * await runWithStreamingClient(
 *   Effect.gen(function* () {
 *     const client = yield* StreamingChatClient
 *     yield* client.chat.subscribe({ sessionId: "..." }).pipe(
 *       Stream.tap((event) => Effect.log("Event:", event)),
 *       Stream.runDrain
 *     )
 *   })
 * )
 * ```
 */
export function runWithStreamingClient<A, E>(
	effect: Effect.Effect<A, E, StreamingChatClient>,
): Promise<A> {
	const runtime = getOrCreateRuntime();
	return runtime.runPromise(effect);
}

/**
 * Run an Effect that requires StreamingChatClient, returning an Exit.
 * Use this when you want to handle errors without throwing.
 */
export function runWithStreamingClientExit<A, E>(
	effect: Effect.Effect<A, E, StreamingChatClient>,
) {
	const runtime = getOrCreateRuntime();
	return runtime.runPromiseExit(effect);
}

/**
 * Fork an Effect that requires StreamingChatClient.
 * Returns a Fiber that can be interrupted or awaited.
 */
export function forkWithStreamingClient<A, E>(
	effect: Effect.Effect<A, E, StreamingChatClient>,
) {
	const runtime = getOrCreateRuntime();
	return runtime.runFork(effect);
}

/**
 * Get an Effect that provides the StreamingChatClient.
 * Useful for composing with other Effects.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const client = yield* makeStreamingRpcClient()
 *   // ... use client
 * })
 * ```
 */
export function makeStreamingRpcClient(): Effect.Effect<
	StreamingRpcClient,
	never,
	StreamingChatClient
> {
	return StreamingChatClient;
}

/**
 * Get a layer that provides the WebSocket protocol for RPC clients.
 * Use this when you need to provide the protocol layer to other Effects.
 *
 * Note: This creates a new protocol layer each time. For singleton behavior,
 * use `runWithStreamingClient` instead.
 */
export function getWebSocketProtocolLayer(): Layer.Layer<RpcClient.Protocol> {
	return createWebSocketProtocolLayer(getWebSocketUrl());
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle & Debugging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dispose the cached runtime and close the WebSocket connection.
 * Primarily used for testing and hot module replacement.
 */
export async function disposeStreamingRpcClient(): Promise<void> {
	if (cachedRuntime) {
		const runtime = cachedRuntime.runtime;
		cachedRuntime = null;
		await runtime.dispose();
	}
}

/**
 * Check if there is an active streaming RPC client.
 */
export function hasActiveStreamingRpcClient(): boolean {
	return cachedRuntime !== null;
}

/**
 * Get the current WebSocket URL that would be used for connections.
 * Useful for debugging connection issues.
 */
export function getCurrentWebSocketUrl(): string {
	return getWebSocketUrl();
}
