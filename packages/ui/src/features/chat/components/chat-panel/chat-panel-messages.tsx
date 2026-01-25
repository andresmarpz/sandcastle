import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import { type GroupedItem, groupMessages } from "./helpers/group-messages";
import { SubagentMessage } from "./messages/subagent";
import { TasksMessage, TodoTraceMessage } from "./messages/tasks";
import { WorkUnit } from "./messages/work-unit";

interface ChatPanelMessagesProps {
	messages: readonly UIMessage[];
}

export const ChatPanelMessages = memo(function ChatPanelMessages({
	messages,
}: ChatPanelMessagesProps) {
	const groupedItems = useMemo(() => groupMessages(messages), [messages]);

	if (messages.length === 0) {
		return (
			<ConversationEmptyState
				title="No messages yet"
				description="Send a message to start the session."
			/>
		);
	}

	return groupedItems.map((item) => (
		<GroupedItemRenderer key={item.id} item={item} />
	));
});

interface GroupedItemRendererProps {
	item: GroupedItem;
}

const GroupedItemRenderer = memo(function GroupedItemRenderer({
	item,
}: GroupedItemRendererProps) {
	switch (item.type) {
		case "user-message":
			return (
				<Message from="user">
					<MessageContent>
						{item.message.parts.map((part, index) => {
							if (part.type === "text") {
								return (
									<MessageResponse key={`${item.message.id}-${index}`}>
										{part.text}
									</MessageResponse>
								);
							}
							return null;
						})}
					</MessageContent>
				</Message>
			);

		case "assistant-text":
			return (
				<Message from="assistant">
					<MessageContent>
						<MessageResponse>{item.text}</MessageResponse>
					</MessageContent>
				</Message>
			);

		case "work-unit":
			return (
				<Message from="assistant">
					<MessageContent>
						<WorkUnit steps={item.steps} />
					</MessageContent>
				</Message>
			);

		case "subagent":
			return (
				<Message from="assistant">
					<MessageContent>
						<SubagentMessage item={item} />
					</MessageContent>
				</Message>
			);

		case "tasks":
			return (
				<Message from="assistant">
					<MessageContent>
						<TasksMessage item={item} />
					</MessageContent>
				</Message>
			);

		case "todo-trace":
			return (
				<Message from="assistant">
					<MessageContent>
						<TodoTraceMessage item={item} />
					</MessageContent>
				</Message>
			);

		default:
			return null;
	}
});
