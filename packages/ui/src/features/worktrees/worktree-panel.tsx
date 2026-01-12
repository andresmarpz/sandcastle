"use client";

import { Result, useAtomValue } from "@effect-atom/atom-react";
import * as Option from "effect/Option";
import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { worktreeAtomFamily } from "@/api/worktree-atoms";
import { WorktreeContent } from "./worktree-content";

export function WorktreePanel() {
	const { worktreeId, sessionId } = useParams<{
		worktreeId: string;
		sessionId?: string;
	}>();
	const navigate = useNavigate();

	const onSessionSelect = useCallback(
		(id: string) => {
			navigate(`/worktrees/${worktreeId}/sessions/${id}`);
		},
		[navigate, worktreeId],
	);

	// Use stable atom from family for proper caching
	const worktreeAtom = useMemo(
		() => worktreeAtomFamily(worktreeId ?? ""),
		[worktreeId],
	);
	const worktreeResult = useAtomValue(worktreeAtom);

	// This renders with react-router inside the ":worktreeId" so this should never happen
	if (!worktreeId) return null;

	return (
		<div className="h-full min-w-0">
			{Result.matchWithWaiting(worktreeResult, {
				onWaiting: (result) => {
					const cached = Option.getOrNull(Result.value(result));
					if (!cached) {
						return (
							<div className="text-muted-foreground text-sm p-4">
								Loading...
							</div>
						);
					}
					return (
						<WorktreeContent
							worktree={cached}
							sessionId={sessionId}
							onSessionSelect={onSessionSelect}
							isRefreshing
						/>
					);
				},
				onError: () => (
					<div className="text-destructive text-sm p-4">
						Failed to load worktree details.
					</div>
				),
				onDefect: () => (
					<div className="text-destructive text-sm p-4">
						Failed to load worktree details.
					</div>
				),
				onSuccess: (success) => (
					<WorktreeContent
						worktree={success.value}
						sessionId={sessionId}
						onSessionSelect={onSessionSelect}
					/>
				),
			})}
		</div>
	);
}
