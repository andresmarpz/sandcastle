/**
 * Chat Store Module
 *
 * Global chat state management with Zustand.
 * Provides subscription management and React hooks.
 */

// Store and types
export { chatStore } from "./chat-store";
export type {
	ChatSessionState,
	ChatStore,
	ChatStoreActions,
	ChatStoreState,
	HistoryCursor,
} from "./chat-store";

// React hooks
export {
	useChatActions,
	useChatConnectionState,
	useChatMessages,
	useChatSession,
	useChatSessionSelector,
	useChatSessionSnapshot,
	useChatStatus,
	useSetChatHistory,
} from "./use-chat-session";

// Message accumulator (for advanced use)
export { MessageAccumulator } from "./message-accumulator";
export type {
	FilePart,
	ReasoningPart,
	SourceDocumentPart,
	SourceUrlPart,
	TextPart,
	ToolInvocationPart,
	UIMessagePart,
} from "./message-accumulator";
