"use client";

import { CaretDown as CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { Code as CodeIcon } from "@phosphor-icons/react/Code";
import { FileMagnifyingGlass as FileMagnifyingGlassIcon } from "@phosphor-icons/react/FileMagnifyingGlass";
import { FilePlus as FilePlusIcon } from "@phosphor-icons/react/FilePlus";
import { FileText as FileTextIcon } from "@phosphor-icons/react/FileText";
import { MagnifyingGlass as MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { PencilSimpleLine as PencilSimpleLineIcon } from "@phosphor-icons/react/PencilSimpleLine";
import { Sparkle as SparkleIcon } from "@phosphor-icons/react/Sparkle";
import { Terminal as TerminalIcon } from "@phosphor-icons/react/Terminal";
import { Wrench as WrenchIcon } from "@phosphor-icons/react/Wrench";
import { type ComponentType, memo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ToolStep } from "./group-messages";

interface WorkUnitProps {
	steps: ToolStep[];
}

export const WorkUnit = memo(function WorkUnit({ steps }: WorkUnitProps) {
	const [isExpanded, setIsExpanded] = useState(false);

	const stepCount = steps.length;
	const hasMultipleSteps = stepCount > 1;

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				{/* Wrap SVG in div for rotation - avoids expensive SVG re-rasterization */}
				<div className={cn("size-3.5", !isExpanded && "-rotate-90")}>
					<CaretDownIcon className="size-3.5" />
				</div>
				<span>
					{stepCount} {hasMultipleSteps ? "steps" : "step"}
				</span>
			</button>

			<div
				className={cn(
					"ml-2 mt-1 flex flex-col gap-2 border-l border-border pl-4",
					!isExpanded && "hidden",
				)}
			>
				{steps.map((step) => (
					<ToolStepRenderer key={step.id} step={step} />
				))}
			</div>
		</div>
	);
});

interface ToolStepRendererProps {
	step: ToolStep;
}

/**
 * Gets the icon component for a tool.
 */
function getToolIcon(toolName: string): ComponentType<{ className?: string }> {
	switch (toolName) {
		case "Bash":
			return TerminalIcon;
		case "Read":
			return FileTextIcon;
		case "Write":
			return FilePlusIcon;
		case "Edit":
			return PencilSimpleLineIcon;
		case "Glob":
			return FileMagnifyingGlassIcon;
		case "Grep":
			return MagnifyingGlassIcon;
		case "Task":
			return CodeIcon;
		case "Skill":
			return SparkleIcon;
		default:
			return WrenchIcon;
	}
}

/**
 * Extracts the display info for a tool based on its name, input, and metadata.
 */
function getToolDisplayInfo(step: ToolStep): {
	title: string;
	detail: string | null;
} {
	const { toolName, input, toolMetadata } = step;

	switch (toolName) {
		case "Bash": {
			const description = input.description as string | undefined;
			const command = input.command as string | undefined;
			return {
				title: "Bash",
				detail: description ?? truncate(command, 50) ?? null,
			};
		}
		case "Read": {
			const filePath = input.file_path as string | undefined;
			return {
				title: "Read",
				detail: filePath ? extractFileName(filePath) : null,
			};
		}
		case "Write": {
			const filePath = input.file_path as string | undefined;
			return {
				title: "Write",
				detail: filePath ? extractFileName(filePath) : null,
			};
		}
		case "Edit": {
			const filePath = input.file_path as string | undefined;
			return {
				title: "Edit",
				detail: filePath ? extractFileName(filePath) : null,
			};
		}
		case "Glob": {
			const pattern = input.pattern as string | undefined;
			return {
				title: "Glob",
				detail: pattern ?? null,
			};
		}
		case "Grep": {
			const pattern = input.pattern as string | undefined;
			return {
				title: "Grep",
				detail: pattern ? (truncate(pattern, 40) ?? null) : null,
			};
		}
		case "Task": {
			const description = input.description as string | undefined;
			const subagentType = input.subagent_type as string | undefined;
			return {
				title: "Task",
				detail: description ?? subagentType ?? null,
			};
		}
		case "Skill": {
			const skillName = input.skill as string | undefined;
			// Use toolMetadata.commandName if available, otherwise fall back to input.skill
			const commandName =
				toolMetadata?.tool === "Skill" ? toolMetadata.commandName : skillName;
			return {
				title: "Skill",
				detail: commandName ?? null,
			};
		}
		case "WebFetch": {
			const url = input.url as string | undefined;
			return {
				title: "WebFetch",
				detail: url ? truncateUrl(url) : null,
			};
		}
		case "WebSearch": {
			const query = input.query as string | undefined;
			return {
				title: "WebSearch",
				detail: query ? (truncate(query, 40) ?? null) : null,
			};
		}
		default:
			return {
				title: toolName,
				detail: null,
			};
	}
}

/**
 * Truncates a string to a maximum length.
 */
function truncate(
	str: string | undefined,
	maxLength: number,
): string | undefined {
	if (!str) return undefined;
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 1)}...`;
}

/**
 * Truncates a URL to show just the domain and path hint.
 */
function truncateUrl(url: string): string {
	try {
		const parsed = new URL(url);
		const path =
			parsed.pathname.length > 20
				? `${parsed.pathname.slice(0, 17)}...`
				: parsed.pathname;
		return `${parsed.hostname}${path}`;
	} catch {
		return truncate(url, 40) ?? url;
	}
}

/**
 * Extracts a short filename from a path.
 */
function extractFileName(filePath: string): string {
	const parts = filePath.split("/");
	const fileName = parts[parts.length - 1] ?? filePath;

	if (fileName.length <= 35) {
		return fileName;
	}

	// Try to show relative path from common roots
	const commonRoots = ["packages/", "src/", "apps/", "lib/", "components/"];
	for (const root of commonRoots) {
		const idx = filePath.indexOf(root);
		if (idx !== -1) {
			const relativePath = filePath.slice(idx);
			if (relativePath.length <= 45) {
				return relativePath;
			}
		}
	}

	return fileName;
}

/**
 * Renders a single tool step as a simple outlined box.
 */
const ToolStepRenderer = memo(function ToolStepRenderer({
	step,
}: ToolStepRendererProps) {
	const Icon = getToolIcon(step.toolName);
	const { title, detail } = getToolDisplayInfo(step);

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-3 py-2",
				"rounded-md border border-border",
				"text-sm text-subtle-foreground",
				"bg-background",
			)}
		>
			<Icon className="size-4 shrink-0" />
			<span className="font-medium">{title}</span>
			{detail && (
				<>
					<span className="text-muted-foreground">/</span>
					<span className="truncate text-muted-foreground">{detail}</span>
				</>
			)}
		</div>
	);
});
