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
});
