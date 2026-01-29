"use client";

import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { ClaudeAI } from "@/components/icons/anthropic.icon";
import { useSessionStatusIndicator } from "@/features/sidebar/main/session-status-indicator";
import { getModelContextWindow, getModelDisplayName } from "@/lib/models";
import { cn } from "@/lib/utils";
import { useChatSession, useUsageMetadata } from "../../store";
import { getTaskMgmtToolType } from "./helpers/helpers";
import type { Task } from "./messages/tasks";
import { Tasks } from "./messages/tasks";
import { StreamingIndicator } from "./streaming-indicator";

export interface SessionMetadataPanelProps {
	session: Session;
	sessionId: string;
	messages: readonly UIMessage[];
}

type TaskStatus = "pending" | "in_progress" | "completed";

interface TaskListOutputShape {
	tasks?: Array<{
		id: string;
		subject: string;
		status: TaskStatus;
		owner?: string;
		blockedBy?: string[];
	}>;
}

interface TaskCreateOutputShape {
	taskId?: string;
}

/**
 * Builds task state by finding the latest TaskList output, or accumulating
 * TaskCreate/TaskUpdate calls if no TaskList exists.
 */
function buildTaskState(messages: readonly UIMessage[]): Task[] {
	// First pass: find the latest TaskList output (most authoritative)
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== "assistant") continue;

		for (let j = msg.parts.length - 1; j >= 0; j--) {
			const part = msg.parts[j] as {
				type: string;
				toolName?: string;
				output?: TaskListOutputShape;
			};

			if (!part.type?.startsWith("tool-") && part.type !== "dynamic-tool") {
				continue;
			}

			const toolType = getTaskMgmtToolType(part.toolName ?? "");
			if (toolType === "TaskList" && part.output?.tasks) {
				return part.output.tasks.map((t) => ({
					id: t.id,
					subject: t.subject,
					description: "",
					status: t.status,
					owner: t.owner,
					blockedBy: t.blockedBy,
				}));
			}
		}
	}

	// Fallback: accumulate from TaskCreate/TaskUpdate calls
	const taskMap = new Map<string, Task>();

	for (const msg of messages) {
		if (msg.role !== "assistant") continue;

		for (const part of msg.parts) {
			const toolPart = part as {
				type: string;
				toolName?: string;
				toolCallId?: string;
				input?: Record<string, unknown>;
				output?: unknown;
			};

			if (
				!toolPart.type?.startsWith("tool-") &&
				toolPart.type !== "dynamic-tool"
			) {
				continue;
			}

			const toolType = getTaskMgmtToolType(toolPart.toolName ?? "");

			if (toolType === "TaskCreate" && toolPart.input) {
				// Parse task ID from output string or use structured output
				const output = toolPart.output;
				let taskId: string;
				if (typeof output === "string") {
					const match = output.match(/[Tt]ask #(\d+)/);
					taskId = match?.[1] ?? toolPart.toolCallId ?? "unknown";
				} else {
					const structuredOutput = output as TaskCreateOutputShape | undefined;
					taskId = structuredOutput?.taskId ?? toolPart.toolCallId ?? "unknown";
				}

				const task: Task = {
					id: taskId,
					subject: (toolPart.input.subject as string) ?? "Untitled task",
					description: (toolPart.input.description as string) ?? "",
					status: "pending",
					activeForm: toolPart.input.activeForm as string | undefined,
					owner: toolPart.input.owner as string | undefined,
					blockedBy: toolPart.input.blockedBy as string[] | undefined,
					blocks: toolPart.input.blocks as string[] | undefined,
				};
				taskMap.set(taskId, task);
			}

			if (toolType === "TaskUpdate" && toolPart.input) {
				const taskId = toolPart.input.taskId as string;
				const existingTask = taskMap.get(taskId);

				if (existingTask) {
					const newStatus = toolPart.input.status as
						| TaskStatus
						| "deleted"
						| undefined;

					if (newStatus === "deleted") {
						taskMap.delete(taskId);
					} else {
						taskMap.set(taskId, {
							...existingTask,
							subject:
								(toolPart.input.subject as string) ?? existingTask.subject,
							description:
								(toolPart.input.description as string) ??
								existingTask.description,
							status: newStatus ?? existingTask.status,
							activeForm:
								(toolPart.input.activeForm as string | undefined) ??
								existingTask.activeForm,
							owner:
								(toolPart.input.owner as string | undefined) ??
								existingTask.owner,
						});
					}
				}
			}
		}
	}

	return Array.from(taskMap.values());
}

