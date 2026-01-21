"use client";

import { FileCode } from "@phosphor-icons/react";
import { type FileContents, MultiFileDiff } from "@pierre/diffs/react";
import { useMemo } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface EditInput {
	file_path: string;
	old_string: string;
	new_string: string;
	replace_all?: boolean;
}

interface EditPartProps {
	part: ToolCallPart;
}

// Try to make the path relative by finding common repo patterns
function getRelativePath(filePath: string): string {
	const patterns = [
		/.*\/(packages\/.*)/,
		/.*\/(src\/.*)/,
		/.*\/(apps\/.*)/,
		/.*\/(lib\/.*)/,
		/.*\/(components\/.*)/,
	];

	for (const pattern of patterns) {
		const match = filePath.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}

	return filePath.split("/").pop() ?? filePath;
}

export function EditPart({ part }: EditPartProps) {
	const input = part.input as EditInput | undefined;

	const filePath = input?.file_path ?? "";
	const oldString = input?.old_string ?? "";
	const newString = input?.new_string ?? "";
	const relativePath = getRelativePath(filePath);

	const oldFile = useMemo(() => {
		return {
			name: relativePath,
			contents: oldString,
		} satisfies FileContents;
	}, [relativePath, oldString]);

	const newFile = useMemo(() => {
		return {
			name: relativePath,
			contents: newString,
		} satisfies FileContents;
	}, [relativePath, newString]);

	const mapState = (state: ToolCallPart["state"]) => {
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
	};

	return (
		<Tool defaultOpen>
			<ToolHeader
				title="Edit"
				type="tool-Edit"
				state={mapState(part.state)}
				icon={<FileCode className="size-4 text-muted-foreground" />}
			/>
			<ToolContent className="overflow-auto rounded-md border relative max-h-96 m-2 mt-0">
				<MultiFileDiff
					oldFile={oldFile}
					newFile={newFile}
					options={{
						theme: {
							dark: "vitesse-dark",
							light: "vitesse-light",
						},
						diffStyle: "unified",
					}}
				/>
			</ToolContent>
		</Tool>
	);
}
