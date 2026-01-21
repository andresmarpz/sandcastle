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
	| { type: "questions"; messageId: string; part: ToolCallPart }
	| {
			type: "subagent";
			messageId: string;
			taskPart: ToolCallPart;
			nestedSteps: WorkStep[];
	  };

/**
 * Represents an open Task tool call that is collecting nested tool calls
 */
interface OpenTask {
	toolCallId: string;
	messageId: string;
	taskPart: ToolCallPart;
	nestedSteps: WorkStep[];
}

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
 * Task tool calls (subagents) are handled specially - their nested tool calls are
 * collected and grouped together.
 *
 * The algorithm:
 * 1. User messages are emitted as-is
 * 2. Assistant text/reasoning parts are emitted individually
 * 3. ExitPlanMode tool calls are emitted as standalone "plan" items
 * 4. AskUserQuestion tool calls are emitted as standalone "questions" items
 * 5. Task tool calls are tracked in a stack; nested tools are collected until Task completes
 * 6. Other consecutive tool parts (within or across assistant messages) are grouped into WorkUnits
 *
 * Example input:
 *   [user, assistant(text), assistant(Task, Write, Read), assistant(text)]
 *
 * Example output:
 *   [user-message, text, subagent(Task with nested Write, Read), text]
 */
export function groupMessages(messages: UIMessage[]): GroupedItem[] {
	const result: GroupedItem[] = [];
	let pendingSteps: WorkStep[] = [];

	// Stack for tracking open Task tool calls (supports nested subagents)
	const openTasks: OpenTask[] = [];

	const flushWorkUnit = () => {
		if (pendingSteps.length > 0) {
			result.push({ type: "work-unit", steps: pendingSteps });
			pendingSteps = [];
		}
	};

	/**
	 * Adds a tool step to either the current open Task's nested steps,
	 * or to the pending work unit if no Task is open.
	 */
	const addToolStep = (step: WorkStep) => {
		const currentTask = openTasks[openTasks.length - 1];
		if (currentTask) {
			// Add to the innermost open Task
			currentTask.nestedSteps.push(step);
		} else {
			pendingSteps.push(step);
		}
	};

	/**
	 * Emits a subagent GroupedItem for a completed Task
	 */
	const emitSubagent = (task: OpenTask) => {
		// If no parent Task is open, flush pending regular work-unit first
		if (openTasks.length === 0) {
			flushWorkUnit();
		}

		result.push({
			type: "subagent",
			messageId: task.messageId,
			taskPart: task.taskPart,
			nestedSteps: task.nestedSteps,
		});
	};

	/**
	 * Handles Task tool state transitions for subagent grouping
	 */
	const handleTaskTool = (toolPart: ToolCallPart, messageId: string) => {
		const { toolCallId, state } = toolPart;

		switch (state) {
			case "input-streaming":
				// Task is still receiving input - do nothing yet
				break;

			case "input-available": {
				// Task input is complete - mark Task as "open"
				// All subsequent tools belong to this Task until we see output
				flushWorkUnit(); // Flush any pending tools before opening Task

				openTasks.push({
					toolCallId,
					messageId,
					taskPart: toolPart,
					nestedSteps: [],
				});
				break;
			}

			case "output-available":
			case "output-error": {
				// Task is complete - find and close it
				const taskIndex = openTasks.findIndex(
					(t) => t.toolCallId === toolCallId,
				);
				const task = openTasks[taskIndex];

				if (taskIndex !== -1 && task) {
					// Found the Task - update its part with final state and emit
					task.taskPart = toolPart; // Update with output/error state

					// Remove from stack
					openTasks.splice(taskIndex, 1);

					// Emit the completed subagent
					emitSubagent(task);
				} else {
					// Edge case: output arrived without input-available (race condition)
					// Emit as a standalone subagent with no nested tools
					emitSubagent({
						toolCallId,
						messageId,
						taskPart: toolPart,
						nestedSteps: [],
					});
				}
				break;
			}
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
				const toolPart = part as ToolCallPart;
				const toolName = getPartToolName(toolPart);

				// Handle Task tool (subagent) specially
				if (isTaskTool(toolName)) {
					handleTaskTool(toolPart, message.id);
				} else if (isExitPlanModeTool(toolName)) {
					// ExitPlanMode gets its own standalone "plan" item
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
				} else if (isRenameSessionTool(toolName)) {
					// RenameSession is a silent background tool - don't render it
					// Skip this tool call entirely
				} else {
					// Regular tool - add to current context (open Task or pending)
					addToolStep({
						messageId: message.id,
						part: toolPart,
					});
				}
			}
		}
	}

	// Flush any remaining pending steps
	flushWorkUnit();

	// Handle any unclosed Tasks (still streaming)
	// Emit them as subagents in their current state
	for (const openTask of openTasks) {
		result.push({
			type: "subagent",
			messageId: openTask.messageId,
			taskPart: openTask.taskPart,
			nestedSteps: openTask.nestedSteps,
		});
	}

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
		case "Task": {
			const description = input?.description as string | undefined;
			const subagentType = input?.subagent_type as string | undefined;
			if (description) return description;
			if (subagentType) return `${subagentType} subagent`;
			return "Running subagent";
		}
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
