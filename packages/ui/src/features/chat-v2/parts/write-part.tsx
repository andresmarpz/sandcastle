"use client";

import { parseDiffFromFile } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { IconFileCode } from "@tabler/icons-react";
import { useMemo } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface WriteInput {
	file_path: string;
	content: string;
}

interface WritePartProps {
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

export function WritePart({ part }: WritePartProps) {
	const input = part.input as WriteInput | undefined;

	const filePath = input?.file_path ?? "";
	const content = input?.content ?? "";
	const relativePath = getRelativePath(filePath);

	const file = useMemo(() => {
		return parseDiffFromFile(
			{
				name: relativePath,
				contents: "",
			},
			{
				name: relativePath,
				contents: content,
			},
		);
	}, [relativePath, content]);

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
				title="Write"
				type="tool-Write"
				state={mapState(part.state)}
				icon={<IconFileCode className="size-4 text-muted-foreground" />}
			/>
			<ToolContent className="overflow-auto rounded-md border relative max-h-96 m-2 mt-0">
				<FileDiff
					fileDiff={file}
					options={{
						theme: {
							dark: "vitesse-dark",
							light: "vitesse-light",
						},
					}}
				/>
			</ToolContent>
		</Tool>
	);
}
