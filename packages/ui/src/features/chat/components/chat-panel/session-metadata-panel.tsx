"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/CheckCircle";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { CircleHalfIcon } from "@phosphor-icons/react/CircleHalf";
import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { ClaudeAI } from "@/components/icons/anthropic.icon";
import { useSessionStatusIndicator } from "@/features/sidebar/main/session-status-indicator";
import { getModelContextWindow, getModelDisplayName } from "@/lib/models";
import { cn } from "@/lib/utils";
import { useChatSession } from "../../store";
import { StreamingIndicator } from "./streaming-indicator";

export interface SessionMetadataPanelProps {
	session: Session;
	sessionId: string;
	messages: readonly UIMessage[];
}

interface TodoItem {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm: string;
}

/**
 * Extracts the latest todos from messages by finding the last TodoWrite tool call.
 */
function extractLatestTodos(messages: readonly UIMessage[]): TodoItem[] {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== "assistant") continue;

		for (let j = msg.parts.length - 1; j >= 0; j--) {
			const part = msg.parts[j] as {
				type: string;
				toolName?: string;
				input?: { todos?: TodoItem[] };
			};
			if (
				part?.type?.startsWith("tool-") &&
				part.toolName === "TodoWrite" &&
				part.input?.todos
			) {
				return part.input.todos;
			}
		}
	}
	return [];
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
	const { turnStartedAt, streamingMetadata } = useChatSession(sessionId);

	// Use the same status indicator hook as the sidebar
	const indicatorStatus = useSessionStatusIndicator({
		sessionId,
		status: session.status,
	});

	// Get model from streaming metadata, session, or extract from latest message metadata
	const modelId = useMemo(
		() =>
			streamingMetadata?.model ??
			session.model ??
			extractModelFromMessages(messages),
		[streamingMetadata?.model, session.model, messages],
	);
	const modelDisplayName = getModelDisplayName(modelId);

	// Calculate context usage percentage
	// Context = inputTokens + cacheReadInputTokens + cacheCreationInputTokens
	// This represents everything Claude sees on its latest assistant message
	// Use streaming metadata if available (real-time), otherwise fall back to session data
	const inputTokens = streamingMetadata?.inputTokens ?? session.inputTokens;
	const cacheReadTokens =
		streamingMetadata?.cacheReadInputTokens ?? session.cacheReadInputTokens;
	const cacheCreationTokens =
		streamingMetadata?.cacheCreationInputTokens ??
		session.cacheCreationInputTokens;

	// Use model-based context window if available, fall back to streaming/session data
	const contextWindow =
		getModelContextWindow(modelId) ??
		streamingMetadata?.contextWindow ??
		session.contextWindow;

	const totalContextTokens =
		inputTokens + cacheReadTokens + cacheCreationTokens;
	const contextPercentage =
		contextWindow > 0
			? Math.min((totalContextTokens / contextWindow) * 100, 100)
			: 0;

	// Use real cost from streaming metadata or session data (no calculation)
	const totalCost = streamingMetadata?.costUsd ?? session.totalCostUsd ?? 0;

	// Extract latest todos from messages
	const todos = useMemo(() => extractLatestTodos(messages), [messages]);

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
			{todos.length > 0 && <SessionMetadataTasks todos={todos} />}

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
 * Minimal tasks display for the metadata panel.
 */
function SessionMetadataTasks({ todos }: { todos: TodoItem[] }) {
	const completed = todos.filter((t) => t.status === "completed").length;

	return (
		<div className="space-y-2 pt-2">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground">Tasks</span>
				<span className="tabular-nums text-muted-foreground">
					{completed}/{todos.length}
				</span>
			</div>
			<div className="space-y-1">
				{todos.map((todo) => (
					<div
						key={todo.content}
						className="flex items-start gap-2 py-0.5 text-xsm"
					>
						<TodoStatusIcon status={todo.status} />
						<span
							className={cn(
								todo.status === "completed" &&
									"text-muted-foreground line-through",
								todo.status === "in_progress" && "font-medium text-foreground",
								todo.status === "pending" && "text-muted-foreground",
							)}
						>
							{todo.status === "in_progress" ? todo.activeForm : todo.content}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Status icon for todo items.
 */
function TodoStatusIcon({ status }: { status: TodoItem["status"] }) {
	if (status === "completed") {
		return (
			<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-green-600" />
		);
	}
	if (status === "in_progress") {
		return <CircleHalfIcon className="mt-0.5 size-4 shrink-0 text-blue-500" />;
	}
	return (
		<CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
