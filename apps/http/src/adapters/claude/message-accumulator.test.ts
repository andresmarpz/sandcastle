/** biome-ignore-all lint/style/noNonNullAssertion: just test files */
import { describe, expect, test } from "bun:test";
import type {
	SDKAssistantMessage,
	SDKResultMessage,
	SDKSystemMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { createMessageAccumulator } from "./message-accumulator";

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

let idCounter = 0;
const mockGenerateId = () => `test-id-${++idCounter}`;

const createAccumulator = (storageSessionId = "storage-session-123") =>
	createMessageAccumulator({
		generateId: mockGenerateId,
		storageSessionId,
	});

// Factory functions for SDK messages
// Using `as unknown as Type` pattern for test mocks since we only need
// the fields that our accumulator actually uses
const createSystemInit = (sessionId: string): SDKSystemMessage =>
	({
		type: "system",
		subtype: "init",
		session_id: sessionId,
		uuid: "system-uuid",
	}) as unknown as SDKSystemMessage;

const createAssistantMessage = (
	uuid: string,
	content: Array<{ type: string; [key: string]: unknown }>,
	sessionId = "claude-session-123",
): SDKAssistantMessage =>
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
	}) as unknown as SDKAssistantMessage;

const createUserMessage = (
	content: string | Array<{ type: string; [key: string]: unknown }>,
	uuid?: string,
	sessionId = "claude-session-123",
): SDKUserMessage =>
	({
		type: "user",
		uuid,
		session_id: sessionId,
		message: {
			role: "user",
			content,
		},
		parent_tool_use_id: null,
	}) as unknown as SDKUserMessage;

