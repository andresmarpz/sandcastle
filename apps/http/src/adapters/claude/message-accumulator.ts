import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKResultMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	ChatMessage,
	MessagePart,
	MessageRole,
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a tool name is ExitPlanMode (direct or MCP-prefixed)
 */
function isExitPlanModeTool(toolName: string): boolean {
	return (
		toolName === "ExitPlanMode" ||
		toolName === "mcp__plan-mode-ui__ExitPlanMode"
	);
}

/**
 * Parse ExitPlanMode output to extract approval status and feedback.
 * Returns undefined if the output doesn't match expected patterns.
 */
function parseExitPlanModeOutput(output: string):
	| {
			approved: boolean;
			reason?: string;
	  }
	| undefined {
	// Check for approval pattern
	if (output.includes("Plan approved")) {
		return { approved: true };
	}

	// Check for rejection pattern
	if (output.includes("Plan rejected")) {
		// Extract feedback if present (format: "Plan rejected. User feedback: ...")
		const feedbackMatch = output.match(/User feedback:\s*(.+)$/);
		return {
			approved: false,
			reason: feedbackMatch?.[1]?.trim() || undefined,
		};
	}

	return undefined;
}

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
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
	contextWindow: number;
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

/** Token usage from a single API call */
interface MessageUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
}

/** Internal accumulator state */
interface AccumulatorState {
	messages: ChatMessage[];
	claudeSessionId: string | null;
	sessionMetadata: SessionMetadata | null;
	pendingToolCalls: Map<string, ToolCallLocation>;
	/** Token usage from the most recent assistant message (for context window calculation) */
	lastAssistantUsage: MessageUsage | null;
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
		lastAssistantUsage: null,
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
			const part: TextPart = {
				type: "text",
				text: textBlock.text,
				state: "done",
			};
			parts.push(part);
		} else if (block.type === "thinking" && "thinking" in block) {
			const thinkingBlock = block as ThinkingContentBlock;
			const part: ReasoningPart = {
				type: "reasoning",
				text: thinkingBlock.thinking,
				state: "done",
			};
			parts.push(part);
		} else if (
			block.type === "tool_use" &&
			"id" in block &&
			"name" in block &&
			"input" in block
		) {
			const toolBlock = block as ToolUseContentBlock;
			const partIndex = parts.length;

			const part: ToolCallPart = {
				type: `tool-${toolBlock.name}`,
				toolCallId: toolBlock.id,
				toolName: toolBlock.name,
				input: toolBlock.input,
				state: "input-available",
			};
			parts.push(part);

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
		const chatMessage: ChatMessage = {
			id: message.uuid,
			sessionId: config.storageSessionId,
			role: "assistant" as MessageRole,
			parts,
			createdAt: now,
			metadata: {
				claudeSessionId: message.session_id,
				model: message.message.model,
			},
		};
		state.messages.push(chatMessage);
	}

	// Capture token usage from this message for context window calculation
	const usage = message.message.usage;
	if (usage) {
		state.lastAssistantUsage = {
			inputTokens: usage.input_tokens ?? 0,
			outputTokens: usage.output_tokens ?? 0,
			cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
			cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
		};
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
		const part: TextPart = {
			type: "text",
			text: content,
			state: "done",
		};
		userParts.push(part);
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
				const part: TextPart = {
					type: "text",
					text: textBlock.text,
					state: "done",
				};
				userParts.push(part);
			}
			// Note: image blocks could be handled here as FilePart if needed
		}
	}

	// Only create user message if there's visible content (not just tool_result)
	if (userParts.length > 0) {
		const now = new Date().toISOString();
		const chatMessage: ChatMessage = {
			id: message.uuid ?? config.generateId(),
			sessionId: config.storageSessionId,
			role: "user" as MessageRole,
			parts: userParts,
			createdAt: now,
		};
		state.messages.push(chatMessage);
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

	// For ExitPlanMode, extract approval info from parsed output
	const approvalInfo =
		!result.is_error && isExitPlanModeTool(toolPart.toolName)
			? parseExitPlanModeOutput(outputContent)
			: undefined;

	// Create updated part with new state
	const updatedPart: ToolCallPart = {
		...toolPart,
		state: result.is_error ? "output-error" : "output-available",
		output: result.is_error ? undefined : outputContent,
		errorText: result.is_error ? outputContent : undefined,
		...(approvalInfo && {
			approval: {
				id: result.tool_use_id,
				approved: approvalInfo.approved,
				reason: approvalInfo.reason,
			},
		}),
	};

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

	// Extract context window from modelUsage (max across all models)
	const contextWindow = extractContextWindow(message.modelUsage);

	// Use last assistant message's usage for context-related tokens (for accurate context window %)
	// Fall back to cumulative result message usage if no assistant message was processed
	const lastUsage = state.lastAssistantUsage;

	state.sessionMetadata = {
		claudeSessionId: message.session_id,
		durationMs: message.duration_ms,
		durationApiMs: message.duration_api_ms,
		totalCostUsd: message.total_cost_usd,
		// Use last message's tokens for context window calculation
		inputTokens: lastUsage?.inputTokens ?? message.usage.input_tokens,
		outputTokens: lastUsage?.outputTokens ?? message.usage.output_tokens,
		cacheReadInputTokens:
			lastUsage?.cacheReadInputTokens ??
			message.usage.cache_read_input_tokens ??
			0,
		cacheCreationInputTokens:
			lastUsage?.cacheCreationInputTokens ??
			message.usage.cache_creation_input_tokens ??
			0,
		contextWindow: contextWindow ?? 0,
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

/**
 * Extract the context window size from modelUsage.
 * Returns the maximum context window across all models used.
 */
function extractContextWindow(
	modelUsage: Record<string, { contextWindow?: number }> | undefined,
): number | undefined {
	if (!modelUsage) return undefined;
	const contextWindows = Object.values(modelUsage)
		.map((usage) => usage.contextWindow)
		.filter((cw): cw is number => typeof cw === "number");
	return contextWindows.length > 0 ? Math.max(...contextWindows) : undefined;
}
