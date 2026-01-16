/**
 * Mock implementation of ClaudeSDKService for testing
 *
 * This mock allows tests to control the stream of SDK messages,
 * simulate errors, and verify interactions.
 */
import type { SDKMessage, SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { Effect, Layer, Queue, Stream } from "effect";
import { ClaudeSDKError } from "./errors";
import { ClaudeSDKService } from "./service";
import type { QueryHandle, QueryOptions } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Control Types
// ─────────────────────────────────────────────────────────────────────────────

/** Controller for a mock query stream */
export interface MockQueryController {
	/** Emit SDK messages to the stream */
	readonly emit: (message: SDKMessage) => Effect.Effect<void>;
	/** Emit multiple SDK messages at once */
	readonly emitMany: (messages: SDKMessage[]) => Effect.Effect<void>;
	/** Complete the stream successfully */
	readonly complete: () => Effect.Effect<void>;
	/** Fail the stream with an error */
	readonly fail: (error: ClaudeSDKError) => Effect.Effect<void>;
	/** Check if stream was interrupted */
	readonly wasInterrupted: () => boolean;
}

/** Factory for creating mock SDK messages */
export const MockMessages = {
	systemInit: (sessionId: string): SDKMessage =>
		({
			type: "system",
			subtype: "init",
			session_id: sessionId,
			uuid: `system-${sessionId}`,
		}) as unknown as SDKMessage,

	assistant: (
		uuid: string,
		content: Array<{ type: string; [key: string]: unknown }>,
		sessionId = "mock-claude-session",
	): SDKMessage =>
		({
			type: "assistant",
			uuid,
			session_id: sessionId,
			message: {
				role: "assistant",
				content,
				model: "claude-sonnet-4-20250514",
				stop_reason: "end_turn",
				usage: { input_tokens: 100, output_tokens: 50 },
			},
			parent_tool_use_id: null,
		}) as unknown as SDKMessage,

	text: (uuid: string, text: string, sessionId?: string): SDKMessage =>
		MockMessages.assistant(uuid, [{ type: "text", text }], sessionId),

	toolUse: (
		uuid: string,
		toolCallId: string,
		toolName: string,
		input: Record<string, unknown>,
		sessionId?: string,
	): SDKMessage =>
		MockMessages.assistant(
			uuid,
			[{ type: "tool_use", id: toolCallId, name: toolName, input }],
			sessionId,
		),

	user: (
		content: string | Array<{ type: string; [key: string]: unknown }>,
		uuid?: string,
		sessionId = "mock-claude-session",
	): SDKMessage =>
		({
			type: "user",
			uuid,
			session_id: sessionId,
			message: {
				role: "user",
				content,
			},
			parent_tool_use_id: null,
		}) as unknown as SDKMessage,

	toolResult: (
		toolUseId: string,
		content: string,
		isError = false,
	): SDKMessage =>
		MockMessages.user([
			{ type: "tool_result", tool_use_id: toolUseId, content, is_error: isError },
		]),

	result: (
		success: boolean,
		sessionId = "mock-claude-session",
	): SDKResultMessage =>
		success
			? ({
					type: "result",
					subtype: "success",
					uuid: "result-uuid",
					session_id: sessionId,
					duration_ms: 5000,
					duration_api_ms: 4500,
					is_error: false,
					num_turns: 3,
					result: "Task completed successfully",
					total_cost_usd: 0.05,
					usage: { input_tokens: 1000, output_tokens: 500 },
					modelUsage: {},
					permission_denials: [],
				} as SDKResultMessage)
			: ({
					type: "result",
					subtype: "error_during_execution",
					uuid: "result-uuid",
					session_id: sessionId,
					duration_ms: 3000,
					duration_api_ms: 2500,
					is_error: true,
					num_turns: 2,
					total_cost_usd: 0.02,
					usage: { input_tokens: 500, output_tokens: 200 },
					modelUsage: {},
					permission_denials: [],
					errors: ["Something went wrong"],
				} as SDKResultMessage),
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock Implementation
// ─────────────────────────────────────────────────────────────────────────────

/** State for tracking mock queries */
interface MockState {
	queries: Array<{
		prompt: string;
		options: QueryOptions;
		controller: MockQueryController;
	}>;
}

/**
 * Creates a mock ClaudeSDKService with controllable streams
 *
 * @example
 * ```ts
 * const { service, getController, getQueries } = createMockClaudeSDKService();
 *
 * // In test
 * const controller = await getController(0); // Get first query's controller
 * await Effect.runPromise(controller.emit(MockMessages.text("msg-1", "Hello")));
 * await Effect.runPromise(controller.emit(MockMessages.result(true)));
 * await Effect.runPromise(controller.complete());
 * ```
 */
export function createMockClaudeSDKService(): {
	service: typeof ClaudeSDKService.Service;
	/** Get controller for query at index (waits for query to be made) */
	getController: (index: number) => Promise<MockQueryController>;
	/** Get all queries made so far */
	getQueries: () => Array<{ prompt: string; options: QueryOptions }>;
	/** Get total number of queries */
	getQueryCount: () => number;
} {
	const state: MockState = { queries: [] };

	const service: typeof ClaudeSDKService.Service = {
		query: (prompt, options) =>
			Effect.gen(function* () {
				// Create a bounded queue for controlling the stream
				const messageQueue = yield* Queue.bounded<
					| { _tag: "message"; message: SDKMessage }
					| { _tag: "complete" }
					| { _tag: "fail"; error: ClaudeSDKError }
				>(100);

				let interrupted = false;

				const controller: MockQueryController = {
					emit: (message) => Queue.offer(messageQueue, { _tag: "message", message }),
					emitMany: (messages) =>
						Effect.forEach(messages, (message) =>
							Queue.offer(messageQueue, { _tag: "message", message }),
						).pipe(Effect.asVoid),
					complete: () => Queue.offer(messageQueue, { _tag: "complete" }),
					fail: (error) => Queue.offer(messageQueue, { _tag: "fail", error }),
					wasInterrupted: () => interrupted,
				};

				state.queries.push({ prompt, options, controller });

				// Create stream from queue
				const stream = Stream.repeatEffectOption(
					Queue.take(messageQueue).pipe(
						Effect.flatMap((item) => {
							switch (item._tag) {
								case "message":
									return Effect.succeed(item.message);
								case "complete":
									return Effect.fail(new Option.None());
								case "fail":
									return Effect.fail(new Option.Some(item.error));
							}
						}),
						Effect.catchTag("None", () => Effect.fail(Option.none())),
					),
				);

				const handle: QueryHandle = {
					stream,
					interrupt: Effect.sync(() => {
						interrupted = true;
					}),
					setModel: () => Effect.void,
					setPermissionMode: () => Effect.void,
					setMaxThinkingTokens: () => Effect.void,
				};

				return handle;
			}),
	};

	return {
		service,
		getController: async (index: number) => {
			// Wait for query to be made (with timeout)
			const maxWait = 5000;
			const interval = 10;
			let waited = 0;

			while (waited < maxWait) {
				if (state.queries[index]) {
					return state.queries[index].controller;
				}
				await new Promise((resolve) => setTimeout(resolve, interval));
				waited += interval;
			}

			throw new Error(`Query at index ${index} was not made within ${maxWait}ms`);
		},
		getQueries: () =>
			state.queries.map(({ prompt, options }) => ({ prompt, options })),
		getQueryCount: () => state.queries.length,
	};
}

// Need Option for the stream implementation
import { Option } from "effect";

/**
 * Create a Layer for the mock service
 */
export function createMockClaudeSDKLayer(): {
	layer: Layer.Layer<ClaudeSDKService>;
	getController: (index: number) => Promise<MockQueryController>;
	getQueries: () => Array<{ prompt: string; options: QueryOptions }>;
	getQueryCount: () => number;
} {
	const mock = createMockClaudeSDKService();

	return {
		layer: Layer.succeed(ClaudeSDKService, mock.service),
		getController: mock.getController,
		getQueries: mock.getQueries,
		getQueryCount: mock.getQueryCount,
	};
}
