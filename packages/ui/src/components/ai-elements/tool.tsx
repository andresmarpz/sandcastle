"use client";

import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { CircleIcon } from "@phosphor-icons/react/Circle";
import { SpinnerIcon } from "@phosphor-icons/react/Spinner";
import { WrenchIcon } from "@phosphor-icons/react/Wrench";
import { XIcon } from "@phosphor-icons/react/X";
import type { ComponentProps, ReactNode } from "react";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import { cn } from "@/lib/utils";

/**
 * Tool state for status indicator.
 */
export type ToolState = "pending" | "running" | "complete" | "error";

/**
 * Root container for tool display.
 * Wraps Collapsible with minimal styling.
 */
export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
	<Collapsible
		className={cn(
			"rounded-md border border-border",
			"bg-background",
			"overflow-hidden",
			className,
		)}
		{...props}
	/>
);

/**
 * Tool trigger/header props.
 */
export interface ToolTriggerProps
	extends Omit<ComponentProps<typeof CollapsibleTrigger>, "children"> {
	/** Tool icon (defaults to WrenchIcon) */
	icon?: ReactNode;
	/** Tool name */
	title: string;
	/** Secondary info (file path, command, pattern) */
	detail?: string;
	/** Tool state for status indicator */
	state?: ToolState;
	/** Show expand/collapse caret (default: true) */
	showCaret?: boolean;
}

/**
 * Renders a small state indicator icon.
 */
function StateIcon({ state }: { state: ToolState }) {
	switch (state) {
		case "pending":
			return <CircleIcon className="size-3 text-muted-foreground" />;
		case "running":
			return (
				<SpinnerIcon className="size-3 animate-spin text-muted-foreground" />
			);
		case "complete":
			return <CheckIcon className="size-3 text-green-600" />;
		case "error":
			return <XIcon className="size-3 text-destructive" />;
	}
}

/**
 * Tool header/trigger with icon, title, detail pattern.
 * Layout: [Icon] [Title] / [Detail] ... [StateIcon?] [Caret]
 */
export const ToolTrigger = ({
	className,
	icon,
	title,
	detail,
	state,
	showCaret = true,
	...props
}: ToolTriggerProps) => (
	<CollapsibleTrigger
		className={cn(
			"flex items-center gap-2 px-3 py-2 w-full",
			"text-sm text-subtle-foreground",
			"hover:bg-muted/50 transition-colors",
			className,
		)}
		{...props}
	>
		{icon ?? <WrenchIcon className="size-4 shrink-0" />}
		<span className="font-medium">{title}</span>
		{detail && (
			<>
				<span className="text-muted-foreground">/</span>
				<span className="truncate text-muted-foreground">{detail}</span>
			</>
		)}
		<div className="ml-auto flex items-center gap-2">
			{state && <StateIcon state={state} />}
			{showCaret && (
				<div className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180">
					<CaretDownIcon className="size-4" />
				</div>
			)}
		</div>
	</CollapsibleTrigger>
);

/**
 * Tool content panel for custom children.
 */
export type ToolContentProps = ComponentProps<typeof CollapsiblePanel>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsiblePanel
		className={cn("not-prose border-t border-border", className)}
		{...props}
	/>
);
