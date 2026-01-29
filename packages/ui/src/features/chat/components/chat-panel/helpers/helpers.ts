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
 * Task management tool names
 */
const TASK_MGMT_TOOLS = [
	"TaskCreate",
	"TaskUpdate",
	"TaskList",
	"TaskGet",
] as const;

export type TaskMgmtToolName = (typeof TASK_MGMT_TOOLS)[number];

/**
 * Checks if a tool name is a task management tool.
 */
export function isTaskMgmtTool(toolName: string): boolean {
	return TASK_MGMT_TOOLS.some(
		(t) => toolName === t || toolName.endsWith(`__${t}`),
	);
}

/**
 * Gets the base task management tool name from a possibly prefixed tool name.
 */
export function getTaskMgmtToolType(toolName: string): TaskMgmtToolName | null {
	for (const t of TASK_MGMT_TOOLS) {
		if (toolName === t || toolName.endsWith(`__${t}`)) {
			return t;
		}
	}
	return null;
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
