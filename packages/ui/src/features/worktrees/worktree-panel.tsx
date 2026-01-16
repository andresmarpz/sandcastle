"use client";

import {
	Result,
	useAtom,
	useAtomRefresh,
	useAtomValue,
} from "@effect-atom/atom-react";
import type { Session, Worktree } from "@sandcastle/rpc";
import { IconPlus } from "@tabler/icons-react";
import { formatDistanceToNow } from "date-fns";
import * as Option from "effect/Option";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByWorktreeAtomFamily,
} from "@/api/session-atoms";
import { worktreeAtomFamily } from "@/api/worktree-atoms";
import { Alert, AlertDescription, AlertTitle } from "@/components/alert";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/card";
import { ScrollArea } from "@/components/scroll-area";
import { Separator } from "@/components/separator";
import { Skeleton } from "@/components/skeleton";
import { Spinner } from "@/components/spinner";
import { ChatView } from "@/features/chat";
import { cn } from "@/lib/utils";
import { OpenButton } from "./open-button";

export function WorktreePanel() {
	const { worktreeId, sessionId } = useParams<{
		worktreeId?: string;
		sessionId?: string;
	}>();

	if (!worktreeId) {
		return (
			<div className="flex h-full items-center justify-center px-6">
				<Alert>
					<AlertTitle>Worktree not found</AlertTitle>
					<AlertDescription>Select a worktree to continue.</AlertDescription>
				</Alert>
			</div>
		);
	}

	const worktreeResult = useAtomValue(worktreeAtomFamily(worktreeId));
	const worktree = useMemo(
		() => Option.getOrElse(Result.value(worktreeResult), () => null),
		[worktreeResult],
	);
	const hasWorktreeCache = worktree !== null;

	return Result.matchWithWaiting(worktreeResult, {
		onWaiting: () =>
			hasWorktreeCache && worktree ? (
				<WorktreePanelContent
					worktree={worktree}
					worktreeId={worktreeId}
					sessionId={sessionId}
				/>
			) : (
				<WorktreeLoading />
			),
		onError: () => <WorktreeError />,
		onDefect: () => <WorktreeError />,
		onSuccess: () =>
			worktree ? (
				<WorktreePanelContent
					worktree={worktree}
					worktreeId={worktreeId}
					sessionId={sessionId}
				/>
			) : (
				<WorktreeError />
			),
	});
}

interface WorktreePanelContentProps {
	worktree: Worktree;
	worktreeId: string;
	sessionId?: string;
}

