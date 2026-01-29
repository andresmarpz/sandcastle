"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface Task {
	id: string;
	subject: string;
	description: string;
	status: TaskStatus;
	activeForm?: string;
	owner?: string;
	metadata?: Record<string, unknown>;
	blocks?: string[];
	blockedBy?: string[];
}

interface TasksProps {
	tasks: Task[];
}

/**
 * Topological sort - tasks appear after their dependencies.
 * Handles cycles gracefully by falling back to original order.
 */
function sortTasks(tasks: Task[]): Task[] {
	const taskMap = new Map(tasks.map((t) => [t.id, t]));
	const result: Task[] = [];
	const visited = new Set<string>();
	const visiting = new Set<string>(); // For cycle detection

	function visit(task: Task) {
		if (visited.has(task.id)) return;
		if (visiting.has(task.id)) return; // Cycle detected, skip

		visiting.add(task.id);

		// Visit dependencies first
		for (const blockerId of task.blockedBy ?? []) {
			const blocker = taskMap.get(blockerId);
			if (blocker) {
				visit(blocker);
			}
		}

		visiting.delete(task.id);
		visited.add(task.id);
		result.push(task);
	}

	for (const task of tasks) {
		visit(task);
	}

	return result;
}

export const Tasks = memo(function Tasks({ tasks }: TasksProps) {
	const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);

	if (tasks.length === 0) {
		return null;
	}

	const completedCount = tasks.filter((t) => t.status === "completed").length;
	const inProgressCount = tasks.filter(
		(t) => t.status === "in_progress",
	).length;

	return (
		<div className="space-y-2 pt-2">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground">Tasks</span>
				<span className="tabular-nums text-muted-foreground">
					{inProgressCount > 0 && `${inProgressCount} in progress · `}
					{completedCount}/{tasks.length}
				</span>
			</div>
			<div className="space-y-1">
				{sortedTasks.map((task) => (
					<TaskRow key={task.id} task={task} />
				))}
			</div>
		</div>
	);
});

interface TaskRowProps {
	task: Task;
}

const TaskRow = memo(function TaskRow({ task }: TaskRowProps) {
	const isInProgress = task.status === "in_progress";
	const isCompleted = task.status === "completed";

	return (
		<div className="flex items-start gap-2 py-0.5">
			{isCompleted && (
				<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
			)}
			{isInProgress && (
				<CircleHalfIcon className="mt-0.5 size-4 shrink-0 text-blue-500" />
			)}
			{task.status === "pending" && (
				<CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
			)}
			<span
				className={cn(
					"text-sm",
					isCompleted && "text-muted-foreground line-through",
					isInProgress && "font-medium text-foreground",
					task.status === "pending" && "text-muted-foreground",
				)}
			>
				{isInProgress && task.activeForm ? task.activeForm : task.subject}
			</span>
		</div>
	);
});

// Mock data for testing
export const mockTasks: Task[] = [
	// Root task - no dependencies
	{
		id: "1",
		subject: "Set up project structure",
		description:
			"Initialize the project with the required folder structure and dependencies",
		status: "completed",
		activeForm: "Setting up project structure",
	},
	// Two parallel branches from root
	{
		id: "2",
		subject: "Implement authentication",
		description: "Add user login and registration functionality",
		status: "completed",
		activeForm: "Implementing authentication",
		blockedBy: ["1"],
	},
	{
		id: "3",
		subject: "Set up database schema",
		description: "Design and create database tables",
		status: "completed",
		activeForm: "Setting up database schema",
		blockedBy: ["1"],
	},
	// Depends on auth
	{
		id: "4",
		subject: "Create user API endpoints",
		description: "Build REST API endpoints for user management",
		status: "in_progress",
		activeForm: "Creating user API endpoints",
		blockedBy: ["2"],
	},
	// Depends on database
	{
		id: "5",
		subject: "Implement data models",
		description: "Create ORM models for the database",
		status: "in_progress",
		activeForm: "Implementing data models",
		blockedBy: ["3"],
	},
	// Depends on both auth and database (multiple blockers)
	{
		id: "6",
		subject: "Add session management",
		description: "Implement user session handling with database persistence",
		status: "pending",
		activeForm: "Adding session management",
		blockedBy: ["2", "3"],
	},
	// Depends on user API
	{
		id: "7",
		subject: "Build user dashboard",
		description: "Create the main user dashboard UI",
		status: "pending",
		activeForm: "Building user dashboard",
		blockedBy: ["4"],
	},
	// Depends on multiple in-progress tasks
	{
		id: "8",
		subject: "Write integration tests",
		description: "Add integration tests for API and database",
		status: "pending",
		activeForm: "Writing integration tests",
		blockedBy: ["4", "5"],
	},
	// Deep dependency - depends on something that depends on multiple
	{
		id: "9",
		subject: "Deploy to staging",
		description: "Deploy the application to staging environment",
		status: "pending",
		activeForm: "Deploying to staging",
		blockedBy: ["8"],
	},
	// Independent task - no blockers
	{
		id: "10",
		subject: "Write documentation",
		description: "Create API documentation and README",
		status: "pending",
		activeForm: "Writing documentation",
	},
];
