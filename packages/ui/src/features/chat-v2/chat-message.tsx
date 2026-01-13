import type { UIMessage } from "ai";
import { memo } from "react";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { PartRenderer } from "./parts";

interface ChatMessageProps {
	message: UIMessage;
}

export const ChatMessage = memo(
	function ChatMessage({ message }: ChatMessageProps) {
		return (
			<Message from={message.role}>
				<MessageContent>
					{message.parts.map((part, index) => (
						<PartRenderer key={`${message.id}-${index}`} part={part} />
					))}
				</MessageContent>
			</Message>
		);
	},
	(prev, next) =>
		prev.message.id === next.message.id &&
		prev.message.parts.length === next.message.parts.length &&
		prev.message.parts === next.message.parts,
);
