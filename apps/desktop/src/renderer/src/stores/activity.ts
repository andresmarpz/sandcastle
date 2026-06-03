import { create } from "zustand";

import { getActiveView } from "@/lib/activeView";
import { type Cue, playCue } from "@/lib/activitySounds";
import { collectLeafIds } from "@/lib/paneTree";
import { useTabsStore } from "@/stores/tabs";

// A workspace is "colored" by the highest-precedence status among any of its
// panes (leaves) across every tab/split — cron beats needs-attention beats
// working beats done beats idle. Mirrors superset's STATUS_PRIORITY fold.
// "cron" tops the order on purpose: an active /loop cron is the headline state
// and supersedes the per-turn dot for the whole workspace.
export type LeafStatus = "idle" | "working" | "done" | "needs-attention" | "cron";
export type WorkspaceStatus = LeafStatus;

export const STATUS_PRIORITY: Record<LeafStatus, number> = {
	idle: 0,
	done: 1,
	working: 2,
	"needs-attention": 3,
	cron: 4,
};

/** A wire event reported by a Claude Code hook (see main/claudeHooks.ts). */
export type HookStatus =
	| "working"
	| "attention"
	| "done"
	| "cron-start"
	| "cron-stop"
	| "session-end";

/**
 * Ground-truth process state for a leaf, gathered by the reconcile probe (see
 * lib/activityReconcile.ts). `claudePresent` means a `claude` process is in the
 * pane's foreground process group — i.e. Claude is alive (whether generating or
 * idle at its prompt). It can't tell those two apart; the byte-path spinner does.
 */
export type LeafLiveness = { claudePresent: boolean };

// A destructive reconcile correction (clearing a stuck "working"/"needs-attention")
// only fires once a leaf has held that live status continuously for this long.
// A genuinely stuck turn has been live for minutes; a just-spawned or just-
// teleported Claude that the process probe hasn't caught up with yet has not —
// so this grace floor is what keeps reconcile from clobbering a real, fresh turn.
export const STUCK_MIN_MS = 10_000;

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
	// Hook PostToolUse[CronCreate]: a session-scoped cron (/loop, /schedule) is
	// live in this leaf's session. Latches until the cron is deleted or the
	// session exits (both end the cron), independent of focus — a running cron is
	// surfaced regardless of which pane you're looking at.
	cronActive: boolean;
};

const emptySignals = (): LeafSignals => ({
	hookSeen: false,
	turnActive: false,
	attention: false,
	done: false,
	byteWorking: false,
	cronActive: false,
});

const effectiveStatus = (s: LeafSignals): LeafStatus => {
	if (s.cronActive) return "cron";
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
	reconcileWorkspace: (wsId: string, liveness: Record<string, LeafLiveness>) => void;
	recomputeWorkspaces: (wsIds: string[]) => void;
	pruneLeaf: (leafId: string) => void;
};

// Per-leaf cooldown so a flapping spinner/decay boundary can't machine-gun
// chimes. Kept outside the store — it's incidental, not rendered state.
const COOLDOWN_MS = 3000;
const lastCueAt = new Map<string, number>();

// When each leaf last *entered* a live status ("working"/"needs-attention"),
// used by reconcile's STUCK_MIN_MS grace floor. Kept outside the store like
// lastCueAt — it's bookkeeping that drives corrections, not rendered state.
const liveSince = new Map<string, number>();

