"use client";

import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";

import { ChatInput } from "./chat-input";
import { AskUserDialog } from "./components/ask-user-dialog";
import { useChatSession } from "./hooks/use-chat-session";
import { MessageList } from "./message-list";

/**
 * Chat component - must be wrapped in ChatSessionProvider.
 * No props needed - gets config from context.
 *
 * @example
 * ```tsx
 * <ChatSessionProvider sessionId="123" worktreeId="456">
 *   <Chat />
 * </ChatSessionProvider>
 * ```
 */
export function Chat() {
	const {
		messages,
		sendMessage,
		status,
		error,
		stop,
		pendingAskUser,
		respondToAskUser,
		sessionMetadata,
	} = useChatSession();

	const handleSend = (text: string) => {
		sendMessage({ text });
	};

	return (
		<div className="flex h-full min-w-0 flex-col">
			{error && (
				<div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
					{error.message}
				</div>
			)}

			<Conversation>
				{messages.length === 0 ? (
					<ConversationEmptyState
						title="Start a conversation"
						description="Send a message to begin"
					/>
				) : (
					<ConversationContent>
						<MessageList messages={messages} />
					</ConversationContent>
				)}
				<ConversationScrollButton />
			</Conversation>

			<ChatInput onSend={handleSend} onStop={stop} status={status} />

			{/* AskUser Dialog */}
			{pendingAskUser && (
				<AskUserDialog event={pendingAskUser} onRespond={respondToAskUser} />
			)}

			{/* Session metadata display */}
			{sessionMetadata && (
				<div className="border-t px-4 py-1 text-xs text-muted-foreground">
					Tokens: {sessionMetadata.inputTokens} in /{" "}
					{sessionMetadata.outputTokens} out
					{sessionMetadata.costUsd > 0 &&
						` | $${sessionMetadata.costUsd.toFixed(4)}`}
				</div>
			)}
		</div>
	);
}