function WorktreePanelContent({
	worktree,
	worktreeId,
	sessionId,
}: WorktreePanelContentProps) {
	const navigate = useNavigate();
	const sessionsResult = useAtomValue(
		sessionListByWorktreeAtomFamily(worktreeId),
	);
	const refreshSessions = useAtomRefresh(
		sessionListByWorktreeAtomFamily(worktreeId),
	);
	const [, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const [isCreatingSession, setIsCreatingSession] = useState(false);

	const sessions = useMemo(
		() => Option.getOrElse(Result.value(sessionsResult), () => []),
		[sessionsResult],
	);
	const sortedSessions = useMemo(
		() =>
			[...sessions].sort((a, b) => {
				const aTime = Date.parse(a.lastActivityAt);
				const bTime = Date.parse(b.lastActivityAt);
				const safeATime = Number.isNaN(aTime) ? 0 : aTime;
				const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
				return safeBTime - safeATime;
			}),
		[sessions],
	);
	const hasSessionCache = Option.isSome(Result.value(sessionsResult));

	const handleSessionSelect = (session: Session) => {
		navigate(`/worktrees/${worktreeId}/sessions/${session.id}`);
	};

	const handleCreateSession = async () => {
		if (isCreatingSession) return;
		setIsCreatingSession(true);
		try {
			const result = await createSession({
				payload: {
					worktreeId,
					title: "New session",
				},
				reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktreeId}`],
			});

			if (result._tag === "Success") {
				navigate(`/worktrees/${worktreeId}/sessions/${result.value.id}`);
			} else {
				refreshSessions();
			}
		} finally {
			setIsCreatingSession(false);
		}
	};

	return (
		<div className="flex h-full min-w-0">
			<aside className="border-border bg-muted/30 flex w-72 shrink-0 flex-col border-r">
				<div className="border-border flex items-start justify-between gap-3 border-b px-4 py-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h2 className="truncate text-sm font-medium">{worktree.name}</h2>
							<Badge variant="outline">{worktree.branch}</Badge>
						</div>
						<p className="text-muted-foreground truncate text-xs">
							{worktree.path}
						</p>
					</div>
					<OpenButton worktree={worktree} size="sm" />
				</div>

				<div className="flex items-center justify-between px-4 py-3">
					<span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
						Sessions
					</span>
					<Button
						size="xs"
						variant="secondary"
						onClick={handleCreateSession}
						disabled={isCreatingSession}
						className="gap-1"
					>
						{isCreatingSession ? (
							<Spinner className="size-3" />
						) : (
							<IconPlus className="size-3" />
						)}
						New
					</Button>
				</div>

				<Separator />

				<ScrollArea className="flex-1">
					<div className="p-2">
						<SessionList
							result={sessionsResult}
							sessions={sortedSessions}
							hasCache={hasSessionCache}
							activeSessionId={sessionId}
							onSelect={handleSessionSelect}
						/>
					</div>
				</ScrollArea>
			</aside>

			<section className="flex min-w-0 flex-1 flex-col">
				{sessionId ? (
					<ChatView sessionId={sessionId} worktreeId={worktreeId} />
				) : (
					<NoSessionSelected
						onCreateSession={handleCreateSession}
						isCreating={isCreatingSession}
						hasSessions={sortedSessions.length > 0}
					/>
				)}
			</section>
		</div>
	);
}

interface SessionListProps {
	result: Result.Result<readonly Session[], unknown>;
	sessions: Session[];
	hasCache: boolean;
	activeSessionId?: string;
	onSelect: (session: Session) => void;
}

function SessionList({
	result,
	sessions,
	hasCache,
	activeSessionId,
	onSelect,
}: SessionListProps) {
	return Result.matchWithWaiting(result, {
		onWaiting: () =>
			hasCache ? (
				<SessionListContent
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSelect={onSelect}
				/>
			) : (
				<SessionListSkeleton />
			),
		onError: () =>
			hasCache ? (
				<SessionListContent
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSelect={onSelect}
					errorMessage="Session list may be stale."
				/>
			) : (
				<SessionListError />
			),
		onDefect: () =>
			hasCache ? (
				<SessionListContent
					sessions={sessions}
					activeSessionId={activeSessionId}
					onSelect={onSelect}
					errorMessage="Session list may be stale."
				/>
			) : (
				<SessionListError />
			),
		onSuccess: () => (
			<SessionListContent
				sessions={sessions}
				activeSessionId={activeSessionId}
				onSelect={onSelect}
			/>
		),
	});
}

interface SessionListContentProps {
	sessions: Session[];
	activeSessionId?: string;
	onSelect: (session: Session) => void;
	errorMessage?: string;
}

function SessionListContent({
	sessions,
	activeSessionId,
	onSelect,
	errorMessage,
}: SessionListContentProps) {
	if (sessions.length === 0) {
		return (
			<div className="text-muted-foreground px-2 py-4 text-xs">
				No sessions yet.
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			{errorMessage && (
				<div className="text-muted-foreground px-2 py-2 text-xs">
					{errorMessage}
				</div>
			)}
			{sessions.map((session) => {
				const isActive = session.id === activeSessionId;

				return (
					<button
						key={session.id}
						type="button"
						className={cn(
							"hover:bg-muted flex w-full flex-col gap-1 rounded-md border border-transparent px-2 py-2 text-left transition",
							isActive && "bg-muted text-foreground",
						)}
						onClick={() => onSelect(session)}
					>
						<div className="flex items-center justify-between gap-2">
							<span className="truncate text-sm font-medium">
								{session.title || "Untitled session"}
							</span>
							<Badge variant="outline">{session.status}</Badge>
						</div>
						<div className="text-muted-foreground text-xs">
							{formatRelativeTime(session.lastActivityAt)}
						</div>
					</button>
				);
			})}
		</div>
	);
}

function SessionListSkeleton() {
	return (
		<div className="space-y-2">
			{[1, 2, 3].map((item) => (
				<div key={item} className="space-y-2">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-3 w-1/2" />
				</div>
			))}
		</div>
	);
}

function SessionListError() {
	return (
		<Alert variant="destructive">
			<AlertTitle>Sessions unavailable</AlertTitle>
			<AlertDescription>We could not load sessions.</AlertDescription>
		</Alert>
	);
}

function NoSessionSelected({
	onCreateSession,
	isCreating,
	hasSessions,
}: {
	onCreateSession: () => void;
	isCreating: boolean;
	hasSessions: boolean;
}) {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<Card className="max-w-md">
				<CardHeader>
					<CardTitle>Choose a session</CardTitle>
					<CardDescription>
						{hasSessions
							? "Select a session from the sidebar to continue."
							: "Create a new session to start chatting."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						onClick={onCreateSession}
						disabled={isCreating}
						className="gap-2"
					>
						{isCreating ? (
							<Spinner className="size-4" />
						) : (
							<IconPlus className="size-4" />
						)}
						New session
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}

function WorktreeLoading() {
	return (
		<div className="flex h-full items-center justify-center text-muted-foreground">
			<Spinner className="mr-2" />
			Loading worktree...
		</div>
	);
}

function WorktreeError() {
	return (
		<div className="flex h-full items-center justify-center px-6">
			<Alert variant="destructive">
				<AlertTitle>Worktree unavailable</AlertTitle>
				<AlertDescription>
					We could not load this worktree. Please try again.
				</AlertDescription>
			</Alert>
		</div>
	);
}

function formatRelativeTime(iso: string) {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) {
		return "unknown";
	}
	return formatDistanceToNow(timestamp, { addSuffix: true });
}
