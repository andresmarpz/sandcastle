"use client";

import { FilePlusIcon } from "@phosphor-icons/react/FilePlus";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import type { ToolStep } from "../messages/work-unit";

interface WriteToolProps {
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
 * Minimal collapsible write tool renderer.
 */
export const WriteTool = memo(function WriteTool({ step }: WriteToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const filePath = (step.input.file_path as string) ?? "";
	const content = (step.input.content as string) ?? "";
	const hasContent = content.length > 0;

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<FilePlusIcon className="size-4 shrink-0" />}
				title="Write"
				detail={extractFileName(filePath)}
				state={step.state}
				showCaret={hasContent}
			/>
			{hasContent && (
				<ToolContent>
					<pre className="m-0 px-3 py-2 font-mono text-xs overflow-auto max-h-60 whitespace-pre bg-muted/30 text-foreground/70">
						{content}
					</pre>
				</ToolContent>
			)}
		</Tool>
	);
});
