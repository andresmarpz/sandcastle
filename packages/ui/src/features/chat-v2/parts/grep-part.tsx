"use client";

import { IconFile, IconSearch } from "@tabler/icons-react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import type { ToolCallPart } from "./index";

interface GrepInput {
	pattern: string;
	path?: string;
	glob?: string;
	type?: string;
}

interface GrepPartProps {
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

// Highlight matching parts of the filename based on search pattern
function highlightMatch(filePath: string, pattern: string): React.ReactNode {
	const relativePath = getRelativePath(filePath);
	const fileName = relativePath.split("/").pop() ?? relativePath;
	const dirPath = relativePath.includes("/")
		? relativePath.slice(0, relativePath.lastIndexOf("/") + 1)
		: "";

	// Try to extract a simple string from the regex pattern
	// Remove regex special chars and alternations to find searchable terms
	const cleanPattern = pattern
		.replace(/\\\./g, ".")
		.replace(/\\\[.*?\\\]/g, "")
		.replace(/\[.*?\]/g, "")
		.replace(/[.*+?^${}()|[\]\\]/g, " ")
		.split(/\s+|\|/)
		.filter((s) => s.length > 2)
		.sort((a, b) => b.length - a.length)[0];

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
			<span className="text-blue-600 dark:text-blue-400 font-medium">
				{match}
			</span>
			<span className="text-foreground">{after}</span>
		</span>
	);
}

// Parse grep output to extract file count and file list
function parseGrepOutput(output: string): {
	fileCount: number;
	files: string[];
} {
	const lines = output.trim().split("\n").filter(Boolean);

	// Check for "Found X files" header
	const countMatch = lines[0]?.match(/^Found (\d+) files?$/);
	if (countMatch?.[1]) {
		return {
			fileCount: parseInt(countMatch[1], 10),
			files: lines.slice(1),
		};
	}

	// Otherwise, all lines are files
	return {
		fileCount: lines.length,
		files: lines,
	};
}

export function GrepPart({ part }: GrepPartProps) {
	const input = part.input as GrepInput | undefined;
	const output = part.output as string | undefined;

	const pattern = input?.pattern ?? "";
	const { fileCount, files } = output
		? parseGrepOutput(output)
		: { fileCount: 0, files: [] };

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
				title="Grep"
				type="tool-Grep"
				state={mapState(part.state)}
				icon={<IconSearch className="size-4 text-muted-foreground" />}
			/>
			<ToolContent>
				<div className="p-4">
					<div className="overflow-hidden rounded-md border">
						{/* Pattern header */}
						<div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
							<code className="font-mono text-xs text-muted-foreground truncate">
								/{pattern}/
							</code>
							{fileCount > 0 && (
								<span className="ml-auto text-xs text-muted-foreground shrink-0">
									{fileCount} {fileCount === 1 ? "match" : "matches"}
								</span>
							)}
						</div>

						{/* File list */}
						{files.length > 0 ? (
							<ul className="max-h-64 overflow-auto divide-y divide-border/50">
								{files.map((file, index) => (
									<li
										key={index}
										className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30"
									>
										<IconFile className="size-3.5 text-muted-foreground shrink-0" />
										{highlightMatch(file, pattern)}
									</li>
								))}
							</ul>
						) : part.state === "output-available" ? (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground">
								No matches found
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
