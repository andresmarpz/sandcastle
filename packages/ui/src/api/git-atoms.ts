import { Atom } from "@effect-atom/atom-react";
import { GIT_STATS_KEY, GitClient } from "./git-client";

// Re-export the client and key for direct use
export { GitClient, GIT_STATS_KEY };

/**
 * Family of atoms for git stats by session ID.
 * Fetches diff statistics for the session's working directory.
 */
export const sessionGitStatsAtomFamily = Atom.family((sessionId: string) =>
	GitClient.query(
		"git.getSessionStats",
		{ sessionId },
		{
			reactivityKeys: [GIT_STATS_KEY, `git-stats:session:${sessionId}`],
			timeToLive: 10 * 1000, // 10 seconds TTL
		},
	),
);

/**
 * Returns the atom for fetching git stats for a session.
 */
export const sessionGitStatsQuery = (sessionId: string) =>
	sessionGitStatsAtomFamily(sessionId);
