import type {
	Session,
	ToolApprovalResponse,
	UsageMetadata,
} from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { clearSessionNotification } from "@/features/chat/services/notification-manager";
import {
	isAskUserQuestionTool,
	isExitPlanModeTool,
} from "../components/chat-panel/helpers/helpers";
import {
	type ChatSessionState,
	chatStore,
	type ToolApprovalRequest,
} from "./chat-store";

export interface UseChatSessionResult extends ChatSessionState {
	/** Remove a message from the queue */
	dequeue: (messageId: string) => Promise<boolean>;
}

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
		// Mark this session as focused (actively viewed by user)
		chatStore.getState().setFocusedSession(sessionId);
		// Clear notification when user views the session
		clearSessionNotification(sessionId);
		return () => {
			chatStore.getState().leave(sessionId);
			// Clear focused session if this was the focused one
			if (chatStore.getState().focusedSessionId === sessionId) {
				chatStore.getState().setFocusedSession(null);
			}
		};
	}, [sessionId]);

	// Select session state with automatic re-renders
	const session = useStore(chatStore, (state) => state.getSession(sessionId));

	const dequeue = useCallback(
		(messageId: string) => {
			return chatStore.getState().dequeue(sessionId, messageId);
		},
		[sessionId],
	);

	return useMemo(
		() => ({
			...session,
			dequeue,
		}),
		[session, dequeue],
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
		({
			text,
			parts,
			mode,
		}: {
			text: string;
			parts?: UIMessage["parts"];
			mode?: "plan" | "build";
		}) => {
			return chatStore.getState().send(sessionId, text, parts, mode);
		},
		[sessionId],
	);

	const stop = useCallback(() => {
		chatStore.getState().stop(sessionId);
	}, [sessionId]);

	return {
		sendMessage,
		stop,
	};
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
	return useStore(chatStore, (state) => selector(state.getSession(sessionId)));
}

/**
 * Hook for reading session status.
 */
