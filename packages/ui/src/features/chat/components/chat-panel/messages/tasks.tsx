"use client";

import { CheckCircle as CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { Circle as CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleHalf as CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { TasksItem, TodoItem, TodoTraceItem } from "../group-messages";

interface TasksMessageProps {
	item: TasksItem;
}

export const TasksMessage = memo(function TasksMessage({
	item,
}: TasksMessageProps) {
	const { todos } = item;

	if (todos.length === 0) {
		return null;
	}

	const completedCount = todos.filter((t) => t.status === "completed").length;

	return (
		<div className="rounded-md border bg-muted/50 p-3">
			<div className="mb-2 flex items-center justify-between">
				<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Tasks
				</span>
				<span className="text-xs text-muted-foreground">
					{completedCount}/{todos.length}
				</span>
			</div>
			<div className="space-y-1">
				{todos.map((todo, index) => (
					<TodoRow key={index} todo={todo} />
				))}
			</div>
		</div>
	);
});

interface TodoRowProps {
	todo: TodoItem;
}

const TodoRow = memo(function TodoRow({ todo }: TodoRowProps) {
	const isInProgress = todo.status === "in_progress";
	const isCompleted = todo.status === "completed";

	return (
		<div className="flex items-start gap-2 py-0.5">
			{isCompleted && (
				<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
			)}
			{isInProgress && (
				<CircleHalfIcon className="mt-0.5 size-4 shrink-0 text-blue-500" />
			)}
			{todo.status === "pending" && (
				<CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			)}
			<span
				className={cn(
					"text-sm",
					isCompleted && "text-muted-foreground line-through",
					isInProgress && "font-medium text-foreground",
					todo.status === "pending" && "text-muted-foreground",
				)}
			>
				{isInProgress && todo.activeForm ? todo.activeForm : todo.content}
			</span>
		</div>
	);
});

interface TodoTraceMessageProps {
	item: TodoTraceItem;
}

export const TodoTraceMessage = memo(function TodoTraceMessage({
	item,
}: TodoTraceMessageProps) {
	const { added, completed, started } = item;
	const hasChanges =
		added.length > 0 || completed.length > 0 || started.length > 0;

	return (
		<div
			className={cn(
				"flex flex-col gap-1.5 px-3 py-2",
				"rounded-md border border-border",
				"text-sm text-subtle-foreground",
				"bg-background",
			)}
		>
			<span className="text-xs font-medium text-muted-foreground">
				Updated todos
			</span>
			{hasChanges && (
				<div className="flex flex-col gap-0.5">
					{completed.map((task) => (
						<div key={task} className="flex items-center gap-1.5">
							<CheckCircleIcon className="size-3.5 shrink-0 text-green-600" />
							<span className="truncate text-muted-foreground line-through">
								{task}
							</span>
						</div>
					))}
					{started.map((task) => (
						<div key={task} className="flex items-center gap-1.5">
							<CircleHalfIcon className="size-3.5 shrink-0 text-blue-500" />
							<span className="truncate text-muted-foreground">{task}</span>
						</div>
					))}
					{added.map((task) => (
						<div key={task} className="flex items-center gap-1.5">
							<CircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
							<span className="truncate text-muted-foreground">{task}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
});
