import type { UIMessage } from "ai";

// Re-export for convenience
export type { UIMessage } from "ai";

// UIMessagePart requires type parameters, so we derive it from UIMessage
export type UIMessagePart = UIMessage["parts"][number];

// Extended metadata for our sessions
export interface ChatSessionMetadata {
	claudeSessionId?: string;
	costUsd?: number;
	inputTokens?: number;
	outputTokens?: number;
}
