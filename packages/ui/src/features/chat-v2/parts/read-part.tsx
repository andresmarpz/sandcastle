import { CheckCircleIcon, FileTextIcon, LoaderIcon } from "lucide-react";
import type { BundledLanguage } from "shiki";
import { CodeBlock } from "@/components/ai-elements/code-block";
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

function getLanguageFromExtension(ext: string): BundledLanguage {
	return LANGUAGE_MAP[ext.toLowerCase()] ?? DEFAULT_LANGUAGE;
}

export function ReadPart({ part }: ReadPartProps) {
	const input = part.input as ReadInput | undefined;
	const filePath = input?.file_path ?? "";
	const fileName = getFileName(filePath);
	const extension = getFileExtension(filePath);
	const language = getLanguageFromExtension(extension);

	const isLoading =
		part.state === "input-streaming" || part.state === "input-available";
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

	return (
		<div className="mb-4 rounded-md border overflow-hidden">
			<div className="flex items-center justify-between gap-2 bg-muted/30 px-3 py-2 border-b">
				<div className="flex items-center gap-2 min-w-0">
					<FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
					<span className="text-sm font-medium truncate" title={filePath}>
						{fileName}
					</span>
					{input?.offset !== undefined && input?.limit !== undefined && (
						<span className="text-xs text-muted-foreground">
							(lines {input.offset + 1}-{input.offset + input.limit})
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5 shrink-0">
					{isLoading && (
						<>
							<LoaderIcon className="size-3.5 animate-spin text-blue-600" />
							<span className="text-xs text-muted-foreground">Reading...</span>
						</>
					)}
					{isComplete && (
						<CheckCircleIcon className="size-3.5 text-green-600" />
					)}
					{hasError && <span className="text-xs text-destructive">Error</span>}
				</div>
			</div>

			{hasError && part.errorText && (
				<div className="px-3 py-2 bg-destructive/10 text-destructive text-sm">
					{part.errorText}
				</div>
			)}

			{isComplete && cleanedOutput && (
				<div className="max-h-[400px] overflow-auto">
					<CodeBlock code={cleanedOutput} language={language} />
				</div>
			)}

			{!isComplete && !hasError && !cleanedOutput && (
				<div className="px-3 py-4 text-center text-sm text-muted-foreground">
					Reading file...
				</div>
			)}
		</div>
	);
}
