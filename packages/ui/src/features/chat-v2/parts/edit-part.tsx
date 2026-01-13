"use client";

import { type FileContents, MultiFileDiff } from "@pierre/diffs/react";
import { IconFile, IconFileCode } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
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

// Get file icon based on extension
function getFileIcon(filePath: string): React.ReactNode {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const iconClass = "size-4 shrink-0 rounded-sm";

	switch (ext) {
		case "ts":
		// return <TypeScriptIcon className={iconClass} />;
		case "tsx":
		case "jsx":
		// return <ReactIcon className={iconClass} />;
		case "js":
		case "mjs":
		case "cjs":
		// return <JavaScriptIcon className={iconClass} />;
		case "json":
		// return <JsonIcon className={iconClass} />;
		case "css":
		case "scss":
		case "sass":
		// return <CssIcon className={iconClass} />;
		case "html":
		case "htm":
		// return <HtmlIcon className={iconClass} />;
		case "md":
		case "mdx":
		// return <MarkdownIcon className={iconClass} />;
		default:
			return <IconFile className={iconClass} />;
	}
}

// Map file extensions to Shiki language identifiers
function getLanguageFromPath(filePath: string): string {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const languageMap: Record<string, string> = {
		ts: "typescript",
		tsx: "tsx",
		js: "javascript",
		jsx: "jsx",
		json: "json",
		md: "markdown",
		css: "css",
		scss: "scss",
		html: "html",
		py: "python",
		rb: "ruby",
		go: "go",
		rs: "rust",
		java: "java",
		c: "c",
		cpp: "cpp",
		h: "c",
		hpp: "cpp",
		sh: "bash",
		bash: "bash",
		zsh: "bash",
		yml: "yaml",
		yaml: "yaml",
		toml: "toml",
		sql: "sql",
		graphql: "graphql",
		vue: "vue",
		svelte: "svelte",
	};
	return languageMap[ext] ?? "text";
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

// Simple async highlight with Shiki
async function highlightCode(code: string, language: string) {
	const { codeToHtml } = await import("shiki");

	const [light, dark] = await Promise.all([
		codeToHtml(code, {
			lang: language,
			theme: "github-light",
		}),
		codeToHtml(code, {
			lang: language,
			theme: "github-dark",
		}),
	]);

	return { light, dark };
}

interface HighlightedHtml {
	light: string;
	dark: string;
}

export function EditPart({ part }: EditPartProps) {
	const input = part.input as EditInput | undefined;
	const [oldHtml, setOldHtml] = useState<HighlightedHtml | null>(null);
	const [newHtml, setNewHtml] = useState<HighlightedHtml | null>(null);

	const filePath = input?.file_path ?? "";
	const oldString = input?.old_string ?? "";
	const newString = input?.new_string ?? "";
	const replaceAll = input?.replace_all ?? false;
	const language = getLanguageFromPath(filePath);
	const relativePath = getRelativePath(filePath);
	const fileIcon = getFileIcon(filePath);

	const oldFile = useMemo(() => {
		return {
			name: filePath,
			contents: oldString,
		} satisfies FileContents;
	}, [oldString]);

	const newFile = useMemo(() => {
		return {
			name: filePath,
			contents: newString,
		} satisfies FileContents;
	}, [newString]);

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
				icon={<IconFileCode className="size-4 text-muted-foreground" />}
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
