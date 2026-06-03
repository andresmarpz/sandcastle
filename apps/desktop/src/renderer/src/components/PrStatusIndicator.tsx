import {
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CheckIcon,
	CircleNotchIcon,
	ClockIcon,
	GitBranchIcon,
	GitMergeIcon,
	GitPullRequestIcon,
	XIcon,
} from "@phosphor-icons/react";

import { Popover, PopoverContent, PopoverHeader, PopoverTrigger } from "@/components/ui/popover";
import type { PrStatus } from "@/hooks/usePrStatus";
import { cn } from "@/lib/utils";

const STATE_META: Record<PrStatus["state"], { label: string; dot: string; text: string }> = {
	open: { label: "Open", dot: "bg-green-600", text: "text-green-600" },
	draft: { label: "Draft", dot: "bg-muted-foreground", text: "text-muted-foreground" },
	merged: { label: "Merged", dot: "bg-purple-500", text: "text-purple-500" },
	closed: { label: "Closed", dot: "bg-destructive", text: "text-destructive" },
};

const CI_META: Record<PrStatus["ci"], { label: string; text: string } | null> = {
	passing: { label: "Checks passing", text: "text-green-600" },
	failing: { label: "Checks failing", text: "text-destructive" },
	pending: { label: "Checks running", text: "text-amber-500" },
	none: null,
};

const REVIEW_LABEL: Record<NonNullable<PrStatus["reviewDecision"]>, string> = {
	APPROVED: "Approved",
	CHANGES_REQUESTED: "Changes requested",
	REVIEW_REQUIRED: "Review required",
};

