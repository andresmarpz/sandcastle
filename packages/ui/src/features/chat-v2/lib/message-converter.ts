import type {
	ChatMessage,
	MessagePart,
	ReasoningPart,
	TextPart,
} from "@sandcastle/rpc";
import type { UIMessage } from "ai";
import type { UIMessagePart } from "./types";

/**
 * Convert a storage MessagePart to an AI SDK UIMessagePart.
 *
 * Most parts are now directly compatible since storage schema
 * is aligned with AI SDK v6 UIMessage format.
 *
 * Only ReasoningPart needs conversion: storage uses `reasoning`, AI SDK uses `text`
 */
function convertPart(part: MessagePart): UIMessagePart {
	// Check for TextPart - pass through directly
	if (part.type === "text") {
		const textPart = part as TextPart;
		return {
			type: "text",
			text: textPart.text,
		};
	}

	// Check for ReasoningPart - needs field name mapping
	if (part.type === "reasoning") {
		const reasoningPart = part as ReasoningPart;
		return {
			type: "reasoning",
			text: reasoningPart.reasoning,
		};
	}

	// ToolCallPart and any other parts - pass through directly
	// Storage schema is now aligned with AI SDK (input/output, state values)
	return part as UIMessagePart;
}

/**
 * Convert a storage ChatMessage to an AI SDK UIMessage.
 */
export function convertChatMessageToUIMessage(msg: ChatMessage): UIMessage {
	return {
		id: msg.id,
		role: msg.role,
		parts: msg.parts.map(convertPart),
	};
}

/**
 * Convert an array of storage ChatMessages to AI SDK UIMessages.
 * Use this to convert history fetched from the backend to the format
 * expected by useChat's initialMessages.
 */
export function convertChatHistory(
	messages: readonly ChatMessage[],
): UIMessage[] {
	return messages.map(convertChatMessageToUIMessage);
}
