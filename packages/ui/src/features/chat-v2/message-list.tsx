import type { UIMessage } from "ai";
import { memo } from "react";
import { ChatMessage } from "./chat-message";

interface MessageListProps {
	messages: UIMessage[];
}

export const MessageList = memo(function MessageList({
	messages,
}: MessageListProps) {
	return (
		<>
			{messages.map((message) => (
				<ChatMessage key={message.id} message={message} />
			))}
		</>
	);
});
