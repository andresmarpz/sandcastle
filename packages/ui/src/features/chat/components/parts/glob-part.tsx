"use client";

import { File, FileMagnifyingGlass } from "@phosphor-icons/react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface GlobInput {
	pattern: string;
	path?: string;
}

interface GlobPartProps {
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

// Highlight matching parts of the filename based on glob pattern
function highlightMatch(filePath: string, pattern: string): React.ReactNode {
	const relativePath = getRelativePath(filePath);
	const fileName = relativePath.split("/").pop() ?? relativePath;
	const dirPath = relativePath.includes("/")
		? relativePath.slice(0, relativePath.lastIndexOf("/") + 1)
		: "";

	// Extract the meaningful part of the glob pattern (remove **/ prefixes)
	const cleanPattern = pattern.replace(/^\*\*\//, "").replace(/\*+/g, "");

	if (!cleanPattern) {
		return (
			<span className="font-mono text-xs">
				<span className="text-muted-foreground">{dirPath}</span>
				<span className="text-foreground">{fileName}</span>
			</span>
		);
	}

	// Find if the pattern matches part of the filename
	const lowerFileName = fileName.toLowerCase();
	const lowerPattern = cleanPattern.toLowerCase();
	const matchIndex = lowerFileName.indexOf(lowerPattern);

	if (matchIndex === -1) {
		return (
			<span className="font-mono text-xs">
				<span className="text-muted-foreground">{dirPath}</span>
				<span className="text-foreground">{fileName}</span>
			</span>
		);
	}

	const before = fileName.slice(0, matchIndex);
	const match = fileName.slice(matchIndex, matchIndex + cleanPattern.length);
	const after = fileName.slice(matchIndex + cleanPattern.length);

	return (
		<span className="font-mono text-xs">
			<span className="text-muted-foreground">{dirPath}</span>
			<span className="text-foreground">{before}</span>
			<span className="text-amber-600 dark:text-amber-400 font-medium">
				{match}
			</span>
			<span className="text-foreground">{after}</span>
		</span>
	);
}

export function GlobPart({ part }: GlobPartProps) {
	const input = part.input as GlobInput | undefined;
	const output = part.output as string | undefined;

	const pattern = input?.pattern ?? "";
	const files = output?.trim().split("\n").filter(Boolean) ?? [];

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
		<Tool>
			<ToolHeader
				title="Glob"
				type="tool-Glob"
				state={mapState(part.state)}
				icon={<FileMagnifyingGlass className="size-4 text-muted-foreground" />}
			/>
			<ToolContent>
				<div className="p-2">
					<div className="overflow-hidden rounded-md border">
						{/* Pattern header */}
						<div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
							<code className="font-mono text-xs text-muted-foreground">
								{pattern}
							</code>
							{files.length > 0 && (
								<span className="ml-auto text-xs text-muted-foreground">
									{files.length} {files.length === 1 ? "file" : "files"}
								</span>
							)}
						</div>

						{/* File list */}
						{files.length > 0 ? (
							<ul className="max-h-64 overflow-auto divide-y divide-border/50">
								{files.map((file) => (
									<li
										key={`${part.toolCallId}_${file.slice(Math.min(10, file.length - 10), file.length)}`}
										className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
									>
										<File className="size-3.5 text-muted-foreground shrink-0" />
										{highlightMatch(file, pattern)}
									</li>
								))}
							</ul>
						) : part.state === "output-available" ? (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground">
								No files found
							</div>
						) : (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground">
								Searching...
							</div>
						)}
					</div>
				</div>
			</ToolContent>
		</Tool>
	);
}
