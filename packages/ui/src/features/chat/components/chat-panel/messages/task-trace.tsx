"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import { PlusCircleIcon } from "@phosphor-icons/react/PlusCircle";
import { memo } from "react";
import type { TaskTraceItem } from "../helpers/types";

interface TaskTraceMessageProps {
	item: TaskTraceItem;
}

export const TaskTraceMessage = memo(function TaskTraceMessage({
	item,
}: TaskTraceMessageProps) {
	const { operation, subject, status, previousStatus } = item;

	// Determine what kind of trace to show
	if (operation === "create") {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<PlusCircleIcon className="size-4 shrink-0" />
				<span>Added: {subject}</span>
			</div>
		);
	}

	// Update operation - show status transition
	if (status === "completed" && previousStatus !== "completed") {
		return (
			<div className="flex items-center gap-2 text-sm">
				<CheckCircleIcon className="size-4 shrink-0 text-green-600" />
				<span className="text-muted-foreground line-through">{subject}</span>
			</div>
		);
	}

	if (status === "in_progress" && previousStatus === "pending") {
		return (
			<div className="flex items-center gap-2 text-sm">
				<CircleHalfIcon className="size-4 shrink-0 text-blue-500" />
				<span>{subject}</span>
			</div>
		);
	}

	// Generic update (e.g., subject change, metadata update)
	return (
		<div className="flex items-center gap-2 text-sm">
			<CircleIcon className="size-4 shrink-0" />
			<span className="font-medium text-muted-foreground">
				Updated: {subject}
			</span>
		</div>
	);
});
