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
import { PlanPart } from "./parts/plan-part";
import { QuestionsPart } from "./parts/questions-part";
import { ReasoningPart } from "./parts/reasoning-part";
import { SubagentPart } from "./parts/subagent-part";
import { getToolIcon, WorkStep } from "./work-step";
import { WorkUnit, WorkUnitContent, WorkUnitHeader } from "./work-unit";

interface GroupedMessageListProps {
	messages: UIMessage[];
	sessionId: string;
}

export const GroupedMessageList = memo(function GroupedMessageList({
	messages,
	sessionId,
}: GroupedMessageListProps) {
	const groupedItems = useMemo(() => groupMessages(messages), [messages]);

	return (
		<>
			{groupedItems.map((item, index) => (
				<GroupedItemRenderer
					key={`${item.type}-${index}`}
					item={item}
					sessionId={sessionId}
				/>
			))}
		</>
	);
});

interface GroupedItemRendererProps {
	item: GroupedItem;
	sessionId: string;
}

function areGroupedItemsEqual(
	prev: GroupedItemRendererProps,
	next: GroupedItemRendererProps,
): boolean {
	// Check sessionId equality first
	if (prev.sessionId !== next.sessionId) return false;

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

		case "plan":
			// Compare plan items by tool call ID and state
			return (
				nextItem.type === "plan" &&
				prevItem.part.toolCallId === nextItem.part.toolCallId &&
				prevItem.part.state === nextItem.part.state
			);

		case "questions":
			// Compare questions items by tool call ID and state
			return (
				nextItem.type === "questions" &&
				prevItem.part.toolCallId === nextItem.part.toolCallId &&
				prevItem.part.state === nextItem.part.state
			);

		case "subagent":
			// Compare subagent items by tool call ID, state, and nested step count
			if (nextItem.type !== "subagent") return false;
			if (prevItem.taskPart.toolCallId !== nextItem.taskPart.toolCallId)
				return false;
			if (prevItem.taskPart.state !== nextItem.taskPart.state) return false;
			if (prevItem.nestedSteps.length !== nextItem.nestedSteps.length)
				return false;
			return prevItem.nestedSteps.every(
				(step, i) =>
					step.part.toolCallId === nextItem.nestedSteps[i]?.part.toolCallId &&
					step.part.state === nextItem.nestedSteps[i]?.part.state,
			);

		default:
			return false;
	}
}

const GroupedItemRenderer = memo(function GroupedItemRenderer({
	item,
	sessionId,
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

		case "plan":
			return (
				<Message from="assistant">
					<MessageContent>
						<PlanPart part={item.part} sessionId={sessionId} />
					</MessageContent>
				</Message>
			);

		case "questions":
			return (
				<Message from="assistant">
					<MessageContent>
						<QuestionsPart part={item.part} sessionId={sessionId} />
					</MessageContent>
				</Message>
			);

		case "subagent":
			return (
				<Message from="assistant">
					<MessageContent>
						<SubagentPart
							taskPart={item.taskPart}
							nestedSteps={item.nestedSteps}
						/>
					</MessageContent>
				</Message>
			);

		default:
			return null;
	}
}, areGroupedItemsEqual);
