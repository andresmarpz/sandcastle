"use client";

import { IconTerminal } from "@tabler/icons-react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "./index";

interface BashInput {
	command: string;
	description?: string;
	timeout?: number;
}

interface BashPartProps {
	part: ToolCallPart;
}

// Map state for ToolHeader
function mapState(
	state: ToolCallPart["state"],
): "input-available" | "output-available" | "output-error" {
	switch (state) {
		case "input-streaming":
		case "input-available":
			return "input-available";
		case "output-available":
			return "output-available";
		case "output-error":
			return "output-error";
		default:
			return "input-available";
	}
}

export function BashPart({ part }: BashPartProps) {
	const input = part.input as BashInput | undefined;
	const command = input?.command ?? "";
	const description = input?.description;
	const output = typeof part.output === "string" ? part.output : "";

	return (
		<Tool>
			<ToolHeader
				title="Bash"
				type="tool-Bash"
				state={mapState(part.state)}
				icon={<IconTerminal className="size-4 text-muted-foreground" />}
			/>
			<ToolContent>
				<div className="space-y-3 p-4">
					{/* Description if provided */}
					{description && (
						<div className="text-sm text-muted-foreground">{description}</div>
					)}

					{/* Command display */}
					<div className="space-y-1.5">
						<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Command
						</h4>
						<div className="rounded-md border bg-muted/50 overflow-hidden">
							<div className="flex items-start gap-2 p-3">
								<IconTerminal className="size-4 text-muted-foreground mt-0.5 shrink-0" />
								<code className="font-mono text-sm break-all whitespace-pre-wrap">
									{command}
								</code>
							</div>
						</div>
					</div>

					{/* Output display */}
					{output && (
						<div className="space-y-1.5">
							<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Output
							</h4>
							<div
								className={cn(
									"rounded-md border overflow-hidden",
									part.state === "output-error"
										? "bg-destructive/10 border-destructive/20"
										: "bg-muted/50",
								)}
							>
								<pre
									className={cn(
										"p-3 font-mono text-xs overflow-auto max-h-60 whitespace-pre-wrap break-all",
										part.state === "output-error"
											? "text-destructive"
											: "text-foreground",
									)}
								>
									{output}
								</pre>
							</div>
						</div>
					)}

					{/* Error text if present */}
					{part.errorText && (
						<div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
							<pre className="font-mono text-xs text-destructive whitespace-pre-wrap">
								{part.errorText}
							</pre>
						</div>
					)}
				</div>
			</ToolContent>
		</Tool>
	);
}
