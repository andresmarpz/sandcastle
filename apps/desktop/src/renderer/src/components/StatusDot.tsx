import { ClockIcon } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import type { WorkspaceStatus } from "@/stores/activity";

const DOT_COLOR: Record<Exclude<WorkspaceStatus, "idle" | "cron">, string> = {
	working: "bg-amber-500",
	done: "bg-emerald-500",
	"needs-attention": "bg-destructive",
};

// Live states pulse; "done" is a steady green (ready for review, not urgent).
const PULSE: ReadonlySet<WorkspaceStatus> = new Set(["working", "needs-attention"]);

/**
 * The per-workspace activity indicator. Idle renders the original faint dash so
 * an inactive workspace looks exactly as it did before; "cron" renders a pulsing
 * clock (a /loop cron is live in the workspace) that outranks every other
 * status; any other status renders a colored dot (pulsing for live states).
 */
function StatusDot({ status }: { status: WorkspaceStatus }): React.JSX.Element {
	if (status === "idle") {
		return <span className="h-px w-full bg-muted-foreground" />;
	}
	if (status === "cron") {
		return <ClockIcon weight="fill" className="size-3 shrink-0 animate-pulse text-sky-500" />;
	}
	return (
		<span
			className={cn("size-2 rounded-full", DOT_COLOR[status], PULSE.has(status) && "animate-pulse")}
		/>
	);
}

export default StatusDot;
