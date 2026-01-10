"use client";

import {
	Result,
	useAtom,
	useAtomRefresh,
	useAtomValue,
} from "@effect-atom/atom-react";
import { useCallback, useEffect, useMemo } from "react";
import {
	createSessionMutation,
	SESSION_LIST_KEY,
	sessionListByWorktreeAtomFamily,
} from "@/api/session-atoms";
import type { Worktree } from "@/api/worktree-atoms";
import { Button } from "@/components/button";
import { ChatSession } from "../chat/chat-session";
import { SessionTabs } from "../chat/session-tabs";
import { OpenButton } from "./open-button";

interface WorktreeContentProps {
	worktree: Worktree;
	sessionId?: string | null;
	onSessionSelect: (sessionId: string) => void;
	isRefreshing?: boolean;
}

export function WorktreeContent({
	worktree,
	sessionId,
	onSessionSelect,
	isRefreshing,
}: WorktreeContentProps) {
	// Use stable atom from family for proper caching and refresh
	const sessionsAtom = useMemo(
		() => sessionListByWorktreeAtomFamily(worktree.id),
		[worktree.id],
	);
	const sessionsResult = useAtomValue(sessionsAtom);
	const refreshSessions = useAtomRefresh(sessionsAtom);
	const [, createSession] = useAtom(createSessionMutation, {
		mode: "promiseExit",
	});

	// Auto-select first session if no session is selected
	useEffect(() => {
		if (sessionId) return; // Already have a session selected

		if (sessionsResult._tag === "Success") {
			const sessions = sessionsResult.value;
			if (sessions.length > 0 && sessions[0]) {
				onSessionSelect(sessions[0].id);
			}
		}
	}, [sessionsResult, sessionId, onSessionSelect]);

	// Create initial session if none exist
	const handleCreateInitialSession = useCallback(async () => {
		const result = await createSession({
			payload: {
				worktreeId: worktree.id,
				title: "New Session",
			},
			reactivityKeys: [SESSION_LIST_KEY, `sessions:worktree:${worktree.id}`],
		});
		if (result._tag === "Success") {
			refreshSessions();
			onSessionSelect(result.value.id);
		}
	}, [worktree.id, createSession, refreshSessions, onSessionSelect]);

	// Check if we have sessions
	const hasSessions = Result.matchWithWaiting(sessionsResult, {
		onWaiting: () => false,
		onError: () => false,
		onDefect: () => false,
		onSuccess: (success) => success.value.length > 0,
	});

	return (
		<div className="flex flex-col h-full">
			{/* Header with worktree info and actions */}
			<div
				data-tauri-drag-region
				className="flex shrink-0 items-center justify-between px-3 py-2 border-b border-border bg-background"
			>
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-medium text-sm truncate">{worktree.name}</span>
					<span className="text-xs text-muted-foreground truncate">
						{worktree.branch}
					</span>
					{isRefreshing && (
						<span className="text-muted-foreground text-xs">Refreshing...</span>
					)}
				</div>
				<OpenButton worktree={worktree} size="sm" />
			</div>

			{/* Session tabs */}
			<SessionTabs
				worktreeId={worktree.id}
				activeSessionId={sessionId ?? null}
				onSessionSelect={onSessionSelect}
			/>

			{/* Chat session or empty state */}
			<div className="flex-1 min-h-0 overflow-hidden">
				{sessionId ? (
					<ChatSession sessionId={sessionId} worktreeId={worktree.id} />
				) : hasSessions ? // Sessions exist but none selected - auto-redirect is pending, show nothing
				null : (
					<div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-3 p-4">
						<span>No sessions yet</span>
						<Button onClick={handleCreateInitialSession} size="sm">
							Create Session
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