/**
 * Extracts the model name from the latest assistant message metadata.
 */
function extractModelFromMessages(
	messages: readonly UIMessage[],
): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== "assistant") continue;

		const metadata = msg.metadata as { model?: string } | undefined;
		if (metadata?.model) {
			return metadata.model;
		}
	}
	return null;
}

/**
 * Floating session metadata panel displayed in the top-right column.
 * Shows status, mode, model, context usage, cost, and current tasks.
 */
export const SessionMetadataPanel = memo(function SessionMetadataPanel({
	session,
	sessionId,
	messages,
}: SessionMetadataPanelProps) {
	const { turnStartedAt } = useChatSession(sessionId);
	const usageMetadata = useUsageMetadata(sessionId, session);

	// Use the same status indicator hook as the sidebar
	const indicatorStatus = useSessionStatusIndicator({
		sessionId,
		status: session.status,
	});

	// Get model from unified metadata, or extract from latest message metadata
	const modelId = useMemo(
		() => usageMetadata.model ?? extractModelFromMessages(messages),
		[usageMetadata.model, messages],
	);
	const modelDisplayName = getModelDisplayName(modelId);

	// Calculate context usage percentage using unified metadata
	// Context = inputTokens + cacheReadInputTokens + cacheCreationInputTokens
	// This represents everything Claude sees on its latest assistant message
	const inputTokens = usageMetadata.inputTokens ?? 0;
	const cacheReadTokens = usageMetadata.cacheReadInputTokens ?? 0;
	const cacheCreationTokens = usageMetadata.cacheCreationInputTokens ?? 0;

	// Use model-based context window if available, fall back to metadata
	const contextWindow =
		getModelContextWindow(modelId) ?? usageMetadata.contextWindow ?? 0;

	const totalContextTokens =
		inputTokens + cacheReadTokens + cacheCreationTokens;
	const contextPercentage =
		contextWindow > 0
			? Math.min((totalContextTokens / contextWindow) * 100, 100)
			: 0;

	// Use unified cost from metadata
	const totalCost = usageMetadata.costUsd ?? 0;

	// Build task state from messages
	const tasks = useMemo(() => buildTaskState(messages), [messages]);

	const isStreaming = indicatorStatus === "streaming";

	return (
		<div className="min-w-[250px] max-w-[300px] p-2.5 space-y-2.5 text-xs prose">
			{/* Model */}
			{modelDisplayName && (
				<div className="flex items-center gap-1.5 text-muted-foreground">
					<ClaudeAI className="size-3.5 shrink-0" />
					<span className="truncate">{modelDisplayName}</span>
				</div>
			)}

			{/* Context usage bar */}
			<div className="space-y-[2px]">
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Context</span>
					<span className="tabular-nums text-muted-foreground">
						{Math.round(contextPercentage)}%
					</span>
				</div>
				<ContextBar percentage={contextPercentage} />
			</div>

			{/* Cost */}
			{
				<div className="flex items-center justify-between">
					<span className="text-muted-foreground">Cost</span>
					<span className="tabular-nums text-muted-foreground">
						{formatCost(totalCost)}
					</span>
				</div>
			}

			{/* Tasks */}
			{tasks.length > 0 && <Tasks tasks={tasks} />}

			{isStreaming && turnStartedAt && (
				<StreamingIndicator className="text-xsm!" startTime={turnStartedAt} />
			)}
		</div>
	);
});

/**
 * Vertical bar context usage indicator.
 */
function ContextBar({ percentage }: { percentage: number }) {
	const totalBars = 70;
	const filledBars = Math.round((percentage / 100) * totalBars);

	return (
		<div className="flex items-end justify-around h-5 w-full">
			{Array.from({ length: totalBars }).map((_, i) => (
				<div
					key={`bar-${i}`}
					className={cn(
						"w-[2px] rounded-[1px] h-4",
						i < filledBars ? "bg-green-500/70" : "bg-accent",
					)}
				/>
			))}
		</div>
	);
}

/**
 * Formats cost in USD.
 */
function formatCost(cost: number): string {
	if (cost === 0) return "$0";
	if (cost < 0.01) return "<$0.01";
	return `$${cost.toFixed(2)}`;
}
