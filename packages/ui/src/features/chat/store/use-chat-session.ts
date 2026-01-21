import type { ToolApprovalResponse } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import {
	isAskUserQuestionTool,
	isExitPlanModeTool,
} from "@/features/chat/components/group-messages";
import {
	type ChatSessionState,
	chatStore,
	type SendResult,
	type StreamingMetadata,
	type ToolApprovalRequest,
} from "./chat-store";

export interface UseChatSessionResult extends ChatSessionState {
	/** Send a message to the session. Returns when server acknowledges. */
	sendMessage: (options: {
		text: string;
		parts?: UIMessage["parts"];
		mode?: "plan" | "build";
	}) => Promise<SendResult>;
	/** Stop the current stream */
	stop: () => void;
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
		return () => {
			chatStore.getState().leave(sessionId);
		};
	}, [sessionId]);

	// Select session state with automatic re-renders
	const session = useStore(chatStore, (state) => state.getSession(sessionId));

	// Memoized actions
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

	const dequeue = useCallback(
		(messageId: string) => {
			return chatStore.getState().dequeue(sessionId, messageId);
		},
		[sessionId],
	);

	return useMemo(
		() => ({
			...session,
			sendMessage,
			stop,
			dequeue,
		}),
		[session, sendMessage, stop, dequeue],
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
 * Hook for checking if a plan (ExitPlanMode tool call) has been approved.
 *
 * Used to show "Approved" badge on inline plan components after approval.
 *
 * @example
 * ```tsx
 * function PlanPart({ sessionId, toolCallId }: Props) {
 *   const isApproved = useIsApprovedPlan(sessionId, toolCallId)
 *
 *   return (
 *     <Plan defaultOpen={!isApproved}>
 *       {isApproved && <Badge>Approved</Badge>}
 *       <PlanContent>...</PlanContent>
 *     </Plan>
 *   )
 * }
 * ```
 */
export function useIsApprovedPlan(
	sessionId: string,
	toolCallId: string,
): boolean {
	return useStore(chatStore, (state) => {
		const session = state.getSession(sessionId);
		return session.approvedPlanToolCallIds.has(toolCallId);
	});
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
export function useStreamingMetadata(
	sessionId: string,
): StreamingMetadata | null {
	return useChatSessionSelector(sessionId, (s) => s.streamingMetadata);
}