export function useChatStatus(sessionId: string): "idle" | "streaming" {
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

/**
 * Hook for reading pending tool approval requests.
 *
 * Returns an array of pending requests for the session.
 *
 * @example
 * ```tsx
 * function ApprovalDialogs({ sessionId }: { sessionId: string }) {
 *   const pendingApprovals = usePendingToolApprovals(sessionId)
 *
 *   return pendingApprovals.map(request => (
 *     <ToolApprovalDialog key={request.toolCallId} request={request} />
 *   ))
 * }
 * ```
 */
export function usePendingToolApprovals(
	sessionId: string,
): ToolApprovalRequest[] {
	return useStore(
		chatStore,
		useShallow((state) => {
			const session = state.getSession(sessionId);
			return Array.from(session.pendingApprovalRequests.values());
		}),
	);
}

/**
 * Hook for responding to tool approval requests.
 *
 * Returns a callback that sends the response and removes
 * the request from the pending map.
 *
 * @example
 * ```tsx
 * function ApprovalDialog({ sessionId, request }: Props) {
 *   const respond = useRespondToToolApproval(sessionId)
 *
 *   const handleApprove = () => {
 *     respond({
 *       type: "tool-approval-response",
 *       toolCallId: request.toolCallId,
 *       toolName: request.toolName,
 *       approved: true,
 *       payload: { type: "ExitPlanModePayload" }
 *     })
 *   }
 *
 *   return <button onClick={handleApprove}>Approve</button>
 * }
 * ```
 */
export function useRespondToToolApproval(
	sessionId: string,
): (response: ToolApprovalResponse) => Promise<boolean> {
	return useCallback(
		(response: ToolApprovalResponse) => {
			return chatStore.getState().respondToToolApproval(sessionId, response);
		},
		[sessionId],
	);
}

/**
 * Hook for setting the session mode (plan/build).
 *
 * The mode can also change automatically when the server
 * emits a mode-change event (e.g., after ExitPlanMode approval).
 *
 * @example
 * ```tsx
 * function ModeSelector({ sessionId }: { sessionId: string }) {
 *   const { mode } = useChatSession(sessionId)
 *   const setMode = useSetChatMode(sessionId)
 *
 *   return (
 *     <select value={mode} onChange={(e) => setMode(e.target.value as "plan" | "build")}>
 *       <option value="plan">Plan</option>
 *       <option value="build">Build</option>
 *     </select>
 *   )
 * }
 * ```
 */
export function useSetChatMode(
	sessionId: string,
): (mode: "plan" | "build") => void {
	return useCallback(
		(mode: "plan" | "build") => {
			chatStore.getState().setMode(sessionId, mode);
		},
		[sessionId],
	);
}

/**
 * Hook for reading the current session mode.
 */
export function useChatMode(sessionId: string): "plan" | "build" {
	return useChatSessionSelector(sessionId, (s) => s.mode);
}

/**
 * Hook for reading the pending ExitPlanMode approval request.
 *
 * Returns the first ExitPlanMode approval request if one exists,
 * otherwise returns null. This is used for inline plan approval UI.
 *
 * @example
 * ```tsx
 * function PlanApprovalBar({ sessionId }: { sessionId: string }) {
 *   const pendingPlan = usePendingExitPlanApproval(sessionId)
 *
 *   if (!pendingPlan) return null
 *
 *   return (
 *     <div>
 *       Plan ready for approval
 *       <button onClick={() => approve(pendingPlan.toolCallId)}>Approve</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function usePendingExitPlanApproval(
	sessionId: string,
): ToolApprovalRequest | null {
	return useStore(
		chatStore,
		useShallow((state) => {
			const session = state.getSession(sessionId);
			for (const request of session.pendingApprovalRequests.values()) {
				if (isExitPlanModeTool(request.toolName)) {
					return request;
				}
			}
			return null;
		}),
	);
}

/**
 * Hook for reading the pending AskUserQuestion approval request for a specific tool call.
 *
 * Returns the matching AskUserQuestion approval request if one exists,
 * otherwise returns null. This is used for inline questions UI.
 */
export function usePendingAskUserQuestionApproval(
	sessionId: string,
	toolCallId: string,
): ToolApprovalRequest | null {
	return useStore(
		chatStore,
		useShallow((state) => {
			const session = state.getSession(sessionId);
			const request = session.pendingApprovalRequests.get(toolCallId);
			if (request && isAskUserQuestionTool(request.toolName)) {
				return request;
			}
			return null;
		}),
	);
}

/**
 * Hook for checking if a question (AskUserQuestion tool call) has been answered.
 *
 * Used to show "Answered" or "Skipped" badge on inline questions components after response.
 */
export function useIsAnsweredQuestion(
	sessionId: string,
	toolCallId: string,
): boolean {
	return useStore(chatStore, (state) => {
		const session = state.getSession(sessionId);
		return session.answeredQuestionToolCallIds.has(toolCallId);
	});
}

/**
 * Hook for reading real-time streaming metadata (token usage, cost).
 *
 * This data comes from the `finish` event during streaming and provides
 * immediate updates without waiting for the session atom to refetch.
 *
 * @example
 * ```tsx
 * function TokenUsage({ sessionId }: { sessionId: string }) {
 *   const metadata = useStreamingMetadata(sessionId)
 *
 *   if (!metadata) return null
 *
 *   return (
 *     <div>
 *       Input: {metadata.inputTokens}
 *       Output: {metadata.outputTokens}
 *     </div>
 *   )
 * }
 * ```
 */
export function useStreamingMetadata(sessionId: string): UsageMetadata | null {
	return useChatSessionSelector(sessionId, (s) => s.streamingMetadata);
}

/**
 * Hook for reading optimistic approval state for a plan (ExitPlanMode tool).
 *
 * Returns the optimistic approval if one exists for this toolCallId,
 * otherwise returns null. This provides immediate UI feedback when
 * the user approves/rejects a plan, before the server confirms.
 *
 * The optimistic state is cleared automatically when:
 * - The server sends tool-output-available event (confirmation)
 * - The session ends (SessionStopped event)
 *
 * @example
 * ```tsx
 * function PlanMessage({ sessionId, toolCallId }: Props) {
 *   const optimisticApproval = useOptimisticPlanApproval(sessionId, toolCallId)
 *
 *   if (optimisticApproval?.approved) {
 *     return <Badge>Approved</Badge>
 *   }
 *   // ... rest of component
 * }
 * ```
 */
export function useOptimisticPlanApproval(
	sessionId: string,
	toolCallId: string,
): { approved: boolean; feedback?: string } | null {
	return useStore(chatStore, (state) => {
		const session = state.getSession(sessionId);
		return session.optimisticApprovals.get(toolCallId) ?? null;
	});
}

/**
 * Hook for reading computed usage metadata with fallback to session entity.
 *
 * Priority:
 * 1. Streaming metadata from real-time events
 * 2. Session entity fields (persisted data)
 *
 * This hook consolidates the fallback logic for usage metadata, making it
 * easier for components to get the correct values without duplicating logic.
 *
 * @example
 * ```tsx
 * function MetadataDisplay({ sessionId, session }: Props) {
 *   const usageMetadata = useUsageMetadata(sessionId, session)
 *   return <div>Cost: ${usageMetadata.costUsd ?? 0}</div>
 * }
 * ```
 */
export function useUsageMetadata(
	sessionId: string,
	session: Session | null,
): UsageMetadata {
	const streamingMetadata = useStreamingMetadata(sessionId);

	return useMemo(
		() => ({
			model: streamingMetadata?.model ?? session?.model ?? undefined,
			inputTokens:
				streamingMetadata?.inputTokens ?? session?.inputTokens ?? undefined,
			outputTokens:
				streamingMetadata?.outputTokens ?? session?.outputTokens ?? undefined,
			cacheReadInputTokens:
				streamingMetadata?.cacheReadInputTokens ??
				session?.cacheReadInputTokens ??
				undefined,
			cacheCreationInputTokens:
				streamingMetadata?.cacheCreationInputTokens ??
				session?.cacheCreationInputTokens ??
				undefined,
			contextWindow:
				streamingMetadata?.contextWindow ?? session?.contextWindow ?? undefined,
			costUsd: streamingMetadata?.costUsd ?? session?.totalCostUsd ?? undefined,
		}),
		[streamingMetadata, session],
	);
}
