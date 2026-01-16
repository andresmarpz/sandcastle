import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
	ChatMessage,
	type MessagePart,
	type MessageRole,
	ReasoningPart,
	TextPart,
	ToolCallPart,
} from "@sandcastle/schemas";
import type {
	TextContentBlock,
	ThinkingContentBlock,
	ToolResultContentBlock,
	ToolUseContentBlock,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Session metadata extracted from SDKResultMessage */
export interface SessionMetadata {
	claudeSessionId: string;
	durationMs: number;
	durationApiMs: number;
	totalCostUsd: number;
	inputTokens: number;
	outputTokens: number;
	numTurns: number;
	success: boolean;
	result?: string;
	errors?: string[];
}

/** Configuration for the accumulator */
export interface AccumulatorConfig {
	/** ID generator for messages without UUID */
	generateId: () => string;
	/** Storage session ID (your system's session, not Claude's) */
	storageSessionId: string;
}

/** Tool call location for correlation */
interface ToolCallLocation {
	messageIndex: number;
	partIndex: number;
}

/** Internal accumulator state */
interface AccumulatorState {
	messages: ChatMessage[];
	claudeSessionId: string | null;
	sessionMetadata: SessionMetadata | null;
	pendingToolCalls: Map<string, ToolCallLocation>;
}

/** Message accumulator interface */
export interface MessageAccumulator {
	/** Process an SDKMessage and update internal state */
	process(message: SDKMessage): void;
	/** Get all accumulated ChatMessages */
	getMessages(): ChatMessage[];
	/** Get session metadata (available after result message) */
	getSessionMetadata(): SessionMetadata | null;
	/** Get the Claude session ID (for resume capability) */
	getClaudeSessionId(): string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a message accumulator that transforms SDKMessages into ChatMessages
 *
 * @example
 * ```ts
 * const accumulator = createMessageAccumulator({
 *   generateId: () => crypto.randomUUID(),
 *   storageSessionId: "session_123"
 * });
 *
 * for await (const sdkMessage of claudeStream) {
 *   accumulator.process(sdkMessage);
 * }
 *
 * const messages = accumulator.getMessages();
 * const metadata = accumulator.getSessionMetadata();
 * ```
 */
export function createMessageAccumulator(
	config: AccumulatorConfig,
): MessageAccumulator {
	const state: AccumulatorState = {
		messages: [],
		claudeSessionId: null,
		sessionMetadata: null,
		pendingToolCalls: new Map(),
	};

	return {
		process(message: SDKMessage): void {
			switch (message.type) {
				case "system":
					if (message.subtype === "init") {
						state.claudeSessionId = message.session_id;
					}
					// compact_boundary and other system messages don't produce ChatMessages
					break;

				case "assistant":
					processAssistantMessage(
						message as SDKAssistantMessage,
						state,
						config,
					);
					break;

				case "user":
					processUserMessage(message as SDKUserMessage, state, config);
					break;

				case "result":
					processResultMessage(message as SDKResultMessage, state);
					break;

				// stream_event, compact_boundary, etc. are skipped for storage
			}
		},

		getMessages(): ChatMessage[] {
			return state.messages;
		},

		getSessionMetadata(): SessionMetadata | null {
			return state.sessionMetadata;
		},

		getClaudeSessionId(): string | null {
			return state.claudeSessionId;
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Processors
// ─────────────────────────────────────────────────────────────────────────────

function processAssistantMessage(
	message: SDKAssistantMessage,
	state: AccumulatorState,
	config: AccumulatorConfig,
): void {
	const parts: MessagePart[] = [];
	const messageIndex = state.messages.length;

	for (const block of message.message.content) {
		if (block.type === "text" && "text" in block) {
			const textBlock = block as TextContentBlock;
			parts.push(
				new TextPart({
					type: "text",
					text: textBlock.text,
					state: "done",
				}),
			);
		} else if (block.type === "thinking" && "thinking" in block) {
			const thinkingBlock = block as ThinkingContentBlock;
			parts.push(
				new ReasoningPart({
					type: "reasoning",
					text: thinkingBlock.thinking,
					state: "done",
				}),
			);
		} else if (
			block.type === "tool_use" &&
			"id" in block &&
			"name" in block &&
			"input" in block
		) {
			const toolBlock = block as ToolUseContentBlock;
			const partIndex = parts.length;

			parts.push(
				new ToolCallPart({
					type: `tool-${toolBlock.name}`,
					toolCallId: toolBlock.id,
					toolName: toolBlock.name,
					input: toolBlock.input,
					state: "input-available",
				}),
			);

			// Track for tool result correlation
			state.pendingToolCalls.set(toolBlock.id, {
				messageIndex,
				partIndex,
			});
		}
	}

	// Only create message if there are parts
	if (parts.length > 0) {
		const now = new Date().toISOString();
		state.messages.push(
			new ChatMessage({
				id: message.uuid,
				sessionId: config.storageSessionId,
				role: "assistant" as MessageRole,
				parts,
				createdAt: now,
				metadata: {
					claudeSessionId: message.session_id,
					model: message.message.model,
				},
			}),
		);
	}
}

function processUserMessage(
	message: SDKUserMessage,
	state: AccumulatorState,
	config: AccumulatorConfig,
): void {
	const content = message.message.content;
	const userParts: MessagePart[] = [];

	// Handle string content
	if (typeof content === "string") {
		userParts.push(
			new TextPart({
				type: "text",
				text: content,
				state: "done",
			}),
		);
	} else if (Array.isArray(content)) {
		// Process array content - first handle tool results (they update assistant messages)
		for (const block of content) {
			if (block.type === "tool_result" && "tool_use_id" in block) {
				applyToolResult(block as ToolResultContentBlock, state);
			}
		}

		// Then collect visible user content
		for (const block of content) {
			if (block.type === "text" && "text" in block) {
				const textBlock = block as TextContentBlock;
				userParts.push(
					new TextPart({
						type: "text",
						text: textBlock.text,
						state: "done",
					}),
				);
			}
			// Note: image blocks could be handled here as FilePart if needed
		}
	}

	// Only create user message if there's visible content (not just tool_result)
	if (userParts.length > 0) {
		const now = new Date().toISOString();
		state.messages.push(
			new ChatMessage({
				id: message.uuid ?? config.generateId(),
				sessionId: config.storageSessionId,
				role: "user" as MessageRole,
				parts: userParts,
				createdAt: now,
			}),
		);
	}
}

function applyToolResult(
	result: ToolResultContentBlock,
	state: AccumulatorState,
): void {
	const location = state.pendingToolCalls.get(result.tool_use_id);
	if (!location) return;

	const message = state.messages[location.messageIndex];
	if (!message) return;

	const part = message.parts[location.partIndex];
	if (!part || part.type.startsWith("tool-") === false) return;

	// Type assertion since we know this is a ToolCallPart
	const toolPart = part as ToolCallPart;

	// Extract output content
	const outputContent =
		typeof result.content === "string"
			? result.content
			: JSON.stringify(result.content);

	// Create updated part with new state
	const updatedPart = new ToolCallPart({
		...toolPart,
		state: result.is_error ? "output-error" : "output-available",
		output: result.is_error ? undefined : outputContent,
		errorText: result.is_error ? outputContent : undefined,
	});

	// Replace the part in the message
	// Note: We're mutating here for simplicity since ChatMessage.parts is mutable
	(message.parts as MessagePart[])[location.partIndex] = updatedPart;

	// Remove from pending
	state.pendingToolCalls.delete(result.tool_use_id);
}

function processResultMessage(
	message: SDKResultMessage,
	state: AccumulatorState,
): void {
	const isSuccess = message.subtype === "success";

	state.sessionMetadata = {
		claudeSessionId: message.session_id,
		durationMs: message.duration_ms,
		durationApiMs: message.duration_api_ms,
		totalCostUsd: message.total_cost_usd,
		inputTokens: message.usage.input_tokens,
		outputTokens: message.usage.output_tokens,
		numTurns: message.num_turns,
		success: isSuccess,
		result: isSuccess
			? (message as SDKResultMessage & { result: string }).result
			: undefined,
		errors: !isSuccess
			? (message as SDKResultMessage & { errors: string[] }).errors
			: undefined,
	};

	// Store Claude session ID if not already set
	if (!state.claudeSessionId) {
		state.claudeSessionId = message.session_id;
	}
}
