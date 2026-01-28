import type { UIMessage } from "ai";
import { memo, useCallback, useMemo } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { ConversationEmptyState } from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import { type GroupedItem, groupMessages } from "./helpers/group-messages";
import { PlanMessage } from "./messages/plan-message";
import { Questions } from "./messages/questions";
import { SubagentMessage } from "./messages/subagent";
import { TodoTraceMessage } from "./messages/tasks";
import { WorkUnit } from "./messages/work-unit";

interface ChatPanelMessagesProps {
	messages: readonly UIMessage[];
	sessionId: string;
}

export const ChatPanelMessages = memo(function ChatPanelMessages({
	messages,
	sessionId,
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
		<GroupedItemRenderer key={item.id} item={item} sessionId={sessionId} />
	));
});

interface GroupedItemRendererProps {
	item: GroupedItem;
	sessionId: string;
}

const GroupedItemRenderer = memo(function GroupedItemRenderer({
	item,
	sessionId,
}: GroupedItemRendererProps) {
	const { stopScroll } = useStickToBottomContext();

	const handleClick = useCallback(() => {
		stopScroll();
	}, [stopScroll]);

	// Wrap all items with a click handler to stop auto-scroll when user interacts
	// This prevents being "teleported" to the bottom when expanding collapsible content
	const wrapWithStopScroll = (content: React.ReactNode) => (
		<div onClickCapture={handleClick}>{content}</div>
	);

	switch (item.type) {
		case "user-message":
			return wrapWithStopScroll(
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
				</Message>,
			);

		case "assistant-text":
			return wrapWithStopScroll(
				<Message from="assistant">
					<MessageContent>
						<MessageResponse>{item.text}</MessageResponse>
					</MessageContent>
				</Message>,
			);

		case "work-unit":
			return wrapWithStopScroll(
				<Message from="assistant">
					<MessageContent>
						<WorkUnit steps={item.steps} />
					</MessageContent>
				</Message>,
			);

		case "subagent":
			return wrapWithStopScroll(
				<Message from="assistant">
					<MessageContent>
						<SubagentMessage item={item} />
					</MessageContent>
				</Message>,
			);

		case "todo-trace":
			return wrapWithStopScroll(
				<Message from="assistant">
					<MessageContent>
						<TodoTraceMessage item={item} />
					</MessageContent>
				</Message>,
			);

		case "plan":
			// PlanMessage renders full-width, outside Message wrapper
			return wrapWithStopScroll(
				<PlanMessage part={item.part} sessionId={sessionId} />,
			);

		case "questions":
			return wrapWithStopScroll(
				<Message from="assistant">
					<MessageContent>
						<Questions part={item.part} sessionId={sessionId} />
					</MessageContent>
				</Message>,
			);

		default:
			return null;
	}
});
