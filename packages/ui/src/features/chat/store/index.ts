/**
 * Chat Store Module
 *
 * Global chat state management with Zustand.
 * Provides subscription management and React hooks.
 */

export type {
	ChatSessionState,
	ChatStore,
	ChatStoreActions,
	ChatStoreState,
	HistoryCursor,
	SendResult,
	StreamingMetadata,
	ToolApprovalRequest,
} from "./chat-store";
// Store and types
export { chatStore } from "./chat-store";
export type {
	FilePart,
	ReasoningPart,
	SourceDocumentPart,
	SourceUrlPart,
	TextPart,
	ToolInvocationPart,
	UIMessagePart,
} from "./message-accumulator";

// Message accumulator (for advanced use)
export { MessageAccumulator } from "./message-accumulator";
// React hooks
export {
	useChatActions,
	useChatConnectionState,
	useChatMode,
	useChatSession,
	useChatSessionSelector,
	useChatSessionSnapshot,
	useChatStatus,
	useIsAnsweredQuestion,
	useOptimisticPlanApproval,
	usePendingAskUserQuestionApproval,
	usePendingExitPlanApproval,
	usePendingToolApprovals,
	useRespondToToolApproval,
	useSetChatHistory,
	useSetChatMode,
	useStreamingMetadata,
} from "./use-chat-session";
