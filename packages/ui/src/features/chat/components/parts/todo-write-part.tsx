import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "./index";

interface Todo {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm: string;
}

interface TodoWriteInput {
	todos: Todo[];
}

interface TodoWritePartProps {
	part: ToolCallPart;
}

function TodoItem({ todo }: { todo: Todo }) {
	return (
		<div className="flex items-start gap-2 py-1">
			{todo.status === "completed" && (
				<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
			)}
			{todo.status === "in_progress" && (
				<CircleHalfIcon className="mt-0.5 size-4 shrink-0 text-yellow-400 rotate-180" />
			)}
			{todo.status === "pending" && (
				<CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			)}
			<span
				className={cn(
					"text-sm",
					todo.status === "completed" && "text-muted-foreground line-through",
					todo.status === "in_progress" && "text-foreground font-medium",
					todo.status === "pending" && "text-muted-foreground",
				)}
			>
				{todo.status === "in_progress" ? todo.activeForm : todo.content}
			</span>
		</div>
	);
}

export function TodoWritePart({ part }: TodoWritePartProps) {
	const input = part.input as TodoWriteInput | undefined;
	const todos = input?.todos ?? [];

	if (todos.length === 0) {
		return null;
	}

	const completedCount = todos.filter((t) => t.status === "completed").length;
	const totalCount = todos.length;

	return (
		<div className="mb-4 rounded-md border p-3 bg-muted/70">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Tasks
				</span>
				<span className="text-xs text-muted-foreground">
					{completedCount}/{totalCount}
				</span>
			</div>
			<div className="space-y-0.5">
				{todos.map((todo, index) => (
					<TodoItem key={`${todo.content}-${index}`} todo={todo} />
				))}
			</div>
		</div>
	);
}
