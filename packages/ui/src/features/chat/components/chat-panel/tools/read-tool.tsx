"use client";

import { FileTextIcon } from "@phosphor-icons/react/FileText";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import type { ToolStep } from "../messages/work-unit";

interface ReadToolProps {
	step: ToolStep;
}

/**
 * Extracts filename from a path.
 */
function extractFileName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1] ?? filePath;
}

/**
 * Cleans read output by removing system reminders and line number prefixes.
 */
function cleanReadOutput(raw: string): string {
	// Remove <system-reminder>...</system-reminder> blocks
	const withoutReminders = raw.replace(
		/<system-reminder>[\s\S]*?<\/system-reminder>/g,
		"",
	);
	// Strip line number prefixes (e.g., "     1→" or "    10→")
	const lines = withoutReminders.split("\n");
	const cleaned = lines.map((line) => line.replace(/^\s*\d+→/, ""));
	return cleaned.join("\n").trim();
}

/**
 * Minimal collapsible read tool renderer.
 */
export const ReadTool = memo(function ReadTool({ step }: ReadToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const filePath = (step.input.file_path as string) ?? "";
	const rawOutput = typeof step.output === "string" ? step.output : "";
	const output = cleanReadOutput(rawOutput);
	const hasOutput = output.length > 0;

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<FileTextIcon className="size-4 shrink-0" />}
				title="Read"
				detail={extractFileName(filePath)}
				state={step.state}
				showCaret={hasOutput}
			/>
			{hasOutput && (
				<ToolContent>
					<pre className="m-0 px-3 py-2 font-mono text-xs overflow-auto max-h-60 whitespace-pre bg-muted/30 text-foreground/70">
						{output}
					</pre>
				</ToolContent>
			)}
		</Tool>
	);
});
