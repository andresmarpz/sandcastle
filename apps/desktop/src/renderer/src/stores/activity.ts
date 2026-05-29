import { create } from "zustand";

import { getActiveView } from "@/lib/activeView";
import { type Cue, playCue } from "@/lib/activitySounds";
import { collectLeafIds } from "@/lib/paneTree";
import { useTabsStore } from "@/stores/tabs";

// A workspace is "colored" by the highest-precedence status among any of its
// panes (leaves) across every tab/split — needs-attention beats working beats
// done beats idle. Mirrors superset's STATUS_PRIORITY fold.
export type LeafStatus = "idle" | "working" | "done" | "needs-attention";
export type WorkspaceStatus = LeafStatus;

export const STATUS_PRIORITY: Record<LeafStatus, number> = {
	idle: 0,
	done: 1,
	working: 2,
	"needs-attention": 3,
};

/** The status reported by a Claude Code hook (see main/claudeHooks.ts). */
export type HookStatus = "working" | "attention" | "done";

// Raw per-leaf signals. The effective LeafStatus is derived from these so the
// two producers (hooks + byte path) and the acknowledge path can each mutate
// just the fields they own without stomping the others.
type LeafSignals = {
	// Set once any Claude Code hook fires for this leaf. While true, the byte
	// path is ignored for "working" — hooks are authoritative.
	hookSeen: boolean;
	// Hook: a turn is in flight (UserPromptSubmit .. Stop).
	turnActive: boolean;
	// Hook Notification: agent is blocked waiting on the user. Latches until the
	// workspace/pane is focused.
	attention: boolean;
	// Hook Stop: turn finished. Latches (green "done" dot) until focused, or
	// until the next turn starts.
	done: boolean;
	// Byte path: the "esc to interrupt" spinner was seen recently. Fallback
	// "working" signal when no hook has fired for this leaf.
	byteWorking: boolean;
};

const emptySignals = (): LeafSignals => ({
	hookSeen: false,
	turnActive: false,
	attention: false,
	done: false,
	byteWorking: false,
});

const effectiveStatus = (s: LeafSignals): LeafStatus => {
	if (s.attention) return "needs-attention";
	const working = s.hookSeen ? s.turnActive : s.byteWorking;
	if (working) return "working";
	if (s.done) return "done";
	return "idle";
};

type ActivityState = {
	signals: Record<string, LeafSignals>;
	leafStatus: Record<string, LeafStatus>;
	workspaceStatus: Record<string, WorkspaceStatus>;
	setByteWorking: (leafId: string, working: boolean) => void;
	applyHook: (leafId: string, status: HookStatus) => void;
	acknowledgeLeaf: (leafId: string) => void;
	acknowledgeWorkspace: (wsId: string) => void;
	acknowledgeActivePane: () => void;
	recomputeWorkspaces: (wsIds: string[]) => void;
	pruneLeaf: (leafId: string) => void;
};

// Per-leaf cooldown so a flapping spinner/decay boundary can't machine-gun
// chimes. Kept outside the store — it's incidental, not rendered state.
const COOLDOWN_MS = 3000;
const lastCueAt = new Map<string, number>();

const findWorkspaceForLeaf = (leafId: string): string | null => {
	const { byWorkspace } = useTabsStore.getState();
	for (const wsId of Object.keys(byWorkspace)) {
		for (const tab of byWorkspace[wsId].tabs) {
			if (collectLeafIds(tab.tree).includes(leafId)) return wsId;
		}
	}
	return null;
};

// Is `leafId` the exact pane the user is looking at right now? Used to suppress
// the chime for foreground work. A blurred/hidden window is never "looking at
// it", so background completions always chime.
const isLeafFocused = (leafId: string): boolean => {
	if (typeof document === "undefined") return false;
	if (!document.hasFocus() || document.hidden) return false;
	const view = getActiveView();
	if (!view?.tabId) return false;
	const tab = useTabsStore.getState().byWorkspace[view.wsId]?.tabs.find((t) => t.id === view.tabId);
	return tab?.activeLeafId === leafId;
};

