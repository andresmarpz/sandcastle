"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { IconChevronUp, IconRobot } from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, memo, useContext, useMemo } from "react";
import { Badge } from "@/components/badge";
import { cn } from "@/lib/utils";

type SubagentStatus = "streaming" | "running" | "complete" | "error";

type SubagentContextValue = {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
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

export type SubagentProps = ComponentProps<"div"> & {
	status?: SubagentStatus;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export const Subagent = memo(function Subagent({
	className,
	status = "running",
	open,
	defaultOpen = false,
	onOpenChange,
	children,
	...props
}: SubagentProps) {
	const [isOpen, setIsOpen] = useControllableState({
		prop: open,
		defaultProp: defaultOpen,
		onChange: onOpenChange,
	});

	const contextValue = useMemo(
		() => ({ isOpen: isOpen ?? false, setIsOpen, status }),
		[isOpen, setIsOpen, status],
	);

	return (
		<SubagentContext.Provider value={contextValue}>
			<div
				data-slot="subagent"
				data-status={status}
				className={cn(
					"not-prose mb-4 w-full overflow-hidden rounded-lg border bg-card",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</SubagentContext.Provider>
	);
});

export type SubagentHeaderProps = ComponentProps<"button"> & {
	title: ReactNode;
	subagentType?: string;
};

export const SubagentHeader = memo(function SubagentHeader({
	className,
	title,
	subagentType,
	...props
}: SubagentHeaderProps) {
	const { isOpen, setIsOpen, status } = useSubagent();

	return (
		<button
			type="button"
			onClick={() => setIsOpen(!isOpen)}
			className={cn(
				"flex w-full items-center gap-3 p-3 text-sm transition-colors hover:bg-muted/50",
				className,
			)}
			{...props}
		>
			<div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
				<IconRobot className="size-3.5 text-primary" />
			</div>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<span className="truncate font-medium text-foreground">{title}</span>
				{subagentType && (
					<Badge
						variant="outline"
						className="shrink-0 text-xs font-normal text-muted-foreground"
					>
						{subagentType}
					</Badge>
				)}
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<SubagentStatusBadge status={status} />
				<IconChevronUp
					className={cn(
						"size-4 text-muted-foreground transition-transform",
						isOpen ? "rotate-0" : "rotate-180",
					)}
				/>
			</div>
		</button>
	);
});

export type SubagentContentProps = ComponentProps<"div">;

export const SubagentContent = memo(function SubagentContent({
	className,
	children,
	...props
}: SubagentContentProps) {
	const { isOpen } = useSubagent();

	if (!isOpen) {
		return null;
	}

	return (
		<div
			data-slot="subagent-content"
			className={cn("border-t px-3 pb-3 pt-2", className)}
			{...props}
		>
			{children}
		</div>
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
	const { isOpen } = useSubagent();

	if (!isOpen || !output) {
		return null;
	}

	return (
		<div
			data-slot="subagent-output"
			className={cn(
				"border-t bg-muted/30 px-3 py-2 text-sm text-muted-foreground",
				className,
			)}
			{...props}
		>
			{output}
		</div>
	);
});

function SubagentStatusBadge({ status }: { status: SubagentStatus }) {
	switch (status) {
		case "streaming":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
					<span className="size-1.5 animate-pulse rounded-full bg-current" />
					Starting
				</Badge>
			);
		case "running":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
					<span className="size-1.5 animate-pulse rounded-full bg-current" />
					Running
				</Badge>
			);
		case "complete":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">
					Complete
				</Badge>
			);
		case "error":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
					Error
				</Badge>
			);
		default:
			return null;
	}
}

Subagent.displayName = "Subagent";
SubagentHeader.displayName = "SubagentHeader";
SubagentContent.displayName = "SubagentContent";
SubagentOutput.displayName = "SubagentOutput";
