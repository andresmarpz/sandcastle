"use client";

import { IconFile, IconFileText } from "@tabler/icons-react";
import type { BundledLanguage } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block";
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

const LANGUAGE_MAP: Record<string, BundledLanguage> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	php: "php",
	html: "html",
	css: "css",
	scss: "scss",
	less: "less",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	xml: "xml",
	md: "markdown",
	sql: "sql",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	fish: "fish",
	dockerfile: "dockerfile",
	toml: "toml",
	ini: "ini",
	env: "shellscript",
	txt: "log",
	log: "log",
};

const DEFAULT_LANGUAGE: BundledLanguage = "log";

function getFileExtension(filePath: string): string {
	const parts = filePath.split(".");
	if (parts.length > 1) {
		return parts[parts.length - 1] ?? "";
	}
	return "";
}

function getFileName(filePath: string): string {
	const parts = filePath.split("/");
	return parts[parts.length - 1] ?? "";
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

function getLanguageFromExtension(ext: string): BundledLanguage {
	return LANGUAGE_MAP[ext.toLowerCase()] ?? DEFAULT_LANGUAGE;
}

export function ReadPart({ part }: ReadPartProps) {
	const input = part.input as ReadInput | undefined;
	const filePath = input?.file_path ?? "";
	const extension = getFileExtension(filePath);
	const language = getLanguageFromExtension(extension);
	const relativePath = getRelativePath(filePath);

	const hasError = part.state === "output-error";
	const isComplete = part.state === "output-available";

	// Parse the output - it comes as a string with line numbers
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

	// Count lines in output
	const lineCount = cleanedOutput.split("\n").filter(Boolean).length;

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
			<ToolContent>
				<div className="p-4">
					<div className="overflow-hidden rounded-md border">
						{/* File path header */}
						<div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
							<IconFile className="size-3.5 text-muted-foreground shrink-0" />
							<code className="font-mono text-xs text-muted-foreground truncate">
								{relativePath}
							</code>
							{input?.offset !== undefined && input?.limit !== undefined && (
								<span className="text-xs text-muted-foreground">
									(lines {input.offset + 1}-{input.offset + input.limit})
								</span>
							)}
							{isComplete && lineCount > 0 && (
								<span className="ml-auto text-xs text-muted-foreground shrink-0">
									{lineCount} {lineCount === 1 ? "line" : "lines"}
								</span>
							)}
						</div>

						{/* File content */}
						{hasError && part.errorText ? (
							<div className="px-3 py-2 bg-destructive/10 text-destructive text-sm">
								{part.errorText}
							</div>
						) : isComplete && cleanedOutput ? (
							<div className="max-h-[400px] overflow-auto">
								<CodeBlock code={cleanedOutput} language={language} />
							</div>
						) : (
							<div className="px-3 py-4 text-center text-xs text-muted-foreground">
								Reading...
							</div>
						)}
					</div>
				</div>
			</ToolContent>
		</Tool>
	);
}
