"use client";

import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	type GroupedItem,
	getToolName,
	getToolTitle,
	groupMessages,
} from "./group-messages";
import { ReasoningPart } from "./parts/reasoning-part";
import { getToolIcon, WorkStep } from "./work-step";
import { WorkUnit, WorkUnitContent, WorkUnitHeader } from "./work-unit";

interface GroupedMessageListProps {
	messages: UIMessage[];
}

export const GroupedMessageList = memo(function GroupedMessageList({
	messages,
}: GroupedMessageListProps) {
	const groupedItems = useMemo(() => groupMessages(messages), [messages]);

	return (
		<>
			{groupedItems.map((item, index) => (
				<GroupedItemRenderer key={`${item.type}-${index}`} item={item} />
			))}
		</>
	);
});

interface GroupedItemRendererProps {
	item: GroupedItem;
}

function areGroupedItemsEqual(
	prev: GroupedItemRendererProps,
	next: GroupedItemRendererProps,
): boolean {
	const prevItem = prev.item;
	const nextItem = next.item;

	// Different types means different items
	if (prevItem.type !== nextItem.type) return false;

	switch (prevItem.type) {
		case "user-message":
			// Compare by message id and parts length
			return (
				nextItem.type === "user-message" &&
				prevItem.message.id === nextItem.message.id &&
				prevItem.message.parts.length === nextItem.message.parts.length
			);

		case "text":
			return (
				nextItem.type === "text" &&
				prevItem.messageId === nextItem.messageId &&
				prevItem.text === nextItem.text
			);

		case "reasoning":
			return (
				nextItem.type === "reasoning" &&
				prevItem.messageId === nextItem.messageId &&
				prevItem.text === nextItem.text &&
				prevItem.isStreaming === nextItem.isStreaming
			);

		case "work-unit":
			// Compare steps by their tool call IDs and length
			if (nextItem.type !== "work-unit") return false;
			if (prevItem.steps.length !== nextItem.steps.length) return false;
			return prevItem.steps.every(
				(step, i) =>
					step.part.toolCallId === nextItem.steps[i]?.part.toolCallId,
			);

		default:
			return false;
	}
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

		case "text":
			return (
				<Message from="assistant">
					<MessageContent>
						<MessageResponse>{item.text}</MessageResponse>
					</MessageContent>
				</Message>
			);

		case "reasoning":
			return (
				<Message from="assistant">
					<MessageContent>
						<ReasoningPart
							reasoning={item.text}
							isStreaming={item.isStreaming}
						/>
					</MessageContent>
				</Message>
			);

		case "work-unit":
			return (
				<Message from="assistant">
					<MessageContent>
						<WorkUnit>
							<WorkUnitHeader stepCount={item.steps.length} />
							<WorkUnitContent>
								{item.steps.map((step) => {
									const toolName = getToolName(step.part);
									const Icon = getToolIcon(toolName);
									const title = getToolTitle(step.part);

									return (
										<WorkStep
											key={step.part.toolCallId}
											icon={Icon}
											title={title}
										/>
									);
								})}
							</WorkUnitContent>
						</WorkUnit>
					</MessageContent>
				</Message>
			);

		default:
			return null;
	}
}, areGroupedItemsEqual);
