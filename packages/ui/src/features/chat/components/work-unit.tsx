"use client";

import { useControllableState } from "@radix-ui/react-use-controllable-state";
import { IconChevronUp } from "@tabler/icons-react";
import type { ComponentProps } from "react";
import { Children, createContext, memo, useContext, useMemo } from "react";
import { cn } from "@/lib/utils";

const COLLAPSED_STEP_COUNT = 2;
const MAX_EXPANDED_STEP_COUNT = 10;

type WorkUnitContextValue = {
	isOpen: boolean;
	setIsOpen: (open: boolean) => void;
};

const WorkUnitContext = createContext<WorkUnitContextValue | null>(null);

export const useWorkUnit = () => {
	const context = useContext(WorkUnitContext);
	if (!context) {
		throw new Error("WorkUnit components must be used within WorkUnit");
	}
	return context;
};

export type WorkUnitProps = ComponentProps<"div"> & {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export const WorkUnit = memo(function WorkUnit({
	className,
	open,
	defaultOpen = false,
	onOpenChange,
	children,
	...props
}: WorkUnitProps) {
	const [isOpen, setIsOpen] = useControllableState({
		prop: open,
		defaultProp: defaultOpen,
		onChange: onOpenChange,
	});

	const contextValue = useMemo(
		() => ({ isOpen: isOpen ?? false, setIsOpen }),
		[isOpen, setIsOpen],
	);

	return (
		<WorkUnitContext.Provider value={contextValue}>
			<div
				className={cn(
					"not-prose mb-4 w-full rounded-lg border bg-card",
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</WorkUnitContext.Provider>
	);
});

export type WorkUnitHeaderProps = ComponentProps<"button"> & {
	stepCount?: number;
};

export const WorkUnitHeader = memo(function WorkUnitHeader({
	className,
	stepCount,
	children,
	...props
}: WorkUnitHeaderProps) {
	const { isOpen, setIsOpen } = useWorkUnit();

	return (
		<button
			type="button"
			onClick={() => setIsOpen(!isOpen)}
			className={cn(
				"flex w-full items-center gap-3 p-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
				className,
			)}
			{...props}
		>
			<IconChevronUp
				className={cn(
					"size-4 transition-transform",
					isOpen ? "rotate-0" : "rotate-180",
				)}
			/>
			<span className="flex-1 text-left font-medium">
				{children ?? (stepCount !== undefined ? `${stepCount} steps` : null)}
			</span>
		</button>
	);
});

export type WorkUnitContentProps = ComponentProps<"div">;

export const WorkUnitContent = memo(function WorkUnitContent({
	className,
	children,
	...props
}: WorkUnitContentProps) {
	const { isOpen } = useWorkUnit();

	const childArray = Children.toArray(children);
	const totalSteps = childArray.length;

	// Determine which steps to show (from the end, since latest steps should be visible)
	const visibleSteps = isOpen
		? childArray.slice(-MAX_EXPANDED_STEP_COUNT)
		: childArray.slice(-COLLAPSED_STEP_COUNT);

	const hiddenCount = isOpen
		? Math.max(0, totalSteps - MAX_EXPANDED_STEP_COUNT)
		: Math.max(0, totalSteps - COLLAPSED_STEP_COUNT);

	return (
		<div
			className={cn(
				// Hide the connecting line on last visible step using CSS
				"space-y-3 px-3 pb-3 [&>*:last-child_.work-step-line]:hidden",
				isOpen &&
					totalSteps > MAX_EXPANDED_STEP_COUNT &&
					"max-h-128 overflow-y-auto",
				className,
			)}
			{...props}
		>
			{hiddenCount > 0 && (
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<div className="relative self-stretch">
						<div className="flex size-6 shrink-0 items-center justify-center">
							<div className="size-1.5 rounded-full bg-muted-foreground/50" />
						</div>
						<div className="absolute top-[26px] -bottom-[10px] left-1/2 w-px -translate-x-1/2 bg-border" />
					</div>
					<span>+{hiddenCount} earlier steps</span>
				</div>
			)}
			{visibleSteps}
		</div>
	);
});

WorkUnit.displayName = "WorkUnit";
WorkUnitHeader.displayName = "WorkUnitHeader";
WorkUnitContent.displayName = "WorkUnitContent";
