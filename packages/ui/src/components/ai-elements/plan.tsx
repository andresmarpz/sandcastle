"use client";

import { CaretUpDown } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { createContext, useContext } from "react";
import { Button } from "@/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/card";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import { cn } from "@/lib/utils";
import { Shimmer } from "./shimmer";

type PlanContextValue = {
	isStreaming: boolean;
};

const PlanContext = createContext<PlanContextValue | null>(null);

const usePlan = () => {
	const context = useContext(PlanContext);
	if (!context) {
		throw new Error("Plan components must be used within Plan");
	}
	return context;
};

export type PlanProps = ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
};

export const Plan = ({
	className,
	isStreaming = false,
	children,
	...props
}: PlanProps) => (
	<PlanContext.Provider value={{ isStreaming }}>
		<Collapsible
			data-slot="plan"
			{...props}
			render={<Card className={cn("shadow-none", className)} />}
		>
			{children}
		</Collapsible>
	</PlanContext.Provider>
);

export type PlanHeaderProps = ComponentProps<typeof CardHeader>;

export const PlanHeader = ({ className, ...props }: PlanHeaderProps) => (
	<CardHeader
		className={cn("flex items-start justify-between", className)}
		data-slot="plan-header"
		{...props}
	/>
);

export type PlanTitleProps = Omit<
	ComponentProps<typeof CardTitle>,
	"children"
> & {
	children: string;
};

export const PlanTitle = ({ children, ...props }: PlanTitleProps) => {
	const { isStreaming } = usePlan();

	return (
		<CardTitle data-slot="plan-title" {...props}>
			{isStreaming ? <Shimmer>{children}</Shimmer> : children}
		</CardTitle>
	);
};

export type PlanDescriptionProps = Omit<
	ComponentProps<typeof CardDescription>,
	"children"
> & {
	children: string;
};

export const PlanDescription = ({
	className,
	children,
	...props
}: PlanDescriptionProps) => {
	const { isStreaming } = usePlan();

	return (
		<CardDescription
			className={cn("text-balance", className)}
			data-slot="plan-description"
			{...props}
		>
			{isStreaming ? <Shimmer>{children}</Shimmer> : children}
		</CardDescription>
	);
};

export type PlanActionProps = ComponentProps<typeof CardAction>;

export const PlanAction = (props: PlanActionProps) => (
	<CardAction data-slot="plan-action" {...props} />
);

export type PlanContentProps = ComponentProps<typeof CardContent>;

export const PlanContent = (props: PlanContentProps) => (
	<CollapsiblePanel
		render={<CardContent data-slot="plan-content" {...props} />}
	></CollapsiblePanel>
);

export type PlanFooterProps = ComponentProps<"div">;

export const PlanFooter = (props: PlanFooterProps) => (
	<CardFooter data-slot="plan-footer" {...props} />
);

export type PlanTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const PlanTrigger = ({
	className,
	nativeButton: _nativeButton,
	...props
}: PlanTriggerProps) => (
	<CollapsibleTrigger
		render={(props) => (
			<Button
				data-slot="plan-trigger"
				variant="ghost"
				// holy shit, we keep it like this because <CollapsibleTrigger> has "flex w-full" by default
				// and if we don't override the classes, it looks super weird and the button won't respect its size-8
				{...props}
				className="size-8"
			>
				<CaretUpDown className="size-4" />
				<span className="sr-only">Toggle plan</span>
			</Button>
		)}
		{...props}
	/>
);
