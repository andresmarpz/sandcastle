"use client";

import { File, type FileContents } from "@pierre/diffs/react";
import { IconFileText } from "@tabler/icons-react";
import { useMemo } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface ReadInput {
	file_path: string;
	offset?: number;
	limit?: number;
}

interface ReadPartProps {
	part: ToolCallPart;
}

// Extract relative path from absolute path
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

export function ReadPart({ part }: ReadPartProps) {
	const input = part.input as ReadInput | undefined;
	const filePath = input?.file_path ?? "";
	const relativePath = getRelativePath(filePath);

	const output = typeof part.output === "string" ? part.output : "";

	// Clean the output to remove line number prefixes if present
	// The format is: "     1→content" where → is the separator
	const cleanedOutput = output
		.split("\n")
		.map((line) => {
			const match = line.match(/^\s*\d+→(.*)$/);
			return match ? match[1] : line;
		})
		.join("\n");

	const file = useMemo(() => {
		return {
			name: relativePath,
			contents: cleanedOutput,
		} satisfies FileContents;
	}, [relativePath, cleanedOutput]);

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
				title="Read"
				type="tool-Read"
				state={mapState(part.state)}
				icon={<IconFileText className="size-4 text-muted-foreground" />}
			/>
			<ToolContent className="overflow-auto rounded-md border relative max-h-96 m-2 mt-0">
				<File
					file={file}
					options={{
						theme: { dark: "vitesse-dark", light: "vitesse-light" },
					}}
				/>
			</ToolContent>
		</Tool>
	);
}
