import type { SessionStatus } from "@sandcastle/schemas";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatSessionSelector } from "@/features/chat/store";
import { cn } from "@/lib/utils";

/**
 * Visual status states for the session indicator
 *
 * States (in order of priority):
 * - streaming: Claude is actively generating (blue, animated)
 * - waiting_input: Claude asked a question, waiting for user response (amber, animated)
 * - needs_attention: Claude finished, has new content to review (green with ring)
 * - ready: Session is connected and ready (green)
 * - idle: Session is not currently being viewed (gray)
 * - failed: Session encountered an error (red)
 */
type IndicatorStatus =
	| "streaming"
	| "waiting_input"
	| "needs_attention"
	| "ready"
	| "idle"
	| "failed";

interface Props {
	sessionId: string;
	status: SessionStatus;
}

export function useSessionStatusIndicator({ sessionId, status }: Props) {
	const [subscribed, chatStatus, hasPendingApprovals, hasUnreadContent] =
		useChatSessionSelector(
			sessionId,
			useShallow((state) => [
				state.isConnected,
				state.status,
				state.pendingApprovalRequests.size > 0,
				state.hasUnreadContent,
			]),
		);

	const indicatorStatus = useMemo((): IndicatorStatus => {
		if (status === "failed") {
			return "failed";
		}

		// If connected to the chat store, use live state
		if (subscribed) {
			if (hasPendingApprovals) {
				return "waiting_input";
			}
			if (chatStatus === "streaming") {
				return "streaming";
			}
			if (hasUnreadContent) {
				return "needs_attention";
			}

			return "ready";
		}

		switch (status) {
			case "active":
				return "needs_attention";
			case "paused":
				return "waiting_input";
			default:
				return "idle";
		}
	}, [status, chatStatus, subscribed, hasPendingApprovals, hasUnreadContent]);

	return indicatorStatus;
}

export const statusConfig: Record<
	IndicatorStatus,
	{
		color: string;
		label: string;
		animate?: boolean;
		ring?: boolean;
		ripple?: boolean;
	}
> = {
	streaming: {
		color: "bg-blue-500",
		label: "Claude is responding",
		animate: true,
		ripple: true,
	},
	waiting_input: {
		color: "bg-amber-500",
		label: "Waiting for your response",
		animate: true,
		ripple: true,
	},
	needs_attention: {
		color: "bg-green-500",
		label: "New activity",
		ring: true,
	},
	ready: {
		color: "bg-green-500",
		label: "Subscribed",
	},
	idle: {
		color: "bg-muted-foreground",
		label: "Idle",
	},
	failed: {
		color: "bg-red-500",
		label: "Failed",
	},
};

export function SessionStatusDot({
	status,
	className,
}: {
	status: IndicatorStatus;
	className?: string;
}) {
	const config = statusConfig[status];
	const isStreaming = status === "streaming";
	const isIdle = status === "idle";

	// Idle state shows a dash instead of a dot
	if (isIdle) {
		return (
			<span
				role="img"
				className={cn("relative shrink-0 size-2 flex items-center", className)}
				title={config.label}
				aria-label={config.label}
			>
				<span className="w-full h-px bg-muted-foreground" />
			</span>
		);
	}

	return (
		<span
			role="img"
			className={cn("relative shrink-0 size-2", className)}
			title={config.label}
			aria-label={config.label}
		>
			{/* Pulsing wave rings for streaming state */}
			{config.ripple && (
				<span
					className={`absolute -inset-px rounded-full ${config.color} opacity-30 animate-ping`}
					style={{
						animationDelay: "1.5s",
					}}
				/>
			)}
			{/* Core dot */}
			<span
				className={cn(
					"absolute inset-0 rounded-full",
					config.color,
					config.animate && !isStreaming && "animate-pulse",
					config.ring && "ring-3 ring-green-500/30",
				)}
			/>
		</span>
	);
}
