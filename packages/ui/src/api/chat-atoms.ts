import { Atom } from "@effect-atom/atom-react";
import type { ChatMessage } from "@sandcastle/rpc";
import { CHAT_HISTORY_KEY, ChatClient } from "./chat-client";

// Re-export types for consumers
export type { ChatMessage };

// Re-export the client and key for direct use
export { CHAT_HISTORY_KEY, ChatClient };

// ─── Query Atoms ─────────────────────────────────────────────

/**
 * Family of atoms for chat history by session ID.
 * Returns an array of ChatMessage objects for a given session.
 */
export const chatHistoryAtomFamily = Atom.family((sessionId: string) =>
	ChatClient.query(
		"chat.history",
		{ sessionId },
		{
			reactivityKeys: [CHAT_HISTORY_KEY, `chat:history:${sessionId}`],
		},
	),
);

/**
 * Returns the chat history atom for a specific session.
 */
export const chatHistoryQuery = (sessionId: string) =>
	chatHistoryAtomFamily(sessionId);
