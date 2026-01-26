"use client";

import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface StreamingIndicatorProps {
	// ISO 8601 timestamp
	startTime: string;
	className?: string;
}

/**
 * Displays a loading indicator while the agent is streaming a response.
 * Shows a pixel spinner, elapsed time, and a random word.
 */
export const StreamingIndicator = memo(function StreamingIndicator({
	startTime,
	className,
}: StreamingIndicatorProps) {
	const [word] = useState(() => getRandomStreamingWord());
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		// Update elapsed time every 100ms
		const interval = setInterval(() => {
			setElapsed(Date.now() - Date.parse(startTime));
		}, 100);

		return () => clearInterval(interval);
	}, [startTime]);

	// Format elapsed time as seconds with 1 decimal place
	const formattedTime = (elapsed / 1000).toFixed(1);

	return (
		<div className={cn("flex items-center gap-3 text-sm", className)}>
			<div className="flex items-center gap-2 text-muted-foreground">
				<span>{word}...</span>
				<span className="tabular-nums">{formattedTime}s</span>
			</div>
		</div>
	);
});

export const STREAMING_WORDS = [
	"Cooking",
	"Brewing",
	"Thinking",
	"Conjuring",
	"Pondering",
	"Computing",
	"Crafting",
	"Building",
	"Analyzing",
	"Processing",
	"Generating",
	"Weaving",
	"Assembling",
	"Composing",
	"Formulating",
	"Designing",
	"Creating",
	"Synthesizing",
	"Plotting",
	"Imagining",
] as const;

export function getRandomStreamingWord(): string {
	const index = Math.floor(Math.random() * STREAMING_WORDS.length);
	return STREAMING_WORDS[index] ?? "Thinking";
}