// Record a leaf's latest derived status so liveSince tracks one continuous live
// span: the timestamp is stamped on the transition *into* a live status and held
// (working↔needs-attention stays one span), and cleared the moment it goes
// idle/done. Call this from every path that writes leafStatus.
const noteStatus = (leafId: string, status: LeafStatus): void => {
	if (status === "working" || status === "needs-attention") {
		if (!liveSince.has(leafId)) liveSince.set(leafId, Date.now());
	} else {
		liveSince.delete(leafId);
	}
};

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
		noteStatus(leafId, nextStatus);
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
				switch (status) {
					case "working":
						// A new turn started — supersedes any latched done/attention.
						// A cron firing its prompt looks like a normal turn; the
						// cronActive latch is left untouched so the clock rides through.
						s.turnActive = true;
						s.done = false;
						s.attention = false;
						break;
					case "attention":
						s.attention = true;
						break;
					case "done":
						s.turnActive = false;
						s.done = true;
						s.attention = false;
						break;
					case "cron-start":
						s.cronActive = true;
						break;
					case "cron-stop":
					case "session-end":
						// The cron was deleted, or the session that owned it exited
						// (session-scoped crons die with it). Resolve to a "done"
						// workspace rather than dropping silently back to idle.
						if (s.cronActive) {
							s.cronActive = false;
							s.done = true;
						}
						// A session exit also ends any in-flight turn, so a session
						// killed mid-turn doesn't leave a stuck "working" dot.
						if (status === "session-end") s.turnActive = false;
						break;
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
				const updatedStatus = effectiveStatus(updated);
				nextSignals[leafId] = updated;
				nextLeafStatus[leafId] = updatedStatus;
				noteStatus(leafId, updatedStatus);
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

		// Safeguard against status that drifted out of sync with reality (a Stop
		// hook that never arrived because the session died/crashed; a "working"
		// dropped during a worktree teleport). `liveness` is the ground truth from
		// the process probe (see lib/activityReconcile.ts): for each leaf, whether a
		// claude process is alive in its pane. Combined with the byte-path spinner
		// (which the process can't tell us — it only says claude is *running*, not
		// *generating*) we correct in both directions. Batched like
		// acknowledgeWorkspace, and deliberately CUE-FREE: this is a correction, not
		// a fresh event, so it must never chime.
		reconcileWorkspace: (wsId, liveness) => {
			const ws = useTabsStore.getState().byWorkspace[wsId];
			if (!ws) return;
			const leafIds = ws.tabs.flatMap((t) => collectLeafIds(t.tree));
			const { signals, leafStatus } = get();
			const now = Date.now();
			let changed = false;
			const nextSignals = { ...signals };
			const nextLeafStatus = { ...leafStatus };
			for (const leafId of leafIds) {
				const live = liveness[leafId];
				const cur = signals[leafId];
				// No probe result (pane not attached yet) or nothing tracked → leave it.
				if (!live || !cur) continue;
				const since = liveSince.get(leafId);
				const liveLongEnough = since !== undefined && now - since >= STUCK_MIN_MS;
				const next = { ...cur };
				if (live.claudePresent && cur.byteWorking) {
					// B — restore: claude is alive and the spinner is painting, so it's
					// genuinely working. Re-assert it in case a teleport dropped it.
					if (cur.hookSeen) {
						next.turnActive = true;
						next.done = false;
					}
				} else if (!live.claudePresent) {
					// A — dead: claude isn't running, so any working/attention is stale.
					// Gated on the grace floor so a just-spawned claude the probe hasn't
					// caught yet isn't cleared. `done` is left to the acknowledge path.
					if (liveLongEnough) {
						next.turnActive = false;
						next.byteWorking = false;
						next.attention = false;
					}
				} else if (cur.hookSeen && cur.turnActive && !cur.byteWorking && liveLongEnough) {
					// C — lost Stop: claude is alive but the spinner is long gone, yet a
					// hook turn never closed. The turn ended; the Stop hook was lost.
					next.turnActive = false;
					next.done = true;
				}
				// Never latch done/attention on the pane being viewed (mirrors mutateLeaf).
				if ((next.done || next.attention) && isLeafFocused(leafId)) {
					next.done = false;
					next.attention = false;
				}
				if (
					next.turnActive === cur.turnActive &&
					next.byteWorking === cur.byteWorking &&
					next.attention === cur.attention &&
					next.done === cur.done
				) {
					continue;
				}
				const nextStatus = effectiveStatus(next);
				nextSignals[leafId] = next;
				nextLeafStatus[leafId] = nextStatus;
				noteStatus(leafId, nextStatus);
				changed = true;
			}
			if (!changed) return;
			set({ signals: nextSignals, leafStatus: nextLeafStatus });
			recomputeWorkspace(wsId);
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
			liveSince.delete(leafId);
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
