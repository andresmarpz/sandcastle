"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import type { Session, Worktree } from "@sandcastle/rpc";
import {
	IconBrandGit,
	IconChevronRight,
	IconClock,
	IconGitBranch,
	IconMessage,
	IconSparkles,
} from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import * as React from "react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { repositoryAtomFamily } from "@/api/repository-atoms";
import { sessionListAtom } from "@/api/session-atoms";
import { worktreeAtomFamily, worktreeListAtom } from "@/api/worktree-atoms";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { useSidebar } from "@/components/sidebar";
import { Skeleton } from "@/components/skeleton";
import { cn } from "@/lib/utils";

function formatRelativeTime(iso: string) {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) {
		return "unknown";
	}
	return formatDistanceToNow(timestamp, { addSuffix: true });
}

function formatTokens(count: number): string {
	if (count >= 1_000_000) {
		return `${(count / 1_000_000).toFixed(1)}M`;
	}
	if (count >= 1_000) {
		return `${(count / 1_000).toFixed(1)}K`;
	}
	return count.toString();
}

function formatCost(usd: number): string {
	if (usd === 0) return "$0.00";
	if (usd < 0.01) return "<$0.01";
	return `$${usd.toFixed(2)}`;
}

function SessionCardSkeleton() {
	return (
		<div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card">
			<div className="flex items-center justify-between">
				<Skeleton className="h-4 w-32" />
				<Skeleton className="h-4 w-16" />
			</div>
			<Skeleton className="h-3 w-24" />
			<div className="flex gap-3 mt-1">
				<Skeleton className="h-5 w-16" />
				<Skeleton className="h-5 w-20" />
			</div>
		</div>
	);
}

function SessionCard({
	session,
	worktree,
	repositoryLabel,
	onClick,
}: {
	session: Session;
	worktree?: Worktree;
	repositoryLabel?: string;
	onClick: () => void;
}) {
	const totalTokens = session.inputTokens + session.outputTokens;
	const lastActivity = formatRelativeTime(session.lastActivityAt);

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col gap-2 p-3 rounded-lg border border-border bg-card text-left transition-all",
				"hover:border-border/80 hover:bg-muted/30 group",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-sm truncate flex-1">
					{session.title || "Untitled Session"}
				</span>
				<IconChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
			</div>

			{worktree && (
				<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<IconGitBranch className="size-3 shrink-0" />
					<span className="truncate">{worktree.branch}</span>
					{repositoryLabel && (
						<>
							<span className="shrink-0">in</span>
							<span className="truncate font-medium">{repositoryLabel}</span>
						</>
					)}
				</div>
			)}

			<div className="flex items-center gap-3 flex-wrap">
				{totalTokens > 0 && (
					<Badge variant="secondary" className="text-xs">
						<IconSparkles className="size-3" data-icon="inline-start" />
						{formatTokens(totalTokens)} tokens
					</Badge>
				)}
				{session.totalCostUsd > 0 && (
					<Badge variant="secondary" className="text-xs">
						{formatCost(session.totalCostUsd)}
					</Badge>
				)}
				<span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
					<IconClock className="size-3" />
					{lastActivity}
				</span>
			</div>
		</button>
	);
}

function WorktreeCardSkeleton() {
	return (
		<div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card">
			<div className="flex items-center gap-2">
				<Skeleton className="size-4 rounded" />
				<Skeleton className="h-4 w-24" />
			</div>
			<Skeleton className="h-3 w-32" />
		</div>
	);
}

function WorktreeCard({
	worktree,
	repositoryLabel,
	sessionCount,
	onClick,
}: {
	worktree: Worktree;
	repositoryLabel?: string;
	sessionCount: number;
	onClick: () => void;
}) {
	const lastAccessed = formatRelativeTime(worktree.lastAccessedAt);

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col gap-1.5 p-3 rounded-lg border border-border bg-card text-left transition-all",
				"hover:border-border/80 hover:bg-muted/30 group",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<IconGitBranch className="size-4 text-muted-foreground shrink-0" />
					<span className="font-medium text-sm truncate">
						{worktree.branch}
					</span>
				</div>
				<IconChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
			</div>

			<div className="flex items-center gap-2 text-xs text-muted-foreground">
				{repositoryLabel && <span className="truncate">{repositoryLabel}</span>}
				{repositoryLabel && sessionCount > 0 && <span>·</span>}
				{sessionCount > 0 && (
					<span className="shrink-0">
						{sessionCount} {sessionCount === 1 ? "session" : "sessions"}
					</span>
				)}
			</div>

			<span className="text-xs text-muted-foreground flex items-center gap-1">
				<IconClock className="size-3" />
				{lastAccessed}
			</span>
		</button>
	);
}

function WorktreeWithRepository({
	worktree,
	sessionCount,
	onClick,
}: {
	worktree: Worktree;
	sessionCount: number;
	onClick: () => void;
}) {
	const repositoryAtom = useMemo(
		() => repositoryAtomFamily(worktree.repositoryId),
		[worktree.repositoryId],
	);
	const repositoryResult = useAtomValue(repositoryAtom);

	const repositoryLabel = Result.matchWithWaiting(repositoryResult, {
		onWaiting: (result) => Option.getOrNull(Result.value(result))?.label,
		onError: () => undefined,
		onDefect: () => undefined,
		onSuccess: (success) => success.value.label,
	});

	return (
		<WorktreeCard
			worktree={worktree}
			repositoryLabel={repositoryLabel}
			sessionCount={sessionCount}
			onClick={onClick}
		/>
	);
}

function SessionRepositoryLabel({
	repositoryId,
	onLabel,
}: {
	repositoryId: string;
	onLabel: (label: string | undefined) => void;
}) {
	const repositoryAtom = useMemo(
		() => repositoryAtomFamily(repositoryId),
		[repositoryId],
	);
	const repositoryResult = useAtomValue(repositoryAtom);

	const label = Result.matchWithWaiting(repositoryResult, {
		onWaiting: (result) => Option.getOrNull(Result.value(result))?.label,
		onError: () => undefined,
		onDefect: () => undefined,
		onSuccess: (success) => success.value.label,
	});

	// Use effect to avoid calling during render
	useMemo(() => {
		onLabel(label);
	}, [label, onLabel]);

	return null;
}

function SessionWithWorktreeCard({
	session,
	onClick,
}: {
	session: Session;
	onClick: () => void;
}) {
	const worktreeAtom = useMemo(
		() => worktreeAtomFamily(session.worktreeId),
		[session.worktreeId],
	);
	const worktreeResult = useAtomValue(worktreeAtom);
	const [repositoryLabel, setRepositoryLabel] = React.useState<
		string | undefined
	>();

	const worktree = Result.matchWithWaiting(worktreeResult, {
		onWaiting: (result) => Option.getOrNull(Result.value(result)),
		onError: () => undefined,
		onDefect: () => undefined,
		onSuccess: (success) => success.value,
	});

	const handleRepositoryLabel = React.useCallback(
		(label: string | undefined) => {
			setRepositoryLabel(label);
		},
		[],
	);

	return (
		<>
			{worktree && (
				<SessionRepositoryLabel
					repositoryId={worktree.repositoryId}
					onLabel={handleRepositoryLabel}
				/>
			)}
			<SessionCard
				session={session}
				worktree={worktree ?? undefined}
				repositoryLabel={repositoryLabel}
				onClick={onClick}
			/>
		</>
	);
}

function EmptyDashboard() {
	const { setOpenMobile } = useSidebar();

	return (
		<div className="flex flex-col items-center justify-center gap-4 text-center px-4">
			<div className="flex size-12 items-center justify-center rounded-full bg-muted">
				<IconBrandGit className="size-6 text-muted-foreground" />
			</div>
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-medium">No worktrees yet</h2>
				<p className="text-sm text-muted-foreground max-w-xs">
					Create a worktree from a repository to start working with AI-assisted
					development.
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={() => setOpenMobile(true)}
				className="mt-2"
			>
				Open sidebar
			</Button>
		</div>
	);
}

