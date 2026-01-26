"use client";

import { FileMagnifyingGlassIcon } from "@phosphor-icons/react/FileMagnifyingGlass";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { ToolStep } from "../messages/work-unit";

interface GlobToolProps {
	step: ToolStep;
}

/**
 * Minimal collapsible glob tool renderer.
 */
export const GlobTool = memo(function GlobTool({ step }: GlobToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const pattern = (step.input.pattern as string) ?? "";
	const rawOutput = typeof step.output === "string" ? step.output : "";
	const hasOutput = rawOutput.length > 0;
	const isError = step.state === "error";

	// Count matches (each line is a file path)
	const matches = rawOutput.trim().split("\n").filter(Boolean);
	const matchCount = matches.length;

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<FileMagnifyingGlassIcon className="size-4 shrink-0" />}
				title="Glob"
				detail={`${pattern}${matchCount > 0 ? ` (${matchCount})` : ""}`}
				state={step.state}
				showCaret={hasOutput}
			/>
			{hasOutput && (
				<ToolContent>
					<pre
						className={cn(
							"m-0 px-3 py-2 font-mono text-xs overflow-auto max-h-60 whitespace-pre bg-muted/30",
							isError ? "text-destructive" : "text-foreground/70",
						)}
					>
						{rawOutput}
					</pre>
				</ToolContent>
			)}
		</Tool>
	);
});
