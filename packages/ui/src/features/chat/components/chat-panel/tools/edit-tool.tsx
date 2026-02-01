"use client";

import { PencilSimpleLineIcon } from "@phosphor-icons/react/PencilSimpleLine";
import { XIcon } from "@phosphor-icons/react/X";
import type { FileContents } from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import { memo, useMemo, useState } from "react";
import { Tool, ToolContent, ToolTrigger } from "@/components/ai-elements/tool";
import { Button } from "@/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/dialog";
import type { ToolStep } from "../messages/work-unit";
import { OpenPathButton } from "../open-path-button";

const DIFF_OPTIONS = {
	theme: { dark: "pierre-dark", light: "pierre-light" },
	themeType: "system" as const,
	diffStyle: "unified" as const,
	diffIndicators: "bars" as const,
	disableBackground: false,
	disableLineNumbers: false,
	overflow: "wrap" as const,
	disableFileHeader: false,
};

function extractFileName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1] ?? filePath;
}

interface EditToolProps {
	step: ToolStep;
}

export const EditTool = memo(function EditTool({ step }: EditToolProps) {
	const filePath = (step.input.file_path as string) ?? "";
	const oldString = (step.input.old_string as string) ?? "";
	const newString = (step.input.new_string as string) ?? "";
	const hasContent = oldString.length > 0 || newString.length > 0;
	const [isOpen, setIsOpen] = useState(hasContent);

	const oldFile = useMemo<FileContents>(
		() => ({ name: filePath || "old", contents: oldString }),
		[filePath, oldString],
	);
	const newFile = useMemo<FileContents>(
		() => ({ name: filePath || "new", contents: newString }),
		[filePath, newString],
	);

	const diffBlock = (
		<div className="min-w-0 rounded-md border border-border bg-muted/30 overflow-hidden [--diffs-font-size:12px] [--diffs-line-height:1.5]">
			<MultiFileDiff
				oldFile={oldFile}
				newFile={newFile}
				options={DIFF_OPTIONS}
				className="max-h-[70vh]"
			/>
		</div>
	);

	return (
		<Tool open={isOpen} onOpenChange={setIsOpen}>
			<div className="flex items-center gap-1">
				<ToolTrigger
					icon={<PencilSimpleLineIcon className="size-4 shrink-0" />}
					title="Edit"
					detail={extractFileName(filePath)}
					state={step.state}
					showCaret={hasContent}
					className="flex-1 min-w-0"
				/>
				{filePath && hasContent ? (
					<div onClick={(e) => e.stopPropagation()} className="shrink-0">
						<Dialog>
							<DialogTrigger className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-muted/50">
								View full
							</DialogTrigger>
							<DialogContent
								size="large"
								className="flex flex-col gap-0 p-0 h-fit"
								showCloseButton={false}
							>
								<DialogHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-4 py-3 shrink-0">
									<DialogTitle className="min-w-0 flex-1 truncate font-mono text-sm">
										{filePath}
									</DialogTitle>
									<div className="flex shrink-0 items-center gap-2">
										<OpenPathButton path={filePath} />
										<DialogClose
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label="Close"
												/>
											}
										>
											<XIcon className="size-4" />
										</DialogClose>
									</div>
								</DialogHeader>
								<div className="flex min-w-0 flex-1 flex-col overflow-auto p-4">
									<div className="min-w-0 rounded-md border border-border bg-muted/30 overflow-hidden [--diffs-font-size:12px] [--diffs-line-height:1.5]">
										<MultiFileDiff
											oldFile={oldFile}
											newFile={newFile}
											options={DIFF_OPTIONS}
											className="max-h-[80vh]"
										/>
									</div>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				) : filePath ? (
					<div onClick={(e) => e.stopPropagation()} className="shrink-0">
						<OpenPathButton path={filePath} />
					</div>
				) : null}
			</div>
			{hasContent && <ToolContent>{diffBlock}</ToolContent>}
		</Tool>
	);
});
