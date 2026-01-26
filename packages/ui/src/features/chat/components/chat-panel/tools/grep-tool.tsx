"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { ToolStep } from "../messages/work-unit";

interface GrepToolProps {
	step: ToolStep;
}

/**
 * Minimal collapsible grep tool renderer.
 */
export const GrepTool = memo(function GrepTool({ step }: GrepToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const pattern = (step.input.pattern as string) ?? "";
	const rawOutput = typeof step.output === "string" ? step.output : "";
	const hasOutput = rawOutput.length > 0;
	const isError = step.state === "error";

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<MagnifyingGlassIcon className="size-4 shrink-0" />}
				title="Grep"
				detail={pattern}
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
