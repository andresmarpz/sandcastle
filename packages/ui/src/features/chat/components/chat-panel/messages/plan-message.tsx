"use client";

import { CheckIcon } from "@phosphor-icons/react/Check";
import { ClockIcon } from "@phosphor-icons/react/Clock";
import { WarningIcon } from "@phosphor-icons/react/Warning";
import { XIcon } from "@phosphor-icons/react/X";
import { useEffect, useState } from "react";
import { NativeMarkdownResponse } from "@/components/ai-elements/native-markdown";
import {
	Plan,
	PlanAction,
	PlanContent,
	PlanDescription,
	PlanHeader,
	PlanTitle,
	PlanTrigger,
} from "@/components/ai-elements/plan";
import { Badge } from "@/components/badge";
import { usePendingExitPlanApproval } from "@/features/chat/store";
import type { ToolCallPart } from "../../parts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the plan status from available state.
 *
 * Single source of truth approach:
 * 1. streaming - Still generating the plan
 * 2. error - Tool failed (timeout, etc.)
 * 3. output-available with explicit approved field - Use persisted approval status
 * 4. pending - Waiting for user approval (from pendingApprovalRequests)
 * 5. input-available but not pending - reconnection edge case, treat as pending
 */
function derivePlanStatus(
	part: ToolCallPart,
	isPendingApproval: boolean,
): PlanStatus {
	// 1. Check if streaming (still generating)
	if (part.state === "input-streaming") {
		return { status: "streaming" };
	}

	// 2. Check for errors (timeout, etc.)
	if (part.state === "output-error") {
		return {
			status: "error",
			errorText: part.errorText ?? "An unknown error occurred.",
		};
	}

	// 3. Output available - check the persisted approved field
	// This is the source of truth after page reload
	if (part.state === "output-available") {
		if (part.approved === true) {
			return { status: "approved" };
		}
		if (part.approved === false) {
			return { status: "rejected", feedback: part.feedback };
		}
	}

	// 4. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 5. input-available but not in pending = reconnection edge case, treat as pending
	// Also handles legacy data without explicit approved field
	return { status: "pending" };
}

/**
 * Get the description text for each plan status.
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
			if (planStatus.feedback) {
				return `Plan was not approved: ${planStatus.feedback}`;
			}
			return "Plan was not approved. You can send a new message to request changes.";
		case "error":
			return `Plan approval failed: ${planStatus.errorText}`;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

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

	// Derive plan status from state (single source of truth)
	const planStatus = derivePlanStatus(part, isPendingApproval);

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

	return (
		<div className="py-px">
			<Plan
				className="border border-border ring-0"
				isStreaming={planStatus.status === "streaming"}
				open={isOpen}
				onOpenChange={setIsOpen}
			>
				<PlanHeader className="flex-row items-start justify-between gap-4">
					<div>
						<PlanTitle>Implementation Plan</PlanTitle>
						<PlanDescription>
							{getStatusDescription(planStatus)}
						</PlanDescription>
					</div>
					<PlanAction className="flex items-center gap-2">
						<StatusBadge status={planStatus} />
						<PlanTrigger />
					</PlanAction>
				</PlanHeader>
				<PlanContent>
					<NativeMarkdownResponse className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
						{planContent}
					</NativeMarkdownResponse>
				</PlanContent>
			</Plan>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge
// ─────────────────────────────────────────────────────────────────────────────

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
				<Badge className="flex shrink-0 items-center gap-1 bg-muted text-muted-foreground">
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
