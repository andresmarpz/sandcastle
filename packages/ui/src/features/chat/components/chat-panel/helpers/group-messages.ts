import type { ToolCallPart } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import type { ToolMetadata, ToolStep } from "../messages/work-unit";
import { getTaskMgmtToolType, getToolName, normalizeState } from "./helpers";
import type { GroupedItem, TaskStatus } from "./types";

export type { SubagentItem } from "../messages/subagent";
export type { ToolMetadata, ToolStep } from "../messages/work-unit";
// Re-export types for consumers
export type {
	GroupedItem,
	PlanItem,
	QuestionsItem,
	TaskTraceItem,
} from "./types";

/**
 * Checks if a tool name is the ExitPlanMode tool.
 * Handles both direct name ("ExitPlanMode") and MCP-prefixed name.
 */
function isExitPlanModeTool(toolName: string): boolean {
	return toolName === "ExitPlanMode" || toolName.endsWith("__ExitPlanMode");
}

/**
 * Checks if a tool name is the AskUserQuestion tool.
 * Handles both direct name ("AskUserQuestion") and MCP-prefixed name.
 */
function isAskUserQuestionTool(toolName: string): boolean {
	return toolName === "AskUserQuestion" || toolName.includes("AskUserQuestion");
}

/**
 * Extracts task ID from tool output string.
 * Handles formats like "Task #1 created successfully: ..." or "Updated task #1 status"
 */
