import type { ToolCallPart } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import type { TodoItem } from "../messages/tasks";
import type { ToolMetadata, ToolStep } from "../messages/work-unit";
import { computeTodoDiff, getToolName, normalizeState } from "./helpers";
import type { GroupedItem } from "./types";

export type { SubagentItem } from "../messages/subagent";
export type { TodoItem, TodoTraceItem } from "../messages/tasks";
export type { ToolMetadata, ToolStep } from "../messages/work-unit";
// Re-export types for consumers
export type { GroupedItem, PlanItem, QuestionsItem } from "./types";

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

			// Skip ExitPlanMode and AskUserQuestion - they're handled separately
			const toolName = getToolName(toolPart);
			if (isExitPlanModeTool(toolName)) continue;
			if (isAskUserQuestionTool(toolName)) continue;

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

	// Todo state tracking for computing diffs between TodoWrite calls
	let previousTodos: TodoItem[] = [];

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

				// ExitPlanMode → emit plan item (not in allSteps)
				const partToolName = getToolName(toolPart);
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

				// AskUserQuestion → emit questions item (not in allSteps)
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

				// TodoWrite → emit trace, track latest
				if (step.toolName === "TodoWrite") {
					flushWorkUnit();

					const input = step.input as { todos?: TodoItem[] };
					const currentTodos = input.todos ?? [];
					const diff = computeTodoDiff(previousTodos, currentTodos);

					items.push({
						type: "todo-trace",
						id: `todo-trace-${step.id}`,
						added: diff.added,
						completed: diff.completed,
						started: diff.started,
					});

					previousTodos = currentTodos;
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
