import { useAtomValue } from "@effect-atom/atom-react";
import type { ChatMessage as ChatMessageType } from "@sandcastle/rpc";
import { partialMessageFamily } from "@/api/chat-atoms";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { Message, MessageContent } from "../../components/ai-elements/message";
import { ChatMessage, StreamingMessage } from "./chat-message";
import { PixelSpinner } from "./pixel-spinner";

interface MessageListProps {
	messages: readonly ChatMessageType[];
	isStreaming?: boolean;
	sessionId: string;
}

export function MessageList({
	messages,
	isStreaming = false,
	sessionId,
}: MessageListProps) {
	const partialMessage = useAtomValue(partialMessageFamily(sessionId));

	if (messages.length === 0 && !isStreaming) {
		return (
			<ConversationEmptyState
				className="flex-1"
				title="Start a conversation..."
				description=""
			/>
		);
	}

	return (
		<Conversation className="flex-1">
			<ConversationContent className="gap-4">
				{messages.map((message) => (
					<ChatMessage key={message.id} message={message} />
				))}

				{/* Show partial message being streamed */}
				{partialMessage && partialMessage.text && (
					<StreamingMessage text={partialMessage.text} />
				)}

				{/* Show spinner when streaming but no partial text yet */}
				{isStreaming && (
					<Message from="assistant">
						<MessageContent className="flex items-center">
							<PixelSpinner className="text-muted-foreground" />
						</MessageContent>
					</Message>
				)}
			</ConversationContent>
			<ConversationScrollButton />
		</Conversation>
	);
}
