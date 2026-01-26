"use client";

import { TerminalIcon } from "@phosphor-icons/react/Terminal";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { ToolStep } from "../messages/work-unit";

/**
 * Truncates a string to a maximum length.
 */
function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 1)}...`;
}

/**
 * Strips ANSI escape codes from a string.
 * These are terminal control sequences for colors, formatting, cursor movement, etc.
 */
function stripAnsi(str: string): string {
	// Matches ANSI escape sequences: ESC [ ... (letter)
	// Covers colors, formatting, cursor movement, etc.
	const escapeChar = String.fromCharCode(0x1b);
	return str.replace(new RegExp(`${escapeChar}\\[[0-9;]*[a-zA-Z]`, "g"), "");
}

interface BashToolProps {
	step: ToolStep;
}

/**
 * Minimal collapsible bash tool renderer.
 */
export const BashTool = memo(function BashTool({ step }: BashToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const command = (step.input.command as string) ?? "";
	const description = step.input.description as string | undefined;
	const rawOutput = typeof step.output === "string" ? step.output : "";
	const output = stripAnsi(rawOutput);

	// Show description if available, otherwise truncated command
	const detail = description ?? truncate(command, 50);
	const hasOutput = output.length > 0;
	const isError = step.state === "error";

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<TerminalIcon className="size-4 shrink-0" />}
				title="Bash"
				detail={detail}
				state={step.state}
				showCaret={hasOutput}
			/>
			<ToolContent>
				<div className="px-3 py-2 bg-muted/30">
					<code className="font-mono font-normal text-xs text-foreground/70 break-all whitespace-pre-wrap">
						$ {command}
					</code>
					<pre
						className={cn(
							"m-0 pb-2 pt-6 font-mono text-xs overflow-auto max-h-60 whitespace-pre",
							isError ? "text-destructive" : "text-foreground/70",
						)}
					>
						{output}
					</pre>
				</div>
			</ToolContent>
		</Tool>
	);
});
