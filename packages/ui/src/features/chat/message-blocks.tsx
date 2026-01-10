import {
	AlertCircleIcon,
	AlertTriangleIcon,
	BrainIcon,
	CheckCircleIcon,
	ChevronRightIcon,
} from "lucide-react";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "../../components/collapsible";
import { cn } from "../../lib/utils";

interface ToolUseBlockProps {
	toolName: string;
	input: unknown;
}

export function ToolUseBlock({ toolName, input }: ToolUseBlockProps) {
	return (
		<Collapsible className="w-full">
			<CollapsibleTrigger className="group flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
				<ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
				<span className="font-medium">Tool: {toolName}</span>
			</CollapsibleTrigger>
			<CollapsiblePanel>
				<pre className="mt-2 rounded bg-muted/50 p-2 text-xs overflow-x-auto">
					{JSON.stringify(input, null, 2)}
				</pre>
			</CollapsiblePanel>
		</Collapsible>
	);
}

interface ToolResultBlockProps {
	toolName: string;
	output: unknown;
	isError?: boolean;
}

export function ToolResultBlock({
	toolName,
	output,
	isError,
}: ToolResultBlockProps) {
	return (
		<Collapsible className="w-full">
			<CollapsibleTrigger
				className={cn(
					"group flex items-center gap-2 text-xs transition-colors",
					isError
						? "text-destructive hover:text-destructive/80"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
				{isError ? (
					<AlertCircleIcon className="size-3" />
				) : (
					<CheckCircleIcon className="size-3" />
				)}
				<span className="font-medium">Result: {toolName}</span>
			</CollapsibleTrigger>
			<CollapsiblePanel>
				<pre
					className={cn(
						"mt-2 rounded p-2 text-xs overflow-x-auto",
						isError ? "bg-destructive/10" : "bg-muted/50",
					)}
				>
					{typeof output === "string"
						? output
						: JSON.stringify(output, null, 2)}
				</pre>
			</CollapsiblePanel>
		</Collapsible>
	);
}

interface ThinkingBlockProps {
	text: string;
}

export function ThinkingBlock({ text }: ThinkingBlockProps) {
	return (
		<Collapsible className="w-full">
			<CollapsibleTrigger className="group flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
				<ChevronRightIcon className="size-3 transition-transform group-data-[panel-open]:rotate-90" />
				<BrainIcon className="size-3" />
				<span className="font-medium italic">Thinking...</span>
			</CollapsibleTrigger>
			<CollapsiblePanel>
				<div className="mt-2 text-sm text-muted-foreground italic whitespace-pre-wrap">
					{text}
				</div>
			</CollapsiblePanel>
		</Collapsible>
	);
}

interface ErrorBlockProps {
	error: string;
	code?: string;
}

export function ErrorBlock({ error, code }: ErrorBlockProps) {
	return (
		<div className="flex items-start gap-2 text-destructive">
			<AlertTriangleIcon className="size-4 mt-0.5 shrink-0" />
			<div className="text-sm">
				{code && <span className="font-mono text-xs mr-2">[{code}]</span>}
				{error}
			</div>
		</div>
	);
}