function extractTaskIdFromOutput(output: unknown): string | null {
	if (typeof output !== "string") return null;
	const match = output.match(/[Tt]ask #(\d+)/);
	return match?.[1] ?? null;
}

/**
 * Result of collecting tool steps from messages.
 */
interface CollectedSteps {
	allSteps: ToolStep[];
	childStepsMap: Map<string, ToolStep[]>;
	nestedStepIds: Set<string>;
}

/**
 * Extracts all tool steps from messages and builds parent-child relationships.
 */
function collectToolSteps(messages: readonly UIMessage[]): CollectedSteps {
	const allSteps: ToolStep[] = [];
	const childStepsMap = new Map<string, ToolStep[]>();

	for (const message of messages) {
		if (message.role !== "assistant") continue;

		for (const part of message.parts) {
			if (!part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
				continue;
			}

			const toolPart = part as {
				type: string;
				toolName?: string;
				toolCallId?: string;
				state?: string;
				parentToolCallId?: string | null;
				input?: Record<string, unknown>;
				output?: unknown;
				toolMetadata?: ToolMetadata;
			};

			if (toolPart.toolName?.includes("RenameSession")) continue;

			// Skip ExitPlanMode, AskUserQuestion, and Task management tools - they're handled separately
			const toolName = getToolName(toolPart);
			if (isExitPlanModeTool(toolName)) continue;
			if (isAskUserQuestionTool(toolName)) continue;
			if (getTaskMgmtToolType(toolName)) continue;

			const toolCallId =
				toolPart.toolCallId ?? `${message.id}-tool-${allSteps.length}`;

			const step: ToolStep = {
				id: toolCallId,
				messageId: message.id,
				toolType: part.type,
				toolName: getToolName(toolPart),
				state: normalizeState(toolPart.state),
				parentToolCallId: toolPart.parentToolCallId ?? null,
				input: toolPart.input ?? {},
				output: toolPart.output,
				toolMetadata: toolPart.toolMetadata,
			};

			allSteps.push(step);

			// Build parent-child map
			if (step.parentToolCallId) {
				const children = childStepsMap.get(step.parentToolCallId) ?? [];
				children.push(step);
				childStepsMap.set(step.parentToolCallId, children);
			}
		}
	}

	// Build set of nested step IDs
	const nestedStepIds = new Set<string>();
	for (const children of childStepsMap.values()) {
		for (const child of children) {
			nestedStepIds.add(child.id);
		}
	}

	return { allSteps, childStepsMap, nestedStepIds };
}

/**
 * Tracked task state for computing status transitions.
 */
interface TrackedTask {
	id: string;
	subject: string;
	status: TaskStatus;
}

interface TaskListOutputShape {
	tasks?: Array<{
		id: string;
		subject: string;
		status: TaskStatus;
	}>;
}

/**
 * Result of processing messages into grouped items.
 */
interface ProcessResult {
	items: GroupedItem[];
}

/**
 * Processes messages and emits grouped items.
 */
function processMessages(
	messages: readonly UIMessage[],
	collected: CollectedSteps,
): ProcessResult {
	const { allSteps, childStepsMap, nestedStepIds } = collected;
	const items: GroupedItem[] = [];
	let pendingSteps: ToolStep[] = [];
	let stepIndex = 0;

	// Task state tracking for computing status transitions
	const taskState = new Map<string, TrackedTask>();

	const flushWorkUnit = () => {
		const firstStep = pendingSteps[0];
		if (!firstStep) return;

		items.push({
			type: "work-unit",
			id: `work-unit-${firstStep.id}`,
			steps: pendingSteps,
		});
		pendingSteps = [];
	};

	for (const message of messages) {
		// Handle user messages
		if (message.role === "user") {
			const parentToolCallId = (message as { parentToolCallId?: string | null })
				.parentToolCallId;
			if (parentToolCallId) continue; // Skip subagent user messages

			flushWorkUnit();
			items.push({ type: "user-message", id: message.id, message });
			continue;
		}

		// Handle assistant message parts
		let textPartIndex = 0;

		for (const part of message.parts) {
			// Text part
			if (part.type === "text") {
				flushWorkUnit();
				items.push({
					type: "assistant-text",
					id: `${message.id}-text-${textPartIndex++}`,
					messageId: message.id,
					text: part.text,
				});
				continue;
			}

			// Tool part
			if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
				const toolPart = part as ToolCallPart;
				if (toolPart.toolName?.includes("RenameSession")) continue;

				const partToolName = getToolName(toolPart);

				// ExitPlanMode → emit plan item
				if (isExitPlanModeTool(partToolName)) {
					flushWorkUnit();
					items.push({
						type: "plan",
						id: `plan-${toolPart.toolCallId}`,
						messageId: message.id,
						part: toolPart,
					});
					continue;
				}

				// AskUserQuestion → emit questions item
				if (isAskUserQuestionTool(partToolName)) {
					flushWorkUnit();
					items.push({
						type: "questions",
						id: `questions-${toolPart.toolCallId}`,
						messageId: message.id,
						part: toolPart,
					});
					continue;
				}

				// Task management tools → emit task-trace items
				const taskToolType = getTaskMgmtToolType(partToolName);
				if (taskToolType) {
					const input = toolPart.input as Record<string, unknown> | undefined;

					// TaskList - use output to populate task state (authoritative source)
					if (taskToolType === "TaskList") {
						const output = toolPart.output as TaskListOutputShape | undefined;
						if (output?.tasks) {
							for (const task of output.tasks) {
								taskState.set(task.id, {
									id: task.id,
									subject: task.subject,
									status: task.status,
								});
							}
						}
						continue;
					}

					// TaskGet - skip (read-only)
					if (taskToolType === "TaskGet") {
						continue;
					}

					if (taskToolType === "TaskCreate" && input) {
						flushWorkUnit();

						// Parse task ID from output string or use structured output
						const output = toolPart.output;
						let taskId: string;
						if (typeof output === "string") {
							const extractedId = extractTaskIdFromOutput(output);
							taskId = extractedId ?? toolPart.toolCallId ?? "unknown";
						} else {
							const structuredOutput = output as
								| { taskId?: string }
								| undefined;
							taskId =
								structuredOutput?.taskId ?? toolPart.toolCallId ?? "unknown";
						}

						const subject = (input.subject as string) ?? "Untitled task";
						const status: TaskStatus = "pending";

						taskState.set(taskId, { id: taskId, subject, status });

						items.push({
							type: "task-trace",
							id: `task-trace-${toolPart.toolCallId}`,
							operation: "create",
							taskId,
							subject,
							status,
						});
						continue;
					}

					if (taskToolType === "TaskUpdate" && input) {
						flushWorkUnit();
						const taskId = input.taskId as string;
						const newStatus = input.status as
							| TaskStatus
							| "deleted"
							| undefined;
						const newSubject = input.subject as string | undefined;

						// Look up task - if not found by ID, it may be because TaskCreate output
						// wasn't available when we processed it
						let prevTask = taskState.get(taskId);

						// If not found, check if we stored it with a different key (toolCallId fallback)
						if (!prevTask) {
							for (const task of taskState.values()) {
								if (task.id === taskId) {
									prevTask = task;
									break;
								}
							}
						}

						const previousStatus = prevTask?.status;
						const subject = newSubject ?? prevTask?.subject ?? `Task ${taskId}`;
						const status: TaskStatus =
							newStatus === "deleted"
								? "completed"
								: (newStatus ?? previousStatus ?? "pending");

						// Update tracked state
						if (newStatus === "deleted") {
							taskState.delete(taskId);
						} else {
							taskState.set(taskId, { id: taskId, subject, status });
						}

						items.push({
							type: "task-trace",
							id: `task-trace-${toolPart.toolCallId}`,
							operation: "update",
							taskId,
							subject,
							status,
							previousStatus,
						});
						continue;
					}
				}

				const step = allSteps[stepIndex++];
				if (!step) continue;

				// Skip nested steps (they're shown inside subagent)
				if (nestedStepIds.has(step.id)) continue;

				// Task tool → subagent item
				if (step.toolName === "Task") {
					flushWorkUnit();
					const nestedSteps = childStepsMap.get(step.id) ?? [];
					const input = step.input as { prompt?: string };

					items.push({
						type: "subagent",
						id: `subagent-${step.id}`,
						taskStep: step,
						prompt: input.prompt ?? null,
						nestedSteps,
						responseText: null,
					});
					continue;
				}

				// Regular tool → accumulate into work unit
				pendingSteps.push(step);
			}
		}
	}

	// Flush any remaining pending steps
	flushWorkUnit();

	return { items };
}

/**
 * Groups messages into renderable items.
 *
 * Algorithm:
 * 1. Collect all tool steps and build parent-child relationships
 * 2. Process messages in order, emitting grouped items
 */
export function groupMessages(messages: readonly UIMessage[]): GroupedItem[] {
	const collected = collectToolSteps(messages);
	const { items } = processMessages(messages, collected);

	return items;
}
