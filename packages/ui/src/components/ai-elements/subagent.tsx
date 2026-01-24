"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { DetectiveIcon } from "@phosphor-icons/react/Detective";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo, useState } from "react";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
	useCollapsibleContext,
} from "@/components/collapsible";
import { cn } from "@/lib/utils";

type SubagentStatus = "streaming" | "running" | "complete" | "error";

type SubagentContextValue = {
	status: SubagentStatus;
};

const SubagentContext = createContext<SubagentContextValue | null>(null);

export const useSubagent = () => {
	const context = useContext(SubagentContext);
	if (!context) {
		throw new Error("Subagent components must be used within Subagent");
	}
	return context;
};

export type SubagentProps = ComponentProps<typeof Collapsible> & {
	status?: SubagentStatus;
};

export const Subagent = memo(function Subagent({
	className,
	status = "running",
	...props
}: SubagentProps) {
	const contextValue = useMemo(() => ({ status }), [status]);

	return (
		<SubagentContext.Provider value={contextValue}>
			<Collapsible
				data-slot="subagent"
				data-status={status}
				className={cn(
					"not-prose w-full overflow-hidden rounded-md border",
					className,
				)}
				{...props}
			/>
		</SubagentContext.Provider>
	);
});

export type SubagentHeaderProps = ComponentProps<typeof CollapsibleTrigger> & {
	title: ReactNode;
	subagentType?: string;
};

export const SubagentHeader = memo(function SubagentHeader({
	className,
	title,
	subagentType,
	...props
}: SubagentHeaderProps) {
	const { status } = useSubagent();

	return (
		<CollapsibleTrigger
			className={cn(
				"flex w-full items-center gap-2 px-3 py-2 text-sm",
				"bg-background",
				className,
			)}
			{...props}
		>
			<DetectiveIcon className="size-4 shrink-0 text-muted-foreground" />
			<span className="font-medium">Agent</span>
			{subagentType && (
				<>
					<span className="text-muted-foreground">/</span>
					<span className="truncate text-muted-foreground">{subagentType}</span>
				</>
			)}
			<div className="ml-auto flex shrink-0 items-center gap-2">
				<SubagentStatusDot status={status} />
				<CaretDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</div>
		</CollapsibleTrigger>
	);
});

export type SubagentContentProps = ComponentProps<typeof CollapsiblePanel>;

export const SubagentContent = memo(function SubagentContent({
	className,
	children,
	...props
}: SubagentContentProps) {
	const collapsibleContext = useCollapsibleContext();
	const shouldRender = collapsibleContext?.hasOpened ?? true;

	return (
		<CollapsiblePanel
			data-slot="subagent-content"
			className={cn("border-t", className)}
			{...props}
		>
			{shouldRender ? children : null}
		</CollapsiblePanel>
	);
});

export type SubagentOutputProps = ComponentProps<"div"> & {
	output: ReactNode;
};

export const SubagentOutput = memo(function SubagentOutput({
	className,
	output,
	...props
}: SubagentOutputProps) {
	if (!output) {
		return null;
	}

	return (
		<div className={cn("space-y-1", className)} {...props}>
			<span className="text-xs font-medium text-muted-foreground">Output</span>
			<div
				data-slot="subagent-output"
				className="rounded-md border bg-muted/30 p-3 text-sm"
			>
				{output}
			</div>
		</div>
	);
});

/**
 * A collapsible section for the subagent prompt.
 * Collapsed by default since prompts can be long.
 */
export type SubagentPromptProps = ComponentProps<"div"> & {
	prompt: ReactNode;
	defaultOpen?: boolean;
};

export const SubagentPrompt = memo(function SubagentPrompt({
	className,
	prompt,
	defaultOpen = false,
	...props
}: SubagentPromptProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	if (!prompt) {
		return null;
	}

	return (
		<div className={cn("space-y-1", className)} {...props}>
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
			>
				<div className={cn("size-3.5", !isOpen && "-rotate-90")}>
					<CaretDownIcon className="size-3.5" />
				</div>
				<span>Prompt</span>
			</button>
			{isOpen && (
				<div className="rounded-md border bg-muted/30 p-3 text-sm">
					{prompt}
				</div>
			)}
		</div>
	);
});

function SubagentStatusDot({ status }: { status: SubagentStatus }) {
	const dotClasses = cn("size-2 rounded-full", {
		"bg-blue-500 animate-pulse": status === "streaming" || status === "running",
		"bg-green-500": status === "complete",
		"bg-red-500": status === "error",
	});

	return <span className={dotClasses} />;
}

Subagent.displayName = "Subagent";
SubagentHeader.displayName = "SubagentHeader";
SubagentContent.displayName = "SubagentContent";
SubagentOutput.displayName = "SubagentOutput";
SubagentPrompt.displayName = "SubagentPrompt";
