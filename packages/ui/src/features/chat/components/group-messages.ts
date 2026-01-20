import type { UIMessage } from "ai";
import type { ToolCallPart } from "./parts";

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
 * Represents a step in a work unit (a tool invocation)
 */
export interface WorkStep {
	messageId: string;
	part: ToolCallPart;
}

/**
 * Grouped items for rendering - either individual content or grouped work units
 */
export type GroupedItem =
	| { type: "user-message"; message: UIMessage }
	| { type: "text"; messageId: string; text: string }
	| { type: "reasoning"; messageId: string; text: string; isStreaming: boolean }
	| { type: "work-unit"; steps: WorkStep[] }
	| { type: "plan"; messageId: string; part: ToolCallPart }
	| { type: "questions"; messageId: string; part: ToolCallPart };

/**
 * Gets the tool name from a part for classification purposes
 */
function getPartToolName(part: ToolCallPart): string {
	if (part.type === "dynamic-tool") {
		return part.toolName ?? "";
	}
	// Extract from "tool-Bash" -> "Bash"
	return part.type.replace("tool-", "");
}

/**
 * Groups consecutive tool calls into work units while keeping text parts separate.
 *
 * The algorithm:
 * 1. User messages are emitted as-is
 * 2. Assistant text/reasoning parts are emitted individually
 * 3. ExitPlanMode tool calls are emitted as standalone "plan" items
 * 4. Other consecutive tool parts (within or across assistant messages) are grouped into WorkUnits
 *
 * Example input:
 *   [user, assistant(text), assistant(tool, tool), assistant(text), assistant(ExitPlanMode)]
 *
 * Example output:
 *   [user-message, text, work-unit(2 steps), text, plan]
 */
export function groupMessages(messages: UIMessage[]): GroupedItem[] {
	const result: GroupedItem[] = [];
	let pendingSteps: WorkStep[] = [];

	const flushWorkUnit = () => {
		if (pendingSteps.length > 0) {
			result.push({ type: "work-unit", steps: pendingSteps });
			pendingSteps = [];
		}
	};

	for (const message of messages) {
		if (message.role === "user") {
			flushWorkUnit();
			result.push({ type: "user-message", message });
			continue;
		}

		// Assistant message - process parts
		for (const part of message.parts) {
			if (part.type === "text") {
				flushWorkUnit();
				result.push({
					type: "text",
					messageId: message.id,
					text: part.text,
				});
			} else if (part.type === "reasoning") {
				flushWorkUnit();
				result.push({
					type: "reasoning",
					messageId: message.id,
					text: part.text,
					isStreaming: part.state === "streaming",
				});
			} else if (
				part.type.startsWith("tool-") ||
				part.type === "dynamic-tool"
			) {
				console.log(part);
				const toolPart = part as ToolCallPart;
				const toolName = getPartToolName(toolPart);

				// ExitPlanMode gets its own standalone "plan" item
				if (isExitPlanModeTool(toolName)) {
					flushWorkUnit();
					result.push({
						type: "plan",
						messageId: message.id,
						part: toolPart,
					});
				} else if (isAskUserQuestionTool(toolName)) {
					// AskUserQuestion gets its own standalone "questions" item
					flushWorkUnit();
					result.push({
						type: "questions",
						messageId: message.id,
						part: toolPart,
					});
				} else {
					// Accumulate other tool parts into pending work unit
					pendingSteps.push({
						messageId: message.id,
						part: toolPart,
					});
				}
			}
		}
	}

	// Flush any remaining tool parts
	flushWorkUnit();

	return result;
}

/**
 * Gets the tool name from a tool call part
 */
export function getToolName(part: ToolCallPart): string {
	if (part.type === "dynamic-tool") {
		return part.toolName ?? "Tool";
	}
	// Extract from "tool-Bash" -> "Bash"
	return part.type.replace("tool-", "");
}

/**
 * Gets a human-readable title for a tool call
 */
export function getToolTitle(part: ToolCallPart): string {
	const toolName = getToolName(part);
	const input = part.input as Record<string, unknown> | undefined;

	switch (toolName) {
		case "Bash": {
			const description = input?.description as string | undefined;
			return description ?? "Running command";
		}
		case "Read": {
			const filePath = input?.file_path as string | undefined;
			return filePath ? `Read ${extractFileName(filePath)}` : "Read file";
		}
		case "Write": {
			const filePath = input?.file_path as string | undefined;
			return filePath ? `Write ${extractFileName(filePath)}` : "Write file";
		}
		case "Edit": {
			const filePath = input?.file_path as string | undefined;
			return filePath ? `Edit ${extractFileName(filePath)}` : "Edit file";
		}
		case "Glob": {
			const pattern = input?.pattern as string | undefined;
			return pattern ? `Search: ${pattern}` : "Search files";
		}
		case "Grep": {
			const pattern = input?.pattern as string | undefined;
			return pattern ? `Grep: ${pattern}` : "Search content";
		}
		case "TodoWrite":
			return "Update task list";
		default:
			return part.title ?? toolName;
	}
}

/**
 * Extracts the filename from a path, with smart truncation
 */
function extractFileName(filePath: string): string {
	const parts = filePath.split("/");
	const fileName = parts[parts.length - 1];

	// If filename is short enough, return it
	if (fileName && fileName.length <= 30) {
		return fileName;
	}

	// Try to show relative path from common roots
	const commonRoots = ["packages/", "src/", "apps/", "lib/", "components/"];
	for (const root of commonRoots) {
		const idx = filePath.indexOf(root);
		if (idx !== -1) {
			const relativePath = filePath.slice(idx);
			if (relativePath.length <= 40) {
				return relativePath;
			}
		}
	}

	return fileName ?? filePath;
}
