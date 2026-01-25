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
