"use client";

import { useTransition } from "react";
import { useNavigate } from "react-router";

/**
 * Hook for navigating between sessions with smooth transitions.
 *
 * Uses React's useTransition to keep the current session visible
 * while the new session renders in the background. This prevents
 * the "jitter" caused by expensive markdown rendering in large
 * message lists.
 *
 * @example
 * ```tsx
 * const { navigateToSession, isPending } = useSessionNavigation();
 *
 * <button
 *   onClick={() => navigateToSession(repositoryId, sessionId)}
 *   data-pending={isPending}
 * >
 *   {session.title}
 * </button>
 * ```
 */
export function useSessionNavigation() {
	const navigate = useNavigate();
	const [isPending, startTransition] = useTransition();

	function navigateToSession(repositoryId: string, sessionId: string) {
		const sessionPath = `/repository/${repositoryId}/sessions/${sessionId}`;
		startTransition(() => {
			navigate(sessionPath);
		});
	}

	return {
		navigateToSession,
		isPending,
	};
}