function relativeTime(iso: string): string {
	if (!iso) return "";
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.round(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.round(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.round(months / 12)}y ago`;
}

/** The git icon + CI overlay badge, colored by PR state. */
function PrGlyph({
	status,
	className,
}: {
	status: PrStatus;
	className?: string;
}): React.JSX.Element {
	const iconClass = cn("size-3.5", className);

	if (status.state === "merged") {
		return <GitMergeIcon weight="bold" className={cn(iconClass, "text-purple-500")} />;
	}
	if (status.state === "draft") {
		return <GitPullRequestIcon weight="bold" className={cn(iconClass, "text-muted-foreground")} />;
	}
	if (status.state === "closed") {
		return <GitPullRequestIcon weight="bold" className={cn(iconClass, "text-destructive/70")} />;
	}

	// Open: green PR icon, with a CI verdict badge tucked into the corner.
	const failing = status.ci === "failing";
	return (
		<span className="relative inline-flex size-3.5">
			<GitPullRequestIcon
				weight="bold"
				className={cn(iconClass, failing ? "text-destructive" : "text-green-600")}
			/>
			{failing ? (
				<Badge>
					<XIcon weight="bold" className="size-2 text-destructive" />
				</Badge>
			) : status.ci === "passing" ? (
				<Badge>
					<CheckIcon weight="bold" className="size-2 text-green-600" />
				</Badge>
			) : status.ci === "pending" ? (
				<Badge>
					<CircleNotchIcon weight="bold" className="size-2 animate-spin text-amber-500" />
				</Badge>
			) : null}
		</span>
	);
}

function Badge({ children }: { children: React.ReactNode }): React.JSX.Element {
	// Anchored flush in the bottom-right so the whole glyph stays within the
	// 14×14 box; a surfaced halo keeps the verdict legible over the PR icon.
	return (
		<span className="absolute right-0 bottom-0 grid place-items-center rounded-full bg-sidebar ring-1 ring-sidebar">
			{children}
		</span>
	);
}

function Row({
	icon,
	children,
	className,
}: {
	icon: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}): React.JSX.Element {
	return (
		<div className={cn("flex items-center gap-1.5 text-foreground-tertiary", className)}>
			<span className="grid size-3.5 shrink-0 place-items-center">{icon}</span>
			<span className="min-w-0 truncate">{children}</span>
		</div>
	);
}

/**
 * The per-workspace PR badge: a state-colored git icon on the sidebar row that
 * reveals a details popover on hover or click. Only rendered when a PR exists.
 */
function PrStatusIndicator({ status }: { status: PrStatus }): React.JSX.Element {
	const stateMeta = STATE_META[status.state];
	const ciMeta = CI_META[status.ci];

	return (
		<Popover>
			<PopoverTrigger
				openOnHover
				delay={250}
				closeDelay={120}
				aria-label={`PR #${status.number} — ${stateMeta.label}`}
				className={cn(
					"inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-none text-foreground-tertiary",
					"transition-colors hover:bg-sidebar-accent/60 hover:text-foreground focus-visible:outline-none data-popup-open:text-foreground",
				)}
			>
				<PrGlyph status={status} />
				<span className="tabular-nums">#{status.number}</span>
			</PopoverTrigger>
			<PopoverContent side="right" align="start" sideOffset={8} className="w-72">
				<PopoverHeader>
					<div className="flex items-center gap-1.5">
						<span
							className={cn(
								"inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium",
								stateMeta.text,
							)}
						>
							<span className={cn("size-1.5 rounded-full", stateMeta.dot)} />
							{stateMeta.label}
						</span>
						<span className="text-foreground-tertiary tabular-nums">#{status.number}</span>
					</div>
					<a
						href={status.url}
						target="_blank"
						rel="noopener noreferrer"
						title={status.title}
						className="truncate font-medium text-foreground hover:underline"
					>
						{status.title}
					</a>
				</PopoverHeader>

				<div className="flex flex-col gap-1.5">
					<Row icon={<GitBranchIcon className="size-3 text-foreground-tertiary" />}>
						<span className="text-foreground/80">{status.baseRefName}</span>
						<span className="px-1 text-foreground-tertiary">←</span>
						<span className="text-foreground/80">{status.headRefName}</span>
					</Row>

					{ciMeta ? (
						<Row
							icon={
								status.ci === "failing" ? (
									<XIcon weight="bold" className={cn("size-3", ciMeta.text)} />
								) : status.ci === "passing" ? (
									<CheckIcon weight="bold" className={cn("size-3", ciMeta.text)} />
								) : (
									<CircleNotchIcon
										weight="bold"
										className={cn("size-3 animate-spin", ciMeta.text)}
									/>
								)
							}
						>
							<span className={ciMeta.text}>{ciMeta.label}</span>
							<span className="text-foreground-tertiary">
								{" · "}
								{status.checks.passed}/{status.checks.total} passed
								{status.checks.failed > 0 ? `, ${status.checks.failed} failed` : ""}
							</span>
						</Row>
					) : null}

					{status.reviewDecision ? (
						<Row
							icon={
								<CheckCircleIcon
									className={cn(
										"size-3",
										status.reviewDecision === "APPROVED"
											? "text-green-600"
											: status.reviewDecision === "CHANGES_REQUESTED"
												? "text-destructive"
												: "text-foreground-tertiary",
									)}
								/>
							}
						>
							{REVIEW_LABEL[status.reviewDecision]}
						</Row>
					) : null}

					<Row icon={<ClockIcon className="size-3 text-foreground-tertiary" />}>
						<span className="font-mono text-green-600">+{status.additions}</span>{" "}
						<span className="font-mono text-destructive">−{status.deletions}</span>
						{status.author ? (
							<span className="text-foreground-tertiary">
								{" · "}
								{status.author}
							</span>
						) : null}
						{status.updatedAt ? (
							<span className="text-foreground-tertiary">
								{" · "}
								{relativeTime(status.updatedAt)}
							</span>
						) : null}
					</Row>
				</div>

				<a
					href={status.url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-center gap-1.5 rounded-md bg-muted/50 py-1 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
				>
					<ArrowSquareOutIcon className="size-3" />
					Open on GitHub
				</a>
			</PopoverContent>
		</Popover>
	);
}

export default PrStatusIndicator;
