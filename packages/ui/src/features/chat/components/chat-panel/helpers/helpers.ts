import type { TodoItem } from "../messages/tasks";
import type { ToolStep } from "../messages/work-unit";

/**
 * Extracts the tool name from a message part.
 */
export function getToolName(part: { type: string; toolName?: string }): string {
	if (part.type === "dynamic-tool") {
		return part.toolName ?? "Tool";
	}
	return part.type.replace("tool-", "");
}

/**
 * Normalizes the tool state from various possible values.
 */
export function normalizeState(state: string | undefined): ToolStep["state"] {
	switch (state) {
		case "partial-call":
		case "call":
			return "pending";
		case "running":
		case "streaming":
			return "running";
		case "result":
		case "output-available":
			return "complete";
		case "error":
		case "output-error":
			return "error";
		default:
			return "pending";
	}
}

/**
 * Computes the diff between two todo lists.
 */
export function computeTodoDiff(
	prev: TodoItem[],
	curr: TodoItem[],
): { added: string[]; completed: string[]; started: string[] } {
	// Build a map of previous todos by content for comparison
	const prevByContent = new Map<string, TodoItem>();
	for (const todo of prev) {
		prevByContent.set(todo.content, todo);
	}

	const added: string[] = [];
	const completed: string[] = [];
	const started: string[] = [];

	for (const todo of curr) {
		const prevTodo = prevByContent.get(todo.content);
		if (!prevTodo) {
			added.push(todo.content);
		} else {
			if (todo.status === "completed" && prevTodo.status !== "completed") {
				completed.push(todo.content);
			}
			if (todo.status === "in_progress" && prevTodo.status === "pending") {
				started.push(todo.content);
			}
		}
	}

	return { added, completed, started };
}

/**
 * The base tool name for ExitPlanMode (without MCP prefix)
 */
export const EXIT_PLAN_MODE_TOOL = "ExitPlanMode";

/**
 * Checks if a tool name is the ExitPlanMode tool.
 * Handles both direct name ("ExitPlanMode") and MCP-prefixed name ("mcp__plan-mode-ui__ExitPlanMode")
 */
export function isExitPlanModeTool(toolName: string): boolean {
	return (
		toolName === EXIT_PLAN_MODE_TOOL ||
		toolName.endsWith(`__${EXIT_PLAN_MODE_TOOL}`)
	);
}

/**
 * The base tool name for AskUserQuestion (without MCP prefix)
 */
export const ASK_USER_QUESTION_TOOL = "AskUserQuestion";

/**
 * Checks if a tool name is the AskUserQuestion tool.
 * Handles both direct name ("AskUserQuestion") and MCP-prefixed name
 */
export function isAskUserQuestionTool(toolName: string): boolean {
	return (
		toolName === ASK_USER_QUESTION_TOOL ||
		toolName.endsWith(`__${ASK_USER_QUESTION_TOOL}`)
	);
}

/**
 * The base tool name for RenameSession (without MCP prefix)
 */
export const RENAME_SESSION_TOOL = "RenameSession";

/**
 * Checks if a tool name is the RenameSession tool.
 * Handles both direct name ("RenameSession") and MCP-prefixed name
 */
export function isRenameSessionTool(toolName: string): boolean {
	return (
		toolName === RENAME_SESSION_TOOL ||
		toolName.endsWith(`__${RENAME_SESSION_TOOL}`)
	);
}

/**
 * The base tool name for Task (subagent invocation)
 */
export const TASK_TOOL = "Task";

/**
 * Checks if a tool name is the Task tool (subagent).
 * Handles both direct name ("Task") and MCP-prefixed name
 */
export function isTaskTool(toolName: string): boolean {
	return toolName === TASK_TOOL || toolName.endsWith(`__${TASK_TOOL}`);
}
