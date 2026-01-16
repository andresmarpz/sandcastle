/**
 * Tests for the WebSocket RPC Client Singleton
 */
import { describe, expect, test } from "bun:test";
import {
	disposeStreamingRpcClient,
	getCurrentWebSocketUrl,
	hasActiveStreamingRpcClient,
	makeStreamingRpcClient,
	StreamingChatClient,
} from "./rpc-websocket-client";

describe("rpc-websocket-client", () => {
	test("getCurrentWebSocketUrl converts http to ws", () => {
		// Note: This test assumes default behavior when no backend URL is configured
		const url = getCurrentWebSocketUrl();
		expect(url).toMatch(/^ws:\/\//);
		expect(url).toContain("/ws");
	});

	test("hasActiveStreamingRpcClient returns false initially", () => {
		expect(hasActiveStreamingRpcClient()).toBe(false);
	});

	test("disposeStreamingRpcClient does not throw when no client exists", async () => {
		await expect(disposeStreamingRpcClient()).resolves.toBeUndefined();
	});

	test("makeStreamingRpcClient returns the StreamingChatClient tag", () => {
		const effect = makeStreamingRpcClient();
		// The function returns the Context.Tag, which is an Effect
		expect(effect).toBe(StreamingChatClient);
	});
});
