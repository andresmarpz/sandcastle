"use client";

import {
	type Icon,
	IconChevronDown,
	IconEdit,
	IconFile,
	IconFileText,
	IconListCheck,
	IconSearch,
	IconTerminal,
	IconTool,
} from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
	useCollapsibleContext,
} from "@/components/collapsible";
import { cn } from "@/lib/utils";

// Map tool names to icons
const toolIconMap: Record<string, Icon> = {
	Bash: IconTerminal,
	Read: IconFileText,
	Write: IconFile,
	Edit: IconEdit,
	Glob: IconSearch,
	Grep: IconSearch,
	TodoWrite: IconListCheck,
};

export function getToolIcon(toolName: string): Icon {
	return toolIconMap[toolName] ?? IconTool;
}

export type WorkStepProps = ComponentProps<"div"> & {
	icon?: Icon;
	title: ReactNode;
	defaultOpen?: boolean;
	children?: ReactNode;
};

function areWorkStepPropsEqual(
	prev: WorkStepProps,
	next: WorkStepProps,
): boolean {
	// Compare icon by reference (they come from a static map)
	if (prev.icon !== next.icon) return false;
	// Compare title (usually a string)
	if (prev.title !== next.title) return false;
	// Compare other props
	if (prev.defaultOpen !== next.defaultOpen) return false;
	if (prev.className !== next.className) return false;
	if (prev.children !== next.children) return false;
	return true;
}

export const WorkStep = memo(function WorkStep({
	className,
	icon: IconComponent = IconTool,
	title,
	defaultOpen = false,
	children,
	...props
}: WorkStepProps) {
	const hasContent = !!children;

	if (!hasContent) {
		// Simple step without expandable content
		return (
			<div className={cn("flex gap-3 text-sm", className)} {...props}>
				<div className="relative self-stretch">
					<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
						<IconComponent className="size-3.5 text-muted-foreground" />
					</div>
					<div className="work-step-line absolute top-[26px] -bottom-[10px] left-1/2 w-px -translate-x-1/2 bg-border" />
				</div>
				<div className="min-w-0 flex-1 py-0.5">
					<span className="text-foreground">{title}</span>
				</div>
			</div>
		);
	}

	// Step with expandable content
	return (
		<Collapsible defaultOpen={defaultOpen}>
			<div className={cn("flex gap-3 text-sm", className)} {...props}>
				<div className="relative self-stretch">
					<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
						<IconComponent className="size-3.5 text-muted-foreground" />
					</div>
					<div className="work-step-line absolute top-[26px] -bottom-[10px] left-1/2 w-px -translate-x-1/2 bg-border" />
				</div>
				<div className="min-w-0 flex-1">
					<CollapsibleTrigger className="flex w-full items-center justify-between gap-2 py-0.5">
						<span className="text-left text-foreground">{title}</span>
						<IconChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
					</CollapsibleTrigger>
					<WorkStepContent>{children}</WorkStepContent>
				</div>
			</div>
		</Collapsible>
	);
}, areWorkStepPropsEqual);

type WorkStepContentProps = ComponentProps<typeof CollapsiblePanel>;

function WorkStepContent({
	className,
	children,
	...props
}: WorkStepContentProps) {
	const context = useCollapsibleContext();
	const shouldRender = context?.hasOpened ?? true;

	return (
		<CollapsiblePanel
			className={cn(
				"mt-2 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
				className,
			)}
			{...props}
		>
			{shouldRender ? children : null}
		</CollapsiblePanel>
	);
}

WorkStep.displayName = "WorkStep";
