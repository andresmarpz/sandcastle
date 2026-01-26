"use client";

import { CaretUpDownIcon } from "@phosphor-icons/react/CaretUpDown";
import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { XIcon } from "@phosphor-icons/react/X";
import { useEffect, useState } from "react";
import { NativeMarkdownResponse } from "@/components/ai-elements/native-markdown";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Badge } from "@/components/badge";
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
import {
	useOptimisticPlanApproval,
	usePendingExitPlanApproval,
} from "@/features/chat/store";
import { cn } from "@/lib/utils";
import type { ToolCallPart } from "../../parts";

/**
 * Discriminated union representing all possible plan states.
 * This provides a single source of truth for plan status.
 */
type PlanStatus =
	| { status: "streaming" }
	| { status: "pending" }
	| { status: "approved" }
	| { status: "rejected"; feedback?: string }
	| { status: "error"; errorText: string };

/**
 * Derive the plan status from available state.
 *
 * Single source of truth approach:
 * 1. optimistic approval - Immediate feedback after user clicks approve/reject
 * 2. streaming - Still generating the plan
 * 3. error - Tool failed (timeout, etc.)
 * 4. output-available with explicit approved field - Use persisted approval status
 * 5. pending - Waiting for user approval (from pendingApprovalRequests)
 * 6. input-available but not pending - reconnection edge case, treat as pending
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
		return { status: "rejected", feedback: optimisticApproval.feedback };
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
	// This is the source of truth after page reload
	if (part.state === "output-available" && part.approval) {
		if (part.approval.approved === true) {
			return { status: "approved" };
		}
		if (part.approval.approved === false) {
			return { status: "rejected", feedback: part.approval.reason };
		}
	}

	// 5. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 6. input-available but not in pending = reconnection edge case, treat as pending
	// Also handles legacy data without explicit approved field
	return { status: "pending" };
}

/**
 * Get the description text for each plan status.
 * Note: Rejection feedback is displayed separately in FeedbackSection.
 */
function getStatusDescription(planStatus: PlanStatus): string {
	switch (planStatus.status) {
		case "streaming":
			return "Planning in progress...";
		case "pending":
			return "Review the plan below and approve to proceed with implementation.";
		case "approved":
			return "Plan has been approved and implementation has started.";
		case "rejected":
			return "Plan was not approved.";
		case "error":
			return `Plan approval failed: ${planStatus.errorText}`;
	}
}

interface PlanMessageProps {
	part: ToolCallPart;
	sessionId: string;
}

/**
 * Display-only component for ExitPlanMode tool.
 * Shows plan content with status badge.
 * Approval buttons are handled by ChatPanelInput.
 */
export function PlanMessage({ part, sessionId }: PlanMessageProps) {
	const pendingApproval = usePendingExitPlanApproval(sessionId);
	const isPendingApproval = pendingApproval?.toolCallId === part.toolCallId;
	const optimisticApproval = useOptimisticPlanApproval(
		sessionId,
		part.toolCallId,
	);

	// Derive plan status from state (single source of truth)
	const planStatus = derivePlanStatus(
		part,
		isPendingApproval,
		optimisticApproval,
	);

	const isStreaming = planStatus.status === "streaming";

	// Extract plan content from input
	const input = part.input as { plan?: string } | undefined;
	const planContent = input?.plan ?? "";

	// Controlled state for collapsible - start open when pending/streaming
	const shouldBeOpen =
		planStatus.status === "pending" || planStatus.status === "streaming";
	const [isOpen, setIsOpen] = useState(shouldBeOpen);

	// Sync open state when status changes (e.g., auto-collapse when approved)
	useEffect(() => {
		setIsOpen(shouldBeOpen);
	}, [shouldBeOpen]);

	const hasFeedback = planStatus.status === "rejected" && planStatus.feedback;

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<Card
				className={cn(
					"border border-border shadow-none ring-0 py-0",
					// Remove gap when there's a feedback footer to avoid extra space
					hasFeedback && "gap-0",
				)}
			>
				<CardHeader className="flex-row items-start justify-between gap-4 py-4">
					<div>
						<CardTitle>
							{isStreaming ? (
								<Shimmer>Implementation Plan</Shimmer>
							) : (
								"Implementation Plan"
							)}
						</CardTitle>
						<CardDescription className="text-balance">
							{isStreaming ? (
								<Shimmer>{getStatusDescription(planStatus)}</Shimmer>
							) : (
								getStatusDescription(planStatus)
							)}
						</CardDescription>
					</div>
					<CardAction className="flex items-center gap-2">
						<StatusBadge status={planStatus} />
						<CollapsibleTrigger
							render={(props) => (
								<Button variant="ghost" {...props} className="size-8">
									<CaretUpDownIcon className="size-4" />
									<span className="sr-only">Toggle plan</span>
								</Button>
							)}
						/>
					</CardAction>
				</CardHeader>
				<CollapsiblePanel>
					<CardContent className="pb-4">
						<NativeMarkdownResponse className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
							{planContent}
						</NativeMarkdownResponse>
					</CardContent>
					{hasFeedback && (
						<CardFooter className="border-t border-border bg-muted/50 p-4">
							<div>
								<div className="mb-1 text-xs font-medium text-muted-foreground">
									Requested Changes
								</div>
								<div className="text-sm text-foreground">
									{planStatus.feedback}
								</div>
							</div>
						</CardFooter>
					)}
				</CollapsiblePanel>
			</Card>
		</Collapsible>
	);
}

/**
 * Renders the appropriate badge based on plan status.
 */
function StatusBadge({ status }: { status: PlanStatus }) {
	switch (status.status) {
		case "approved":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400">
					<CheckIcon className="size-3" />
					Approved
				</Badge>
			);
		case "rejected":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-red-400/10 text-red-500/70">
					<XIcon className="size-3" />
					Not approved
				</Badge>
			);
		case "error":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
					<WarningIcon className="size-3" />
					Failed
				</Badge>
			);
		case "pending":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-muted text-muted-foreground">
					<ClockIcon className="size-3" />
					Pending
				</Badge>
			);
		case "streaming":
			// No badge for streaming state
			return null;
	}
}
