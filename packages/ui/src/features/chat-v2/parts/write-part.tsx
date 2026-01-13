"use client";

import { IconFileCode } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "./index";

interface WriteInput {
	file_path: string;
	content: string;
}

interface WritePartProps {
	part: ToolCallPart;
}

// File type icons as simple SVG components
function TypeScriptIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#3178c6" />
			<path
				d="M14.5 12v6.5h-2V14h-2v-2h6v2h-2zm-6 0v2H7v4.5H5V14H3.5v-2H8.5z"
				fill="white"
			/>
		</svg>
	);
}

function JavaScriptIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#f7df1e" />
			<path
				d="M7 18.5l1.5-1c.3.5.6.9 1.2.9.6 0 1-.3 1-1.2v-5.2h2v5.3c0 1.8-1 2.7-2.8 2.7-1.5 0-2.4-.8-2.9-1.5zm6.5-.3l1.5-.9c.4.6.9 1.1 1.8 1.1.8 0 1.2-.4 1.2-.9 0-.6-.5-.9-1.4-1.3l-.5-.2c-1.4-.6-2.3-1.3-2.3-2.9 0-1.4 1.1-2.5 2.8-2.5 1.2 0 2.1.4 2.7 1.5l-1.5 1c-.3-.6-.7-.8-1.2-.8s-.9.3-.9.7c0 .5.3.7 1.1 1l.5.2c1.6.7 2.5 1.4 2.5 3 0 1.7-1.4 2.7-3.2 2.7-1.8 0-3-.9-3.6-2z"
				fill="black"
			/>
		</svg>
	);
}

function ReactIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#20232a" />
			<circle cx="12" cy="12" r="2" fill="#61dafb" />
			<ellipse
				cx="12"
				cy="12"
				rx="8"
				ry="3"
				fill="none"
				stroke="#61dafb"
				strokeWidth="1"
			/>
			<ellipse
				cx="12"
				cy="12"
				rx="8"
				ry="3"
				fill="none"
				stroke="#61dafb"
				strokeWidth="1"
				transform="rotate(60 12 12)"
			/>
			<ellipse
				cx="12"
				cy="12"
				rx="8"
				ry="3"
				fill="none"
				stroke="#61dafb"
				strokeWidth="1"
				transform="rotate(120 12 12)"
			/>
		</svg>
	);
}

function JsonIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#cbcb41" />
			<path
				d="M5 8c0-1 .5-2 1.5-2S8 7 8 8v3c0 1 .5 2 1.5 2S8 14 8 15v3c0 1-.5 2-1.5 2S5 19 5 18m14-10c0-1-.5-2-1.5-2S16 7 16 8v3c0 1-.5 2-1.5 2s1.5 1 1.5 2v3c0 1 .5 2 1.5 2s1.5-1 1.5-2"
				fill="none"
				stroke="#1e1e1e"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function CssIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#264de4" />
			<path d="M5 3l1.5 17L12 22l5.5-2L19 3H5z" fill="#2965f1" />
			<path d="M12 4v16l4.5-1.5L18 4H12z" fill="#ebebeb" opacity="0.3" />
			<path
				d="M7 7h10l-.3 3H9.5l.2 2h6.8l-.5 5.5-4 1.5-4-1.5-.3-3h2l.2 1.5 2.1.7 2.1-.7.2-2H7.5L7 7z"
				fill="white"
			/>
		</svg>
	);
}

function HtmlIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#e34c26" />
			<path d="M5 3l1.5 17L12 22l5.5-2L19 3H5z" fill="#ef652a" />
			<path d="M12 4v16l4.5-1.5L18 4H12z" fill="#ebebeb" opacity="0.3" />
			<path
				d="M7 7h10l-.2 2H9.3l.2 2h7l-.5 5.5-4 1.5-4-1.5-.3-3h2l.2 1.5 2.1.7 2.1-.7.3-2.5H7.3L7 7z"
				fill="white"
			/>
		</svg>
	);
}

function MarkdownIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#083fa1" />
			<path
				d="M4 8v8h2.5v-4l2 3 2-3v4H13V8h-2.5l-2 3-2-3H4zm12 0v5h-2l3 3 3-3h-2V8h-2z"
				fill="white"
			/>
		</svg>
	);
}

function DefaultFileIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true">
			<rect width="24" height="24" rx="2" fill="#6b7280" />
			<path
				d="M8 6h5l3 3v9a1 1 0 01-1 1H8a1 1 0 01-1-1V7a1 1 0 011-1z"
				fill="white"
				opacity="0.9"
			/>
			<path d="M13 6v3h3" fill="none" stroke="white" strokeWidth="1" />
		</svg>
	);
}

// Get file icon based on extension
function getFileIcon(filePath: string): React.ReactNode {
	const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
	const iconClass = "size-4 shrink-0 rounded-sm";

	switch (ext) {
		case "ts":
			return <TypeScriptIcon className={iconClass} />;
		case "tsx":
		case "jsx":
			return <ReactIcon className={iconClass} />;
		case "js":
		case "mjs":
		case "cjs":
			return <JavaScriptIcon className={iconClass} />;
		case "json":
			return <JsonIcon className={iconClass} />;
		case "css":
		case "scss":
		case "sass":
			return <CssIcon className={iconClass} />;
		case "html":
		case "htm":
			return <HtmlIcon className={iconClass} />;
		case "md":
		case "mdx":
			return <MarkdownIcon className={iconClass} />;
		default:
			return <DefaultFileIcon className={iconClass} />;
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

export function WritePart({ part }: WritePartProps) {
	const input = part.input as WriteInput | undefined;
	const [html, setHtml] = useState<{ light: string; dark: string } | null>(
		null,
	);
	const mounted = useRef(false);

	const filePath = input?.file_path ?? "";
	const content = input?.content ?? "";
	const language = getLanguageFromPath(filePath);
	const relativePath = getRelativePath(filePath);
	const fileIcon = getFileIcon(filePath);

	useEffect(() => {
		if (!content) return;

		highlightCode(content, language).then((result) => {
			if (!mounted.current) {
				setHtml(result);
				mounted.current = true;
			}
		});

		return () => {
			mounted.current = false;
		};
	}, [content, language]);

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
			<ToolContent>
				<div className="p-4">
					{/* Code block with diff styling */}
					<div className="overflow-hidden rounded-md border">
						{/* File path header */}
						<div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">
							{fileIcon}
							<span className="font-mono text-xs text-muted-foreground truncate">
								{relativePath}
							</span>
						</div>

						<div className="relative max-h-96 overflow-auto">
							{html ? (
								<>
									<div
										className={cn(
											"dark:hidden min-w-fit",
											"[&>pre]:m-0 [&>pre]:bg-green-50! [&>pre]:p-4 [&>pre]:text-sm [&>pre]:min-w-full",
											"[&_code]:font-mono [&_code]:text-sm",
											"[&_.line]:before:content-['+'] [&_.line]:before:text-green-600 [&_.line]:before:mr-3 [&_.line]:before:select-none",
										)}
										dangerouslySetInnerHTML={{ __html: html.light }}
									/>
									<div
										className={cn(
											"hidden dark:block min-w-fit",
											"[&>pre]:m-0 [&>pre]:bg-[#0d1f12]! [&>pre]:p-4 [&>pre]:text-sm [&>pre]:min-w-full",
											"[&_code]:font-mono [&_code]:text-sm",
											"[&_.line]:before:content-['+'] [&_.line]:before:text-green-500 [&_.line]:before:mr-3 [&_.line]:before:select-none",
										)}
										dangerouslySetInnerHTML={{ __html: html.dark }}
									/>
								</>
							) : (
								<pre className="m-0 bg-green-50 dark:bg-green-950/30 p-4 text-sm font-mono whitespace-pre-wrap">
									{content}
								</pre>
							)}
						</div>
					</div>
				</div>
			</ToolContent>
		</Tool>
	);
}
