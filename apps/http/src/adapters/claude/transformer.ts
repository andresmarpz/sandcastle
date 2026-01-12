import type {
	AdapterConfig,
	ContentBlock,
	FinishReason,
	TextContentBlock,
	TextUIPart,
	ToolCallUIPart,
	ToolUseContentBlock,
	UIMessage,
	UIMessagePart,
} from "./types";

// ─── Content Block Transformers ───────────────────────────────

/**
 * Transform a text content block to AI SDK text part
 */
export function transformTextBlock(block: TextContentBlock): TextUIPart {
	return { type: "text", text: block.text };
}

/**
 * Transform a tool_use block to AI SDK tool part
 * Returns a tool part with type `tool-{toolName}`
 */
export function transformToolUseBlock(
	block: ToolUseContentBlock,
): ToolCallUIPart {
	return {
		type: `tool-${block.name}`,
		toolCallId: block.id,
		toolName: block.name,
		args: block.input,
		state: "partial", // Will be updated when tool_result arrives
	};
}

// ─── Content Block Array Transformer ──────────────────────────

/**
 * Transform an array of content blocks to AI SDK parts
 * Filters out unsupported block types (thinking, etc.)
 */
export function transformContentBlocks(
	blocks: ContentBlock[],
): UIMessagePart[] {
	const parts: UIMessagePart[] = [];

	for (const block of blocks) {
		switch (block.type) {
			case "text":
				if (block.text) {
					parts.push(transformTextBlock(block));
				}
				break;
			case "tool_use":
				parts.push(transformToolUseBlock(block));
				break;
			// Skip thinking and tool_result blocks for MVP
			// tool_result is handled via stream events
		}
	}

	return parts;
}

// ─── Message Transformers ─────────────────────────────────────

interface AssistantMessageLike {
	uuid: string;
	session_id: string;
	message: {
		content: ContentBlock[];
	};
	parent_tool_use_id: string | null;
}

/**
 * Transform SDKAssistantMessage to UIMessage
 */
export function transformAssistantMessage(
	message: AssistantMessageLike,
): UIMessage {
	const parts = transformContentBlocks(message.message.content);

	return {
		id: message.uuid,
		role: "assistant",
		parts,
		createdAt: new Date(),
		metadata: {
			sessionId: message.session_id,
			parentToolUseId: message.parent_tool_use_id,
		},
	};
}

interface UserMessageLike {
	uuid?: string;
	session_id: string;
	message: {
		content: ContentBlock[];
	};
}

/**
 * Transform SDKUserMessage to UIMessage
 */
export function transformUserMessage(
	message: UserMessageLike,
	config: AdapterConfig,
): UIMessage {
	// Filter to only text parts for user messages
	const parts: UIMessagePart[] = [];

	for (const block of message.message.content) {
		if (block.type === "text" && block.text) {
			parts.push(transformTextBlock(block));
		}
	}

	return {
		id: message.uuid ?? config.generateId(),
		role: "user",
		parts,
		createdAt: new Date(),
	};
}

// ─── Result Mapping ───────────────────────────────────────────

/**
 * Map SDK result subtype to AI SDK finish reason
 */
export function mapFinishReason(subtype: string): FinishReason {
	switch (subtype) {
		case "success":
			return "stop";
		case "error_max_turns":
		case "error_max_budget_usd":
			return "length";
		case "error_during_execution":
		case "error_max_structured_output_retries":
			return "error";
		default:
			return "other";
	}
}
