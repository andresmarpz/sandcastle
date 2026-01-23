import type { UIMessage } from "ai";
import { memo } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";

interface ChatPanelMessagesProps {
	messages: readonly UIMessage[];
}

export const ChatPanelMessages = memo(function ChatPanelMessages({
	messages,
}: ChatPanelMessagesProps) {
	if (messages.length === 0) {
		return (
			<ConversationEmptyState
				title="No messages yet"
				description="Send a message to start the session."
			/>
		);
	}

	return (
		<>
			{messages.map((message) => (
				<Message
					key={message.id}
					from={message.role === "user" ? "user" : "assistant"}
				>
					<MessageContent>
						{message.parts.map((part, index) => (
							<MessageResponse
								key={`${message.id}-${index}`}
								className="text-subtle-foreground"
							>
								{JSON.stringify(part)}
							</MessageResponse>
						))}
					</MessageContent>
				</Message>
			))}
		</>
	);
});
