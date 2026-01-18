/**
 * React Hooks for Chat Store
 *
 * Provides React bindings for the global chat store.
 * These hooks handle subscription lifecycle and provide
 * reactive access to session state.
 */

import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { chatStore, type ChatSessionState } from "./chat-store";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseChatSessionResult extends ChatSessionState {
	/** Send a message to the session */
	sendMessage: (options: { text: string; parts?: UIMessage["parts"] }) => void;
	/** Stop the current stream */
	stop: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main hook for chat sessions.
 *
 * Manages subscription lifecycle and provides access to session state.
 * Call this hook in components that display or interact with a chat session.
 *
 * @example
 * ```tsx
 * function ChatView({ sessionId }: { sessionId: string }) {
 *   const {
 *     messages,
 *     status,
 *     queue,
 *     isConnected,
 *     error,
 *     sendMessage,
 *     stop,
 *   } = useChatSession(sessionId)
 *
 *   return (
 *     <div>
 *       {messages.map(msg => <Message key={msg.id} message={msg} />)}
 *       <input onSubmit={(text) => sendMessage({ text })} />
 *       {status === "streaming" && <button onClick={stop}>Stop</button>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useChatSession(sessionId: string): UseChatSessionResult {
	// Subscribe to session on mount, leave on unmount
	useEffect(() => {
		chatStore.getState().visit(sessionId);
		return () => {
			chatStore.getState().leave(sessionId);
		};
	}, [sessionId]);

	// Select session state with automatic re-renders
	const session = useStore(chatStore, (state) => state.getSession(sessionId));

	// Memoized actions
	const sendMessage = useCallback(
		({ text, parts }: { text: string; parts?: UIMessage["parts"] }) => {
			chatStore.getState().send(sessionId, text, parts);
		},
		[sessionId],
	);

	const stop = useCallback(() => {
		chatStore.getState().stop(sessionId);
	}, [sessionId]);

	return useMemo(
		() => ({
			...session,
			sendMessage,
			stop,
		}),
		[session, sendMessage, stop],
	);
}

/**
 * Hook for chat actions only.
 *
 * Use this when you only need to send messages or stop,
 * without subscribing to state changes.
 *
 * @example
 * ```tsx
 * function SendButton({ sessionId }: { sessionId: string }) {
 *   const { sendMessage } = useChatActions(sessionId)
 *   return <button onClick={() => sendMessage({ text: "Hello" })}>Send</button>
 * }
 * ```
 */
export function useChatActions(sessionId: string) {
	const sendMessage = useCallback(
		({ text, parts }: { text: string; parts?: UIMessage["parts"] }) => {
			chatStore.getState().send(sessionId, text, parts);
		},
		[sessionId],
	);

	const stop = useCallback(() => {
		chatStore.getState().stop(sessionId);
	}, [sessionId]);

	return useMemo(
		() => ({
			sendMessage,
			stop,
		}),
		[sendMessage, stop],
	);
}

/**
 * Hook for setting initial history.
 *
 * Call this after fetching history to populate the session.
 *
 * @example
 * ```tsx
 * function HistoryLoader({ sessionId }: { sessionId: string }) {
 *   const setHistory = useSetChatHistory(sessionId)
 *   const historyResult = useAtomValue(chatHistoryQuery(sessionId))
 *
 *   useEffect(() => {
 *     if (Result.isSuccess(historyResult)) {
 *       setHistory(historyResult.value.messages)
 *     }
 *   }, [historyResult, setHistory])
 *
 *   return null
 * }
 * ```
 */
export function useSetChatHistory(sessionId: string) {
	return useCallback(
		(messages: UIMessage[]) => {
			chatStore.getState().setHistory(sessionId, messages);
		},
		[sessionId],
	);
}

/**
 * Hook for reading session state without subscribing.
 *
 * Use this for one-time reads or in callbacks where you
 * don't need reactive updates.
 */
export function useChatSessionSnapshot(sessionId: string) {
	return useCallback(() => {
		return chatStore.getState().getSession(sessionId);
	}, [sessionId]);
}

/**
 * Hook for reading specific parts of session state.
 *
 * More efficient than useChatSession when you only need
 * specific properties, as it only re-renders when the
 * selected properties change.
 *
 * @example
 * ```tsx
 * // Only re-render when messages change
 * function MessageList({ sessionId }: { sessionId: string }) {
 *   const messages = useChatSessionSelector(sessionId, s => s.messages)
 *   return messages.map(msg => <Message key={msg.id} message={msg} />)
 * }
 * ```
 */
export function useChatSessionSelector<T>(
	sessionId: string,
	selector: (session: ChatSessionState) => T,
): T {
	// Subscribe to session on mount
	useEffect(() => {
		chatStore.getState().visit(sessionId);
		return () => {
			chatStore.getState().leave(sessionId);
		};
	}, [sessionId]);

	return useStore(chatStore, (state) => selector(state.getSession(sessionId)));
}

/**
 * Hook for reading messages with automatic subscription.
 *
 * Convenience wrapper around useChatSessionSelector.
 */
export function useChatMessages(sessionId: string): UIMessage[] {
	return useChatSessionSelector(sessionId, (s) => s.messages);
}

/**
 * Hook for reading session status.
 */
export function useChatStatus(
	sessionId: string,
): "idle" | "streaming" {
	return useChatSessionSelector(sessionId, (s) => s.status);
}

/**
 * Hook for reading connection state.
 */
export function useChatConnectionState(sessionId: string): {
	isConnected: boolean;
	error: Error | null;
} {
	const isConnected = useChatSessionSelector(sessionId, (s) => s.isConnected);
	const error = useChatSessionSelector(sessionId, (s) => s.error);
	return useMemo(() => ({ isConnected, error }), [isConnected, error]);
}
