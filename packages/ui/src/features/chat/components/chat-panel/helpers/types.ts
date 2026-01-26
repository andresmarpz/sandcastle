import type { ToolCallPart } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import type { SubagentItem } from "../messages/subagent";
import type { TodoTraceItem } from "../messages/tasks";
import type { ToolStep } from "../messages/work-unit";

// Re-export from canonical source
export type { ToolCallPart };

export type UserMessageItem = {
	type: "user-message";
	id: string;
	message: UIMessage;
};

export type AssistantMessageItem = {
	type: "assistant-text";
	id: string;
	messageId: string;
	text: string;
};

export type WorkUnitItem = { type: "work-unit"; id: string; steps: ToolStep[] };

export type PlanItem = {
	type: "plan";
	id: string;
	messageId: string;
	part: ToolCallPart;
};

export type QuestionsItem = {
	type: "questions";
	id: string;
	messageId: string;
	part: ToolCallPart;
};

/**
 * Union of all grouped item types for rendering.
 */
export type GroupedItem =
	| UserMessageItem
	| AssistantMessageItem
	| WorkUnitItem
	| SubagentItem
	| TodoTraceItem
	| PlanItem
	| QuestionsItem;
