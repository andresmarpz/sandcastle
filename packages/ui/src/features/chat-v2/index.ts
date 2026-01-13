// Main components
export { Chat } from "./chat";
export { ChatInput } from "./chat-input";
export { ChatMessage } from "./chat-message";

// Context
export {
	type ChatSessionContextValue,
	ChatSessionProvider,
	type ChatSessionProviderProps,
	useChatSessionContext,
} from "./context/chat-session-context";

// Hooks
export {
	type UseChatSessionReturn,
	useChatSession,
} from "./hooks/use-chat-session";

// Transport (for advanced usage)
export { createRpcTransport } from "./lib/rpc-transport";
export type {
	RpcTransportConfig,
	SessionMetadata,
	TransportCallbacks,
} from "./lib/transport-types";

// Re-export types from lib
export type {
	ChatSessionMetadata,
	UIMessage,
	UIMessagePart,
} from "./lib/types";

export { MessageList } from "./message-list";
export { PartRenderer } from "./parts";
export { SessionTabs } from "./session-tabs";