export const useActivityStore = create<ActivityState>()((set, get) => {
	// Fold a workspace's leaves into its single status and write it if changed.
	const recomputeWorkspace = (wsId: string): void => {
		const ws = useTabsStore.getState().byWorkspace[wsId];
		const { leafStatus, workspaceStatus } = get();
		let best: LeafStatus = "idle";
		if (ws) {
			for (const tab of ws.tabs) {
				for (const leafId of collectLeafIds(tab.tree)) {
					const status = leafStatus[leafId] ?? "idle";
					if (STATUS_PRIORITY[status] > STATUS_PRIORITY[best]) best = status;
				}
			}
		}
		if ((workspaceStatus[wsId] ?? "idle") === best) return;
		set({ workspaceStatus: { ...workspaceStatus, [wsId]: best } });
	};

	const maybePlayCue = (leafId: string, prev: LeafStatus, next: LeafStatus): void => {
		let cue: Cue | null = null;
		if (next === "needs-attention" && prev !== "needs-attention") cue = "attention";
		else if (next === "done" && prev !== "done") cue = "complete";
		if (!cue) return;
		if (isLeafFocused(leafId)) return;
		const now = Date.now();
		if (now - (lastCueAt.get(leafId) ?? 0) < COOLDOWN_MS) return;
		lastCueAt.set(leafId, now);
		playCue(cue);
	};

	// Apply a signal mutation to one leaf, re-derive its status, and propagate to
	// the workspace rollup + sound on a real status change.
	const mutateLeaf = (leafId: string, mut: (s: LeafSignals) => void): void => {
		const prevSignals = get().signals[leafId] ?? emptySignals();
		const nextSignals = { ...prevSignals };
		mut(nextSignals);
		// A pane the user is actively viewing has already "seen" a finish/attention,
		// so never let those latch on it — e.g. a Stop firing while you're looking
		// at the terminal should resolve straight to idle, not a stuck green dot.
		// Mirrors the sound-suppression rule.
		if ((nextSignals.done || nextSignals.attention) && isLeafFocused(leafId)) {
			nextSignals.done = false;
			nextSignals.attention = false;
		}
		const prevStatus = get().leafStatus[leafId] ?? "idle";
		const nextStatus = effectiveStatus(nextSignals);
		set((state) => ({
			signals: { ...state.signals, [leafId]: nextSignals },
			leafStatus: { ...state.leafStatus, [leafId]: nextStatus },
		}));
		if (nextStatus === prevStatus) return;
		const wsId = findWorkspaceForLeaf(leafId);
		if (wsId) recomputeWorkspace(wsId);
		maybePlayCue(leafId, prevStatus, nextStatus);
	};

	return {
		signals: {},
		leafStatus: {},
		workspaceStatus: {},

		setByteWorking: (leafId, working) => {
			mutateLeaf(leafId, (s) => {
				s.byteWorking = working;
			});
		},

		applyHook: (leafId, status) => {
			mutateLeaf(leafId, (s) => {
				s.hookSeen = true;
				if (status === "working") {
					// A new turn started — supersedes any latched done/attention.
					s.turnActive = true;
					s.done = false;
					s.attention = false;
				} else if (status === "attention") {
					s.attention = true;
				} else {
					// done
					s.turnActive = false;
					s.done = true;
					s.attention = false;
				}
			});
		},

		acknowledgeLeaf: (leafId) => {
			mutateLeaf(leafId, (s) => {
				s.attention = false;
				s.done = false;
			});
		},

		// Clear the latched done/attention for every leaf in a workspace at once
		// (the user opened/focused it). Batches the signal writes, then does a
		// single workspace rollup.
		acknowledgeWorkspace: (wsId) => {
			const ws = useTabsStore.getState().byWorkspace[wsId];
			if (!ws) return;
			const leafIds = ws.tabs.flatMap((t) => collectLeafIds(t.tree));
			const { signals, leafStatus } = get();
			let changed = false;
			const nextSignals = { ...signals };
			const nextLeafStatus = { ...leafStatus };
			for (const leafId of leafIds) {
				const cur = signals[leafId];
				if (!cur || (!cur.attention && !cur.done)) continue;
				const updated = { ...cur, attention: false, done: false };
				nextSignals[leafId] = updated;
				nextLeafStatus[leafId] = effectiveStatus(updated);
				changed = true;
			}
			if (!changed) return;
			set({ signals: nextSignals, leafStatus: nextLeafStatus });
			recomputeWorkspace(wsId);
		},

		// Clear the latch on whatever pane is on screen. Called when the window
		// regains focus, so a dot that latched while you were away clears as soon
		// as you return to that pane (without needing to switch tabs and back).
		acknowledgeActivePane: () => {
			const view = getActiveView();
			if (!view?.tabId) return;
			const tab = useTabsStore
				.getState()
				.byWorkspace[view.wsId]?.tabs.find((t) => t.id === view.tabId);
			const leafId = tab?.activeLeafId;
			if (leafId) {
				mutateLeaf(leafId, (s) => {
					s.attention = false;
					s.done = false;
				});
			}
		},

		// Re-fold the rollups for a set of workspaces whose tab membership changed
		// without any leaf's own status changing — e.g. a worktree teleport moves a
		// tab between workspaces. The per-leaf signals/status are keyed by global
		// leafId so they ride along untouched; only the workspace aggregation needs
		// to follow the tab to its new home (and clear from the old one).
		recomputeWorkspaces: (wsIds) => {
			for (const wsId of new Set(wsIds)) recomputeWorkspace(wsId);
		},

		pruneLeaf: (leafId) => {
			const wsId = findWorkspaceForLeaf(leafId);
			lastCueAt.delete(leafId);
			set((state) => {
				if (!(leafId in state.signals) && !(leafId in state.leafStatus)) return state;
				const signals = { ...state.signals };
				const leafStatus = { ...state.leafStatus };
				delete signals[leafId];
				delete leafStatus[leafId];
				return { signals, leafStatus };
			});
			if (wsId) recomputeWorkspace(wsId);
		},
	};
});

/** Subscribe a sidebar row to just its workspace's aggregated status. */
export const useWorkspaceActivity = (wsId: string): WorkspaceStatus =>
	useActivityStore((s) => s.workspaceStatus[wsId] ?? "idle");
