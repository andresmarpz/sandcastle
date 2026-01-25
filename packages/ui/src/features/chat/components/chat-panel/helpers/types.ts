import type { UIMessage } from "ai";
import type { SubagentItem } from "../messages/subagent";
import type { TasksItem, TodoTraceItem } from "../messages/tasks";
import type { ToolStep } from "../messages/work-unit";

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

/**
 * Union of all grouped item types for rendering.
 */
export type GroupedItem =
	| UserMessageItem
	| AssistantMessageItem
	| WorkUnitItem
	| SubagentItem
	| TasksItem
	| TodoTraceItem;
