import type { UIMessage } from "ai";
import { ChatMessage } from "./chat-message";

interface MessageListProps {
	messages: UIMessage[];
}

export function MessageList({ messages }: MessageListProps) {
	return (
		<>
			{messages.map((message) => (
				<ChatMessage key={message.id} message={message} />
			))}
		</>
	);
}
