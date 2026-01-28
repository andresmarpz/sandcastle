"use client";

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react/ArrowCounterClockwise";
import { CaretDownIcon } from "@phosphor-icons/react/CaretDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { HourglassIcon } from "@phosphor-icons/react/Hourglass";
import { ListChecksIcon } from "@phosphor-icons/react/ListChecks";
import { SpinnerIcon } from "@phosphor-icons/react/Spinner";
import { XIcon } from "@phosphor-icons/react/X";
import type { ToolCallPart } from "@sandcastle/schemas";
import { useEffect, useState } from "react";
import { NativeMarkdownResponse } from "@/components/ai-elements/native-markdown";
import {
	Collapsible,
	CollapsiblePanel,
	CollapsibleTrigger,
} from "@/components/collapsible";
import {
	useOptimisticPlanApproval,
	usePendingExitPlanApproval,
} from "@/features/chat/store";
import { cn } from "@/lib/utils";

/**
 * Discriminated union representing all possible plan states.
 * - streaming: Plan is being generated
 * - pending: Waiting for user approval
 * - approved: User approved the plan
 * - changes-requested: User rejected with feedback (wants revisions)
 * - denied: User rejected without feedback (doesn't want this approach)
 * - error: Something went wrong
 */
type PlanStatus =
	| { status: "streaming" }
	| { status: "pending" }
	| { status: "approved" }
	| { status: "changes-requested"; feedback: string }
	| { status: "denied" }
	| { status: "error"; errorText: string };

/**
 * Derive the plan status from available state.
 */
function derivePlanStatus(
	part: ToolCallPart,
	isPendingApproval: boolean,
	optimisticApproval: { approved: boolean; feedback?: string } | null,
): PlanStatus {
	// 1. Check optimistic approval first (immediate feedback)
	if (optimisticApproval) {
		if (optimisticApproval.approved) {
			return { status: "approved" };
		}
		// Differentiate between changes requested and denied
		if (optimisticApproval.feedback) {
			return {
				status: "changes-requested",
				feedback: optimisticApproval.feedback,
			};
		}
		return { status: "denied" };
	}

	// 2. Check if streaming (still generating)
	if (part.state === "input-streaming") {
		return { status: "streaming" };
	}

	// 3. Check for errors (timeout, etc.)
	if (part.state === "output-error") {
		return {
			status: "error",
			errorText: part.errorText ?? "An unknown error occurred.",
		};
	}

	// 4. Output available - check the persisted approval field
	if (part.state === "output-available" && part.approval) {
		if (part.approval.approved === true) {
			return { status: "approved" };
		}
		if (part.approval.approved === false) {
			if (part.approval.reason) {
				return { status: "changes-requested", feedback: part.approval.reason };
			}
			return { status: "denied" };
		}
	}

	// 5. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 6. Fallback to pending
	return { status: "pending" };
}

interface PlanMessageProps {
	part: ToolCallPart;
	sessionId: string;
}

/**
 * Display-only component for ExitPlanMode tool.
 * Shows plan content with status. Approval buttons are handled by ChatPanelInput.
 */
export function PlanMessage({ part, sessionId }: PlanMessageProps) {
	const pendingApproval = usePendingExitPlanApproval(sessionId);
	const isPendingApproval = pendingApproval?.toolCallId === part.toolCallId;
	const optimisticApproval = useOptimisticPlanApproval(
		sessionId,
		part.toolCallId,
	);

	const planStatus = derivePlanStatus(
		part,
		isPendingApproval,
		optimisticApproval,
	);

	// Extract plan content from input
	const input = part.input as { plan?: string } | undefined;
	const planContent = input?.plan ?? "";

	// Controlled state for collapsible - start open when pending/streaming
	const shouldBeOpen =
		planStatus.status === "pending" || planStatus.status === "streaming";
	const [isOpen, setIsOpen] = useState(shouldBeOpen);

	useEffect(() => {
		setIsOpen(shouldBeOpen);
	}, [shouldBeOpen]);

	const hasChangesRequested = planStatus.status === "changes-requested";

	return (
		<div className="w-full rounded-md border border-border bg-background overflow-hidden">
			{/* Collapsible section: trigger + plan content */}
			<Collapsible open={isOpen} onOpenChange={setIsOpen}>
				<CollapsibleTrigger
					className={cn(
						"flex items-center gap-3 px-4 py-3 w-full",
						"text-sm",
						"hover:bg-muted/50 transition-colors",
					)}
				>
					<ListChecksIcon className="size-5 shrink-0 text-muted-foreground" />
					<span className="font-medium text-foreground">
						Implementation Plan
					</span>
					<div className="ml-auto flex items-center gap-3">
						<StatusLabel status={planStatus} />
						<div className="size-4 shrink-0 transition-transform text-muted-foreground group-data-[state=open]:rotate-180">
							<CaretDownIcon className="size-4" />
						</div>
					</div>
				</CollapsibleTrigger>

				<CollapsiblePanel className="border-t border-border">
					<div className="px-4 py-4 bg-muted/30">
						<NativeMarkdownResponse className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
							{planContent}
						</NativeMarkdownResponse>
					</div>
				</CollapsiblePanel>
			</Collapsible>

			{/* Feedback section - always visible when changes requested */}
			{hasChangesRequested && (
				<div className="border-t border-border px-4 py-3">
					<div className="text-xs font-medium text-muted-foreground mb-1">
						Changes requested
					</div>
					<div className="text-sm text-foreground/80">
						{planStatus.feedback}
					</div>
				</div>
			)}
		</div>
	);
}

/** Base styles for status badges */
const badgeBase =
	"inline-flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs font-medium";

/**
 * Renders the status badge with appropriate icon, color, and background.
 */
function StatusLabel({ status }: { status: PlanStatus }) {
	switch (status.status) {
		case "streaming":
			return (
				<span
					className={`${badgeBase} bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300`}
				>
					<SpinnerIcon className="size-3 animate-spin" />
					Planning...
				</span>
			);
		case "pending":
			return (
				<span
					className={`${badgeBase} bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300`}
				>
					<HourglassIcon className="size-3" />
					Pending
				</span>
			);
		case "approved":
			return (
				<span
					className={`${badgeBase} bg-green-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300`}
				>
					<CheckIcon className="size-3" />
					Approved
				</span>
			);
		case "changes-requested":
			return (
				<span
					className={`${badgeBase} bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300`}
				>
					<ArrowCounterClockwiseIcon className="size-3" />
					Changes requested
				</span>
			);
		case "denied":
			return (
				<span
					className={`${badgeBase} bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300`}
				>
					<XIcon className="size-3" />
					Denied
				</span>
			);
		case "error":
			return (
				<span
					className={`${badgeBase} bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-300`}
				>
					<XIcon className="size-3" />
					Failed
				</span>
			);
	}
}
