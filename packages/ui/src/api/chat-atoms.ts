import { Atom } from "@effect-atom/atom-react";
import type { GetHistoryResult } from "@sandcastle/rpc";
import type { ChatMessage } from "@sandcastle/schemas";
import { CHAT_HISTORY_KEY, ChatClient } from "./chat-client";

// Re-export types for consumers
export type { ChatMessage, GetHistoryResult };

// Re-export the client and key for direct use
export { CHAT_HISTORY_KEY, ChatClient };

/**
 * Family of atoms for chat history by session ID.
 * Returns a GetHistoryResult (messages + pagination info).
 */
export const chatHistoryAtomFamily = Atom.family((sessionId: string) =>
	ChatClient.query(
		"chat.getHistory",
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

/**
 * Mutation to create a PR by injecting a prompt into the session.
 */
export const createPRMutation = ChatClient.mutation("chat.createPR");
