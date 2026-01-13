"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { createContext, useContext, useState } from "react";

import { cn } from "@/lib/utils";

// Context to track if collapsible has ever been opened
type CollapsibleContextValue = {
	hasOpened: boolean;
};

const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

export function useCollapsibleContext() {
	return useContext(CollapsibleContext);
}

function Collapsible({
	defaultOpen,
	open,
	onOpenChange,
	...props
}: CollapsiblePrimitive.Root.Props) {
	const [hasOpened, setHasOpened] = useState(defaultOpen ?? open ?? false);

	// Track when the collapsible is opened
	const handleOpenChange: typeof onOpenChange = (isOpen, event) => {
		if (isOpen && !hasOpened) {
			setHasOpened(true);
		}
		onOpenChange?.(isOpen, event);
	};

	return (
		<CollapsibleContext.Provider value={{ hasOpened }}>
			<CollapsiblePrimitive.Root
				data-slot="collapsible"
				defaultOpen={defaultOpen}
				open={open}
				onOpenChange={handleOpenChange}
				{...props}
			/>
		</CollapsibleContext.Provider>
	);
}

function CollapsibleTrigger({
	className,
	...props
}: CollapsiblePrimitive.Trigger.Props) {
	return (
		<CollapsiblePrimitive.Trigger
			data-slot="collapsible-trigger"
			className={cn("flex w-full", className)}
			{...props}
		/>
	);
}

function CollapsiblePanel({
	className,
	...props
}: CollapsiblePrimitive.Panel.Props) {
	return (
		<CollapsiblePrimitive.Panel
			data-slot="collapsible-panel"
			className={cn(
				"h-(--collapsible-panel-height) overflow-hidden data-ending-style:h-0 data-starting-style:h-0",
				className,
			)}
			{...props}
		/>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsiblePanel };
