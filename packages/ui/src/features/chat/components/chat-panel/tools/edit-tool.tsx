"use client";

import { PencilSimpleLineIcon } from "@phosphor-icons/react/PencilSimpleLine";
import { memo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import type { ToolStep } from "../messages/work-unit";

interface EditToolProps {
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
 * Minimal collapsible edit tool renderer.
 */
export const EditTool = memo(function EditTool({ step }: EditToolProps) {
	const [isOpen, setIsOpen] = useState(false);

	const filePath = (step.input.file_path as string) ?? "";
	const oldString = (step.input.old_string as string) ?? "";
	const newString = (step.input.new_string as string) ?? "";
	const hasContent = oldString.length > 0 || newString.length > 0;

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<ToolTrigger
				icon={<PencilSimpleLineIcon className="size-4 shrink-0" />}
				title="Edit"
				detail={extractFileName(filePath)}
				state={step.state}
				showCaret={hasContent}
			/>
			{hasContent && (
				<ToolContent>
					<div className="flex flex-col gap-2 px-3 py-2 bg-muted/30">
						{oldString && (
							<div>
								<div className="text-xs text-muted-foreground mb-1">−</div>
								<pre className="m-0 font-mono text-xs overflow-auto max-h-40 whitespace-pre text-red-600 dark:text-red-400/80">
									{oldString}
								</pre>
							</div>
						)}
						{newString && (
							<div>
								<div className="text-xs text-muted-foreground mb-1">+</div>
								<pre className="m-0 font-mono text-xs overflow-auto max-h-40 whitespace-pre text-green-600 dark:text-green-400/80">
									{newString}
								</pre>
							</div>
						)}
					</div>
				</ToolContent>
			)}
		</Tool>
	);
});
