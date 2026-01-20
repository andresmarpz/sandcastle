"use client";

import { IconSelector } from "@tabler/icons-react";
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

type QuestionsContextValue = {
	isStreaming: boolean;
};

const QuestionsContext = createContext<QuestionsContextValue | null>(null);

const useQuestions = () => {
	const context = useContext(QuestionsContext);
	if (!context) {
		throw new Error("Questions components must be used within Questions");
	}
	return context;
};

export type QuestionsProps = ComponentProps<typeof Collapsible> & {
	isStreaming?: boolean;
};

export const Questions = ({
	className,
	isStreaming = false,
	children,
	...props
}: QuestionsProps) => (
	<QuestionsContext.Provider value={{ isStreaming }}>
		<Collapsible
			data-slot="questions"
			{...props}
			render={<Card className={cn("shadow-none", className)} />}
		>
			{children}
		</Collapsible>
	</QuestionsContext.Provider>
);

export type QuestionsHeaderProps = ComponentProps<typeof CardHeader>;

export const QuestionsHeader = ({
	className,
	...props
}: QuestionsHeaderProps) => (
	<CardHeader
		className={cn("flex items-start justify-between", className)}
		data-slot="questions-header"
		{...props}
	/>
);

export type QuestionsTitleProps = Omit<
	ComponentProps<typeof CardTitle>,
	"children"
> & {
	children: string;
};

export const QuestionsTitle = ({ children, ...props }: QuestionsTitleProps) => {
	const { isStreaming } = useQuestions();

	return (
		<CardTitle data-slot="questions-title" {...props}>
			{isStreaming ? <Shimmer>{children}</Shimmer> : children}
		</CardTitle>
	);
};

export type QuestionsDescriptionProps = Omit<
	ComponentProps<typeof CardDescription>,
	"children"
> & {
	children: string;
};

export const QuestionsDescription = ({
	className,
	children,
	...props
}: QuestionsDescriptionProps) => {
	const { isStreaming } = useQuestions();

	return (
		<CardDescription
			className={cn("text-balance", className)}
			data-slot="questions-description"
			{...props}
		>
			{isStreaming ? <Shimmer>{children}</Shimmer> : children}
		</CardDescription>
	);
};

export type QuestionsActionProps = ComponentProps<typeof CardAction>;

export const QuestionsAction = (props: QuestionsActionProps) => (
	<CardAction data-slot="questions-action" {...props} />
);

export type QuestionsContentProps = ComponentProps<typeof CardContent>;

export const QuestionsContent = (props: QuestionsContentProps) => (
	<CollapsiblePanel
		render={<CardContent data-slot="questions-content" {...props} />}
	/>
);

export type QuestionsFooterProps = ComponentProps<typeof CardFooter>;

export const QuestionsFooter = ({
	className,
	...props
}: QuestionsFooterProps) => (
	<CollapsiblePanel
		render={
			<CardFooter
				data-slot="questions-footer"
				className={cn("justify-end gap-2", className)}
				{...props}
			/>
		}
	/>
);

export type QuestionsTriggerProps = ComponentProps<typeof CollapsibleTrigger>;

export const QuestionsTrigger = ({
	className,
	nativeButton: _nativeButton,
	...props
}: QuestionsTriggerProps) => (
	<CollapsibleTrigger
		render={(props) => (
			<Button
				data-slot="questions-trigger"
				variant="ghost"
				{...props}
				className="size-8"
			>
				<IconSelector className="size-4" />
				<span className="sr-only">Toggle questions</span>
			</Button>
		)}
		{...props}
	/>
);