const createResultMessage = (
	success: boolean,
	sessionId = "claude-session-123",
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
			} as unknown as SDKResultMessage)
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
				errors: ["Something went wrong", "Another error"],
			} as unknown as SDKResultMessage);

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("createMessageAccumulator", () => {
	describe("system messages", () => {
		test("stores Claude session ID from system.init", () => {
			const accumulator = createAccumulator();

			accumulator.process(createSystemInit("claude-sess-abc"));

			expect(accumulator.getClaudeSessionId()).toBe("claude-sess-abc");
			expect(accumulator.getMessages()).toHaveLength(0); // No ChatMessage created
		});
	});

	describe("assistant messages", () => {
		test("creates ChatMessage with TextPart from text content", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{ type: "text", text: "Hello, I can help you with that." },
				]),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);

			const msg = messages[0]!;
			expect(msg.id).toBe("msg-1");
			expect(msg.role).toBe("assistant");
			expect(msg.sessionId).toBe("storage-session-123");
			expect(msg.parts).toHaveLength(1);

			const part = msg.parts[0]!;
			expect(part.type).toBe("text");
			expect((part as { text: string }).text).toBe(
				"Hello, I can help you with that.",
			);
		});

		test("creates ChatMessage with ReasoningPart from thinking content", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{ type: "thinking", thinking: "Let me analyze this step by step..." },
				]),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);

			const part = messages[0]!.parts[0]!;
			expect(part.type).toBe("reasoning");
			expect((part as { text: string }).text).toBe(
				"Let me analyze this step by step...",
			);
		});

		test("creates ChatMessage with ToolCallPart from tool_use content", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "tool-call-123",
						name: "Read",
						input: { file_path: "/src/index.ts" },
					},
				]),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);

			const part = messages[0]!.parts[0]!;
			expect(part.type).toBe("tool-Read");
			expect((part as { toolCallId: string }).toolCallId).toBe("tool-call-123");
			expect((part as { toolName: string }).toolName).toBe("Read");
			expect((part as { input: unknown }).input).toEqual({
				file_path: "/src/index.ts",
			});
			expect((part as { state: string }).state).toBe("input-available");
		});

		test("creates ChatMessage with multiple parts", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{ type: "thinking", thinking: "Analyzing..." },
					{ type: "text", text: "I'll read that file for you." },
					{
						type: "tool_use",
						id: "tool-1",
						name: "Read",
						input: { file_path: "/test.ts" },
					},
				]),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);
			expect(messages[0]!.parts).toHaveLength(3);
			expect(messages[0]!.parts[0]!.type).toBe("reasoning");
			expect(messages[0]!.parts[1]!.type).toBe("text");
			expect(messages[0]!.parts[2]!.type).toBe("tool-Read");
		});

		test("stores Claude session ID and model in metadata", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage(
					"msg-1",
					[{ type: "text", text: "Hello" }],
					"claude-sess-xyz",
				),
			);

			const msg = accumulator.getMessages()[0]!;
			expect(msg.metadata).toEqual({
				claudeSessionId: "claude-sess-xyz",
				model: "claude-sonnet-4-20250514",
			});
		});
	});

	describe("user messages", () => {
		test("creates ChatMessage with TextPart from string content", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createUserMessage("What is TypeScript?", "user-msg-1"),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);

			const msg = messages[0]!;
			expect(msg.id).toBe("user-msg-1");
			expect(msg.role).toBe("user");
			expect(msg.parts).toHaveLength(1);
			expect(msg.parts[0]!.type).toBe("text");
			expect((msg.parts[0] as { text: string }).text).toBe(
				"What is TypeScript?",
			);
		});

		test("generates ID for user message without UUID", () => {
			const accumulator = createAccumulator();
			idCounter = 0; // Reset counter

			accumulator.process(createUserMessage("Hello"));

			const msg = accumulator.getMessages()[0]!;
			expect(msg.id).toBe("test-id-1");
		});

		test("creates ChatMessage with TextPart from array content", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createUserMessage(
					[{ type: "text", text: "Help me with this code" }],
					"user-msg-2",
				),
			);

			const msg = accumulator.getMessages()[0]!;
			expect(msg.parts).toHaveLength(1);
			expect((msg.parts[0] as { text: string }).text).toBe(
				"Help me with this code",
			);
		});
	});

	describe("tool result correlation", () => {
		test("updates assistant ToolCallPart when user sends tool_result", () => {
			const accumulator = createAccumulator();

			// 1. Assistant calls a tool
			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "tool-call-abc",
						name: "Read",
						input: { file_path: "/test.ts" },
					},
				]),
			);

			// 2. User message with tool result
			accumulator.process(
				createUserMessage([
					{
						type: "tool_result",
						tool_use_id: "tool-call-abc",
						content: "export const foo = 42;",
						is_error: false,
					},
				]),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1); // Only assistant message, no user message

			const toolPart = messages[0]!.parts[0]!;
			expect((toolPart as { state: string }).state).toBe("output-available");
			expect((toolPart as { output: unknown }).output).toBe(
				"export const foo = 42;",
			);
			expect((toolPart as { errorText?: string }).errorText).toBeUndefined();
		});

		test("sets error state on ToolCallPart when tool_result has is_error", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "tool-call-xyz",
						name: "Bash",
						input: { command: "rm -rf /" },
					},
				]),
			);

			accumulator.process(
				createUserMessage([
					{
						type: "tool_result",
						tool_use_id: "tool-call-xyz",
						content: "Permission denied",
						is_error: true,
					},
				]),
			);

			const toolPart = accumulator.getMessages()[0]!.parts[0]!;
			expect((toolPart as { state: string }).state).toBe("output-error");
			expect((toolPart as { errorText: string }).errorText).toBe(
				"Permission denied",
			);
			expect((toolPart as { output?: unknown }).output).toBeUndefined();
		});

		test("creates user message when tool_result is mixed with text", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "tool-1",
						name: "Read",
						input: { file_path: "/test.ts" },
					},
				]),
			);

			accumulator.process(
				createUserMessage(
					[
						{
							type: "tool_result",
							tool_use_id: "tool-1",
							content: "file contents",
						},
						{ type: "text", text: "Now please explain this code" },
					],
					"user-msg-1",
				),
			);

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(2);

			// First message is assistant with updated tool
			expect(messages[0]!.role).toBe("assistant");
			expect((messages[0]!.parts[0] as { state: string }).state).toBe(
				"output-available",
			);

			// Second message is user with text
			expect(messages[1]!.role).toBe("user");
			expect((messages[1]!.parts[0] as { text: string }).text).toBe(
				"Now please explain this code",
			);
		});

		test("handles multiple tool calls in one assistant message", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "tool-1",
						name: "Read",
						input: { file_path: "/a.ts" },
					},
					{
						type: "tool_use",
						id: "tool-2",
						name: "Read",
						input: { file_path: "/b.ts" },
					},
				]),
			);

			// Results come in user message
			accumulator.process(
				createUserMessage([
					{ type: "tool_result", tool_use_id: "tool-1", content: "content A" },
					{ type: "tool_result", tool_use_id: "tool-2", content: "content B" },
				]),
			);

			const parts = accumulator.getMessages()[0]!.parts;
			expect(parts).toHaveLength(2);
			expect((parts[0] as { output: string }).output).toBe("content A");
			expect((parts[1] as { output: string }).output).toBe("content B");
		});
	});

	describe("result messages", () => {
		test("extracts session metadata from successful result", () => {
			const accumulator = createAccumulator();

			accumulator.process(createResultMessage(true, "claude-sess-final"));

			const metadata = accumulator.getSessionMetadata();
			expect(metadata).not.toBeNull();
			expect(metadata!.claudeSessionId).toBe("claude-sess-final");
			expect(metadata!.durationMs).toBe(5000);
			expect(metadata!.durationApiMs).toBe(4500);
			expect(metadata!.totalCostUsd).toBe(0.05);
			expect(metadata!.inputTokens).toBe(1000);
			expect(metadata!.outputTokens).toBe(500);
			expect(metadata!.numTurns).toBe(3);
			expect(metadata!.success).toBe(true);
			expect(metadata!.result).toBe("Task completed successfully");
			expect(metadata!.errors).toBeUndefined();
		});

		test("extracts session metadata from error result", () => {
			const accumulator = createAccumulator();

			accumulator.process(createResultMessage(false, "claude-sess-err"));

			const metadata = accumulator.getSessionMetadata();
			expect(metadata).not.toBeNull();
			expect(metadata!.success).toBe(false);
			expect(metadata!.errors).toEqual([
				"Something went wrong",
				"Another error",
			]);
			expect(metadata!.result).toBeUndefined();
		});

		test("sets Claude session ID if not already set", () => {
			const accumulator = createAccumulator();

			accumulator.process(createResultMessage(true, "claude-from-result"));

			expect(accumulator.getClaudeSessionId()).toBe("claude-from-result");
		});
	});

	describe("full conversation flow", () => {
		test("processes complete conversation with multiple turns", () => {
			const accumulator = createAccumulator("my-storage-session");

			// 1. System init
			accumulator.process(createSystemInit("claude-sess"));

			// 2. User asks question
			accumulator.process(createUserMessage("Read /src/index.ts", "user-1"));

			// 3. Assistant thinks and calls tool
			accumulator.process(
				createAssistantMessage("assistant-1", [
					{ type: "thinking", thinking: "I need to read that file" },
					{ type: "text", text: "Let me read that file for you." },
					{
						type: "tool_use",
						id: "read-call",
						name: "Read",
						input: { file_path: "/src/index.ts" },
					},
				]),
			);

			// 4. Tool result
			accumulator.process(
				createUserMessage([
					{
						type: "tool_result",
						tool_use_id: "read-call",
						content: "export const main = () => {}",
					},
				]),
			);

			// 5. Assistant responds
			accumulator.process(
				createAssistantMessage("assistant-2", [
					{
						type: "text",
						text: "The file exports a main function that currently does nothing.",
					},
				]),
			);

			// 6. Result
			accumulator.process(createResultMessage(true));

			// Verify
			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(3); // user, assistant with tool, assistant response

			expect(messages[0]!.role).toBe("user");
			expect(messages[1]!.role).toBe("assistant");
			expect(messages[2]!.role).toBe("assistant");

			// Check tool was completed
			const toolPart = messages[1]!.parts[2]!;
			expect((toolPart as { state: string }).state).toBe("output-available");

			// Check metadata
			expect(accumulator.getSessionMetadata()?.success).toBe(true);
			expect(accumulator.getClaudeSessionId()).toBe("claude-sess");
		});
	});

	describe("edge cases", () => {
		test("ignores tool_result for unknown tool call ID", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createUserMessage([
					{
						type: "tool_result",
						tool_use_id: "unknown-tool",
						content: "some result",
					},
				]),
			);

			// Should not throw, should create no messages
			expect(accumulator.getMessages()).toHaveLength(0);
		});

		test("handles empty assistant message content", () => {
			const accumulator = createAccumulator();

			accumulator.process(createAssistantMessage("msg-1", []));

			// No message created for empty content
			expect(accumulator.getMessages()).toHaveLength(0);
		});

		test("handles stream crash - incomplete tool calls remain pending", () => {
			const accumulator = createAccumulator();

			accumulator.process(
				createAssistantMessage("msg-1", [
					{
						type: "tool_use",
						id: "incomplete-tool",
						name: "Bash",
						input: { command: "ls" },
					},
				]),
			);

			// No result message, simulating crash

			const messages = accumulator.getMessages();
			expect(messages).toHaveLength(1);

			// Tool remains in input-available state
			const toolPart = messages[0]!.parts[0]!;
			expect((toolPart as { state: string }).state).toBe("input-available");
			expect((toolPart as { output?: unknown }).output).toBeUndefined();
		});

		test("all messages have createdAt timestamp", () => {
			const accumulator = createAccumulator();

			accumulator.process(createUserMessage("test", "user-1"));
			accumulator.process(
				createAssistantMessage("assistant-1", [{ type: "text", text: "hi" }]),
			);

			const messages = accumulator.getMessages();
			for (const msg of messages) {
				expect(msg.createdAt).toBeDefined();
				expect(new Date(msg.createdAt).toISOString()).toBe(msg.createdAt);
			}
		});
	});
});
