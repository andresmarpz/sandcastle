"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { TerminalIcon } from "@phosphor-icons/react/Terminal";
import { memo, useState } from "react";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import { cn } from "@/lib/utils";
import type { ToolStep } from "../messages/work-unit";

interface BashToolProps {
	step: ToolStep;
}

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

/**
 * Minimal collapsible bash tool renderer.
 * Matches the WorkUnit ToolStepRenderer styling with expandable output.
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
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div
				className={cn(
					"rounded-md border border-border",
					"bg-background",
					"overflow-hidden",
				)}
			>
				<CollapsibleTrigger
					className={cn(
						"flex items-center gap-2 px-3 py-2 w-full",
						"text-sm text-subtle-foreground",
						"hover:bg-muted/50 transition-colors",
					)}
				>
					<TerminalIcon className="size-4 shrink-0" />
					<span className="font-medium">Bash</span>
					{detail && (
						<>
							<span className="text-muted-foreground">/</span>
							<span className="truncate text-muted-foreground">{detail}</span>
						</>
					)}
					{hasOutput && (
						<div
							className={cn(
								"ml-auto size-4 shrink-0 transition-transform",
								isOpen && "rotate-180",
							)}
						>
							<CaretDownIcon className="size-4" />
						</div>
					)}
				</CollapsibleTrigger>

				{hasOutput && (
					<CollapsiblePanel>
						<div className="border-t border-border">
							{/* Command */}
							<div className="px-3 py-2 border-b border-border bg-muted/30">
								<code className="font-mono font-normal text-xs text-muted-foreground break-all whitespace-pre-wrap before:content-none after:content-none">
									$ {command}
								</code>
							</div>

							{/* Output */}
							<div className={cn(isError && "bg-destructive/5")}>
								<pre
									className={cn(
										"font-mono text-xs overflow-auto max-h-60 whitespace-pre m-0! rounded-t-none!",
										isError ? "text-destructive" : "text-foreground",
									)}
								>
									{output}
								</pre>
							</div>
						</div>
					</CollapsiblePanel>
				)}
			</div>
		</Collapsible>
	);
});
