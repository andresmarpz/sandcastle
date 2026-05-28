// The router uses hash history (see router.tsx) with routes shaped
// /workspaces/$wsId and /workspaces/$wsId/tabs/$tabId. The activity store lives
// outside React/router context but needs to know which workspace + tab the user
// is actually looking at (to suppress notification sounds for the focused pane),
// so it reads the hash directly through this parser.

export type ActiveView = { wsId: string; tabId?: string };

const VIEW_RE = /\/workspaces\/([^/?#]+)(?:\/tabs\/([^/?#]+))?/;

export const parseActiveView = (hash: string): ActiveView | null => {
	const match = VIEW_RE.exec(hash);
	if (!match) return null;
	return {
		wsId: decodeURIComponent(match[1]),
		tabId: match[2] ? decodeURIComponent(match[2]) : undefined,
	};
};

export const getActiveView = (): ActiveView | null => {
	if (typeof window === "undefined") return null;
	return parseActiveView(window.location.hash);
};
