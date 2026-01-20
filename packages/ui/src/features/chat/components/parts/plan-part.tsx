"use client";

import {
	IconAlertTriangle,
	IconCheck,
	IconClock,
	IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
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
import {
	useIsApprovedPlan,
	usePendingExitPlanApproval,
} from "@/features/chat/store";
import type { ToolCallPart } from "./index";

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
	| { status: "rejected" }
	| { status: "error"; errorText: string };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the plan status from available state.
 *
 * State machine priority:
 * 1. streaming - Still generating the plan
 * 2. error - Tool failed (timeout, etc.)
 * 3. approved - User approved the plan
 * 4. pending - Waiting for user approval
 * 5. rejected - User rejected or tool completed without approval
 */
function derivePlanStatus(
	part: ToolCallPart,
	isPendingApproval: boolean,
	isApproved: boolean,
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

	// 3. Check if approved (user clicked approve)
	if (isApproved) {
		return { status: "approved" };
	}

	// 4. Check if pending (waiting for user response)
	if (isPendingApproval) {
		return { status: "pending" };
	}

	// 5. Output available but not approved = rejected
	// This handles explicit rejection and edge cases
	return { status: "rejected" };
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
			return "Plan was not approved. You can send a new message to request changes.";
		case "error":
			return `Plan approval failed: ${planStatus.errorText}`;
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface PlanPartProps {
	part: ToolCallPart;
	sessionId: string;
}

export function PlanPart({ part, sessionId }: PlanPartProps) {
	const isApproved = useIsApprovedPlan(sessionId, part.toolCallId);
	const pendingApproval = usePendingExitPlanApproval(sessionId);
	const isPendingApproval = pendingApproval?.toolCallId === part.toolCallId;

	// Derive plan status from state
	const planStatus = derivePlanStatus(part, isPendingApproval, isApproved);

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
					<Streamdown className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
						{planContent}
					</Streamdown>
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
					<IconCheck className="size-3" />
					Approved
				</Badge>
			);
		case "rejected":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-muted text-muted-foreground">
					<IconX className="size-3" />
					Not approved
				</Badge>
			);
		case "error":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400">
					<IconAlertTriangle className="size-3" />
					Failed
				</Badge>
			);
		// No badge for streaming or pending states
		case "pending":
			return (
				<Badge className="flex shrink-0 items-center gap-1 bg-muted text-muted-foreground">
					<IconClock className="size-3" />
					Pending
				</Badge>
			);
		default:
			return null;
	}
}
