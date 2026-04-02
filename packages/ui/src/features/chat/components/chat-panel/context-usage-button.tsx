"use client";

import type { Session } from "@sandcastle/schemas";
import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { Button } from "@/components/button";
import { ClaudeAI } from "@/components/icons/anthropic.icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import { getModelContextWindow, getModelDisplayName } from "@/lib/models";
import { cn } from "@/lib/utils";
import { useUsageMetadata } from "../../store";

export interface ContextUsageButtonProps {
	session: Session;
	sessionId: string;
	messages: readonly UIMessage[];
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
 * Formats a token count as a human-readable string (e.g., "91.2k", "1.3M").
 * Returns [number, suffix] for tabular-nums styling on the numeric part.
 */
function formatTokenCount(tokens: number): [string, string] {
	if (tokens === 0) return ["0", ""];
	if (tokens >= 1_000_000) return [(tokens / 1_000_000).toFixed(1), "M"];
	if (tokens >= 1_000) return [(tokens / 1_000).toFixed(1), "k"];
	return [`${tokens}`, ""];
}

const CIRCLE_SIZE = 24;
const STROKE_WIDTH = 2;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Circular progress indicator SVG.
 */
function ProgressCircle({ percentage }: { percentage: number }) {
	const filled = (percentage / 100) * CIRCUMFERENCE;

	return (
		<svg
			width={CIRCLE_SIZE}
			height={CIRCLE_SIZE}
			viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`}
			className="shrink-0 -rotate-90"
		>
			<circle
				cx={CIRCLE_SIZE / 2}
				cy={CIRCLE_SIZE / 2}
				r={RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth={STROKE_WIDTH}
				className="text-muted-foreground/20"
			/>
			<circle
				cx={CIRCLE_SIZE / 2}
				cy={CIRCLE_SIZE / 2}
				r={RADIUS}
				fill="none"
				stroke="currentColor"
				strokeWidth={STROKE_WIDTH}
				strokeDasharray={`${filled} ${CIRCUMFERENCE - filled}`}
				strokeLinecap="butt"
				className={cn(
					percentage < 75
						? "text-muted-foreground"
						: percentage < 90
							? "text-yellow-500"
							: "text-red-500",
				)}
			/>
		</svg>
	);
}

/**
 * Bar-style context usage indicator with small vertical bars.
 */
function ContextBar({ percentage }: { percentage: number }) {
	const totalBars = 60;
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
 * Context usage button with a circular progress indicator.
 * Clicking opens a popover with detailed token/model/cost info.
 */
export const ContextUsageButton = memo(function ContextUsageButton({
	session,
	sessionId,
	messages,
}: ContextUsageButtonProps) {
	const usageMetadata = useUsageMetadata(sessionId, session);

	const modelId = useMemo(
		() => usageMetadata.model ?? extractModelFromMessages(messages),
		[usageMetadata.model, messages],
	);
	const modelDisplayName = getModelDisplayName(modelId);
	const inputTokens = usageMetadata.inputTokens ?? 0;
	const outputTokens = usageMetadata.outputTokens ?? 0;
	const cacheReadTokens = usageMetadata.cacheReadInputTokens ?? 0;
	const cacheCreationTokens = usageMetadata.cacheCreationInputTokens ?? 0;

	const contextWindow =
		getModelContextWindow(modelId) ?? usageMetadata.contextWindow ?? 0;

	const totalContextTokens =
		inputTokens + cacheReadTokens + cacheCreationTokens;
	const contextPercentage =
		contextWindow > 0
			? Math.min((totalContextTokens / contextWindow) * 100, 100)
			: 0;

	const [ctxNum, ctxSuffix] = formatTokenCount(totalContextTokens);
	const [winNum, winSuffix] = formatTokenCount(contextWindow);

	return (
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={500}
				closeDelay={200}
				render={
					<Button
						variant="ghost"
						size="xs"
						className="gap-1.5 py-3 text-muted-foreground"
					/>
				}
			>
				<ProgressCircle percentage={contextPercentage} />
			</PopoverTrigger>
			<PopoverContent side="top" align="start" sideOffset={4} className="w-64">
				<div className="space-y-3 text-xs select-none">
					{/* Model */}
					{modelDisplayName && (
						<div className="flex items-center gap-1.5">
							<ClaudeAI className="size-3.5 shrink-0" />
							<span className="font-medium">{modelDisplayName}</span>
						</div>
					)}

					{/* Context usage */}
					<div className="flex flex-col gap-1">
						<div className="flex items-center justify-between -mb-1">
							<span className="text-muted-foreground font-medium">Context</span>
							<span>
								<span className="tabular-nums">{ctxNum}</span>
								{ctxSuffix} &middot;{" "}
								<span className="tabular-nums">
									{Math.round(contextPercentage)}
								</span>
								%
							</span>
						</div>
						<ContextBar percentage={contextPercentage} />
						{contextWindow > 0 && (
							<div className="flex items-center justify-between">
								<span className="text-muted-foreground">Limit</span>
								<span>
									<span className="tabular-nums">{winNum}</span>
									{winSuffix} tokens
								</span>
							</div>
						)}
					</div>

					{/* Token breakdown */}
					{(inputTokens > 0 || outputTokens > 0) && (
						<div className="space-y-1.5">
							<div className="text-muted-foreground font-medium">
								Token Breakdown
							</div>
							{inputTokens > 0 && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Input</span>
									<span className="tabular-nums">
										{formatTokenCount(inputTokens).join("")}
									</span>
								</div>
							)}
							{outputTokens > 0 && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Output</span>
									<span className="tabular-nums">
										{formatTokenCount(outputTokens).join("")}
									</span>
								</div>
							)}
							{cacheReadTokens > 0 && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Cache read</span>
									<span className="tabular-nums">
										{formatTokenCount(cacheReadTokens).join("")}
									</span>
								</div>
							)}
							{cacheCreationTokens > 0 && (
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground">Cache write</span>
									<span className="tabular-nums">
										{formatTokenCount(cacheCreationTokens).join("")}
									</span>
								</div>
							)}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
});
