import type { UIMessage } from "ai";

/**
 * Tool-specific metadata (discriminated union by `tool` field).
 */
export type ToolMetadata =
	| { tool: "Skill"; commandName: string; allowedTools?: string[] }
	| { tool: "ExitPlanMode"; approved: boolean; reason?: string }
	| {
			tool: "TodoWrite";
			added: string[];
			completed: string[];
			started: string[];
	  };

/**
 * Represents a single tool invocation with extracted metadata.
 */
export interface ToolStep {
	id: string;
	messageId: string;
	toolType: string;
	toolName: string;
	state: "pending" | "running" | "complete" | "error";
	parentToolCallId: string | null;
	/** Tool input arguments for rendering context */
	input: Record<string, unknown>;
	/** Tool output (available when state is "complete") */
	output?: unknown;
	/** Tool-specific metadata (e.g., skill info, plan approval) */
	toolMetadata?: ToolMetadata;
}

/**
 * Grouped items for rendering.
 *
 * Design notes:
 * - Each item has a unique `id` for stable React keys
 * - `work-unit` groups consecutive tool calls between text parts
 * - Future: `subagent` will group tool calls by parentToolCallId
 */
/**
 * Represents a subagent (Task tool) with its nested work.
 * TODO: Full implementation pending backend parentToolCallId fixes.
 */
export interface SubagentItem {
	type: "subagent";
	id: string;
	taskStep: ToolStep;
	prompt: string | null;
	nestedSteps: ToolStep[];
	responseText: string | null;
}

/**
 * Represents a single todo item from TodoWrite.
 */
export interface TodoItem {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm: string;
}

/**
 * Represents the current todo list state from TodoWrite.
 */
export interface TasksItem {
	type: "tasks";
	id: string;
	todos: TodoItem[];
}

/**
 * Represents a TodoWrite trace showing what changed.
 */
export interface TodoTraceItem {
	type: "todo-trace";
	id: string;
	added: string[];
	completed: string[];
	started: string[];
}

export type GroupedItem =
	| { type: "user-message"; id: string; message: UIMessage }
	| { type: "assistant-text"; id: string; messageId: string; text: string }
	| { type: "work-unit"; id: string; steps: ToolStep[] }
	| SubagentItem
	| TasksItem
	| TodoTraceItem;

function getToolName(part: { type: string; toolName?: string }): string {
	if (part.type === "dynamic-tool") {
		return part.toolName ?? "Tool";
	}
	return part.type.replace("tool-", "");
}

/**
 * Normalizes the tool state from various possible values.
 */
function normalizeState(state: string | undefined): ToolStep["state"] {
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
function computeTodoDiff(
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
 * Groups messages into renderable items.
 *
 * Algorithm:
 * 1. First pass: collect all tool steps from all messages
 * 2. Build a map of parentToolCallId -> child steps for subagent nesting
 * 3. Second pass: group items, creating subagent items for Task tools
 * 4. User messages flush pending work and emit as-is
 * 5. Assistant text parts flush pending work and emit as-is
 * 6. Task tools emit as subagent items with nested steps
 * 7. Other tool calls accumulate into pending work unit
 */
export function groupMessages(messages: readonly UIMessage[]): GroupedItem[] {
	// First pass: collect all tool steps and build parent-child relationships
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

	// Create a set of step IDs that are nested under a Task (to exclude from work-units)
	const nestedStepIds = new Set<string>();
	for (const children of childStepsMap.values()) {
		for (const child of children) {
			nestedStepIds.add(child.id);
		}
	}

	// Second pass: group items
	const result: GroupedItem[] = [];
	let pendingSteps: ToolStep[] = [];
	let stepIndex = 0;

	// Track the latest TodoWrite (only render the last one)
	let latestTodoWrite: { id: string; todos: TodoItem[] } | null = null;
	let previousTodos: TodoItem[] = [];

	const flushWorkUnit = () => {
		const firstStep = pendingSteps[0];
		if (!firstStep) return;

		result.push({
			type: "work-unit",
			id: `work-unit-${firstStep.id}`,
			steps: pendingSteps,
		});
		pendingSteps = [];
	};

	for (const message of messages) {
		if (message.role === "user") {
			// Skip user messages that are part of a subagent (Task tool) conversation
			const parentToolCallId = (message as { parentToolCallId?: string | null })
				.parentToolCallId;
			if (parentToolCallId) {
				continue;
			}

			flushWorkUnit();
			result.push({ type: "user-message", id: message.id, message });
			continue;
		}

		// Assistant message - process parts in order
		let textPartIndex = 0;

		for (const part of message.parts) {
			if (part.type === "text") {
				flushWorkUnit();
				result.push({
					type: "assistant-text",
					id: `${message.id}-text-${textPartIndex++}`,
					messageId: message.id,
					text: part.text,
				});
				continue;
			}

			if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
				const step = allSteps[stepIndex++];
				if (!step) continue;

				// Skip steps that are nested under a Task (they'll be shown inside subagent)
				if (nestedStepIds.has(step.id)) {
					continue;
				}

				// Task tool -> create subagent item
				if (step.toolName === "Task") {
					flushWorkUnit();
					const nestedSteps = childStepsMap.get(step.id) ?? [];
					const input = step.input as { prompt?: string };

					result.push({
						type: "subagent",
						id: `subagent-${step.id}`,
						taskStep: step,
						prompt: input.prompt ?? null,
						nestedSteps,
						responseText: null, // Extracted by component from step.output
					});
					continue;
				}

				// TodoWrite -> flush work unit, emit trace, track latest for full render
				if (step.toolName === "TodoWrite") {
					flushWorkUnit();

					const input = step.input as { todos?: TodoItem[] };
					const currentTodos = input.todos ?? [];
					const diff = computeTodoDiff(previousTodos, currentTodos);

					result.push({
						type: "todo-trace",
						id: `todo-trace-${step.id}`,
						added: diff.added,
						completed: diff.completed,
						started: diff.started,
					});

					latestTodoWrite = { id: step.id, todos: currentTodos };
					previousTodos = currentTodos;
					continue;
				}

				// Regular tool -> add to pending work unit
				pendingSteps.push(step);
			}

			// Skip reasoning and other part types for now
		}
	}

	// Flush any remaining pending steps
	flushWorkUnit();

	// Emit the latest TodoWrite as a single tasks item
	if (latestTodoWrite) {
		result.push({
			type: "tasks",
			id: `tasks-${latestTodoWrite.id}`,
			todos: latestTodoWrite.todos,
		});
	}

	return result;
}
