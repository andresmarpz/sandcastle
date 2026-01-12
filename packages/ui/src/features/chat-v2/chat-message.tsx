import type { UIMessage } from "ai";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { PartRenderer } from "./parts";

interface ChatMessageProps {
	message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
	return (
		<Message from={message.role}>
			<MessageContent>
				{message.parts.map((part, index) => (
					<PartRenderer key={`${message.id}-${index}`} part={part} />
				))}
			</MessageContent>
		</Message>
	);
}