export function WorktreesDashboard() {
	const navigate = useNavigate();
	const { setOpenMobile } = useSidebar();

	const worktreesResult = useAtomValue(worktreeListAtom);
	const sessionsResult = useAtomValue(sessionListAtom);

	// Get worktrees data
	const worktrees = Result.matchWithWaiting(worktreesResult, {
		onWaiting: (result) => Option.getOrNull(Result.value(result)) ?? [],
		onError: () => [],
		onDefect: () => [],
		onSuccess: (success) => success.value,
	});

	// Get sessions data
	const sessions = Result.matchWithWaiting(sessionsResult, {
		onWaiting: (result) => Option.getOrNull(Result.value(result)) ?? [],
		onError: () => [],
		onDefect: () => [],
		onSuccess: (success) => success.value,
	});

	const isLoading =
		Result.isWaiting(worktreesResult) &&
		Option.isNone(Result.value(worktreesResult));

	// Filter to active worktrees and sort by last accessed
	const activeWorktrees = useMemo(() => {
		return [...worktrees]
			.filter((w) => w.status === "active")
			.sort(
				(a, b) =>
					new Date(b.lastAccessedAt).getTime() -
					new Date(a.lastAccessedAt).getTime(),
			)
			.slice(0, 6);
	}, [worktrees]);

	// Get session counts per worktree
	const sessionCountByWorktree = useMemo(() => {
		const counts = new Map<string, number>();
		for (const session of sessions) {
			counts.set(session.worktreeId, (counts.get(session.worktreeId) ?? 0) + 1);
		}
		return counts;
	}, [sessions]);

	// Get recent sessions sorted by last activity
	const recentSessions = useMemo(() => {
		return [...sessions]
			.sort(
				(a, b) =>
					new Date(b.lastActivityAt).getTime() -
					new Date(a.lastActivityAt).getTime(),
			)
			.slice(0, 5);
	}, [sessions]);

	// Calculate summary stats
	const stats = useMemo(() => {
		const totalSessions = sessions.length;
		const totalTokens = sessions.reduce(
			(sum, s) => sum + s.inputTokens + s.outputTokens,
			0,
		);
		const totalCost = sessions.reduce((sum, s) => sum + s.totalCostUsd, 0);

		return { totalSessions, totalTokens, totalCost };
	}, [sessions]);

	const handleWorktreeClick = (worktree: Worktree) => {
		navigate(`/worktrees/${worktree.id}`);
		setOpenMobile(false);
	};

	const handleSessionClick = (session: Session) => {
		navigate(`/worktrees/${session.worktreeId}/sessions/${session.id}`);
		setOpenMobile(false);
	};

	if (!isLoading && activeWorktrees.length === 0) {
		return (
			<div className="flex flex-col h-full">
				<div
					data-tauri-drag-region
					className="shrink-0 px-3 py-2 border-b border-border bg-background"
				/>
				<div className="flex-1 flex items-center justify-center">
					<EmptyDashboard />
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div
				data-tauri-drag-region
				className="shrink-0 px-3 py-2 border-b border-border bg-background flex items-center justify-between h-12"
			>
				<span className="font-medium text-sm">Dashboard</span>
				{stats.totalSessions > 0 && (
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<span>{stats.totalSessions} sessions</span>
						{stats.totalTokens > 0 && (
							<span>{formatTokens(stats.totalTokens)} tokens</span>
						)}
						{stats.totalCost > 0 && <span>{formatCost(stats.totalCost)}</span>}
					</div>
				)}
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				<div className="max-w-2xl mx-auto flex flex-col gap-6">
					{/* Active Worktrees Section */}
					<section className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-medium text-foreground">
								Active Worktrees
							</h2>
							<span className="text-xs text-muted-foreground">
								{activeWorktrees.length} active
							</span>
						</div>

						{isLoading ? (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								<WorktreeCardSkeleton />
								<WorktreeCardSkeleton />
								<WorktreeCardSkeleton />
							</div>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{activeWorktrees.map((worktree) => (
									<WorktreeWithRepository
										key={worktree.id}
										worktree={worktree}
										sessionCount={sessionCountByWorktree.get(worktree.id) ?? 0}
										onClick={() => handleWorktreeClick(worktree)}
									/>
								))}
							</div>
						)}
					</section>

					{/* Recent Sessions Section */}
					{(recentSessions.length > 0 || isLoading) && (
						<section className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<h2 className="text-sm font-medium text-foreground">
									Recent Sessions
								</h2>
								<span className="text-xs text-muted-foreground">
									{recentSessions.length} recent
								</span>
							</div>

							{isLoading ? (
								<div className="flex flex-col gap-2">
									<SessionCardSkeleton />
									<SessionCardSkeleton />
									<SessionCardSkeleton />
								</div>
							) : (
								<div className="flex flex-col gap-2">
									{recentSessions.map((session) => (
										<SessionWithWorktreeCard
											key={session.id}
											session={session}
											onClick={() => handleSessionClick(session)}
										/>
									))}
								</div>
							)}
						</section>
					)}

					{/* Tip for mobile users */}
					<div className="text-center text-xs text-muted-foreground py-4 md:hidden">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setOpenMobile(true)}
							className="text-xs"
						>
							<IconMessage className="size-3 mr-1" />
							Open sidebar to create worktrees
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
