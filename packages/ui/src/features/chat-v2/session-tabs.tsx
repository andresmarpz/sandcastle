"use client";

import {
	Result,
	useAtom,
	useAtomRefresh,
	useAtomValue,
} from "@effect-atom/atom-react";
import type { Session } from "@sandcastle/rpc";
import * as Option from "effect/Option";
import { useCallback, useMemo, useState } from "react";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByWorktreeAtomFamily,
} from "@/api/session-atoms";
import { Button } from "@/components/button";
import { cn } from "@/lib/utils";

interface SessionTabsProps {
	worktreeId: string;
	activeSessionId: string | null;
	onSessionSelect: (sessionId: string) => void;
}

function PlusIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			<path d="M8 3v10M3 8h10" strokeLinecap="round" />
		</svg>
	);
}

interface SessionTabProps {
	session: Session;
	isActive: boolean;
	onClick: () => void;
}

function SessionTab({ session, isActive, onClick }: SessionTabProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
				"hover:bg-muted/50",
				isActive
					? "bg-muted text-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			<span className="truncate max-w-[120px]">
				{session.title || "New Session"}
			</span>
		</button>
	);
}

export function SessionTabs({
	worktreeId,
	activeSessionId,
	onSessionSelect,
}: SessionTabsProps) {
	// Use stable atom from family for proper caching and refresh
	const sessionsAtom = useMemo(
		() => sessionListByWorktreeAtomFamily(worktreeId),
		[worktreeId],
	);
	const sessionsResult = useAtomValue(sessionsAtom);
	const refreshSessions = useAtomRefresh(sessionsAtom);
	const [, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});
	const [isCreating, setIsCreating] = useState(false);

	const handleCreateSession = useCallback(async () => {
		if (isCreating) return;
		setIsCreating(true);
		try {
			const result = await createSession({
				payload: {
					worktreeId,
					title: "New Session",
				},
				reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktreeId}`],
			});
			if (result._tag === "Success") {
				refreshSessions();
				onSessionSelect(result.value.id);
			}
		} finally {
			setIsCreating(false);
		}
	}, [worktreeId, createSession, onSessionSelect, isCreating, refreshSessions]);

	return (
		<div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30 overflow-x-auto">
			{Result.matchWithWaiting(sessionsResult, {
				onWaiting: (result) => {
					const cached = Option.getOrNull(Result.value(result));
					if (cached) {
						return cached.map((session) => (
							<SessionTab
								key={session.id}
								session={session}
								isActive={session.id === activeSessionId}
								onClick={() => onSessionSelect(session.id)}
							/>
						));
					}
					return null;
				},
				onError: () => (
					<span className="text-destructive text-xs">
						Failed to load sessions
					</span>
				),
				onDefect: () => (
					<span className="text-destructive text-xs">
						Failed to load sessions
					</span>
				),
				onSuccess: (success) =>
					success.value.map((session) => (
						<SessionTab
							key={session.id}
							session={session}
							isActive={session.id === activeSessionId}
							onClick={() => onSessionSelect(session.id)}
						/>
					)),
			})}

			<Button
				variant="ghost"
				size="sm"
				onClick={handleCreateSession}
				disabled={isCreating}
				className="ml-1 h-7 w-7 p-0 shrink-0"
			>
				<PlusIcon className="size-4" />
				<span className="sr-only">New session</span>
			</Button>
		</div>
	);
}
