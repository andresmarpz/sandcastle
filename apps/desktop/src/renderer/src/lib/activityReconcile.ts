import { collectLeafIds } from "@/lib/paneTree";
import { classifyProc, type ForegroundProc } from "@/lib/procClassifier";
import { getSessionId } from "@/lib/terminalRegistry";
import { type LeafLiveness, useActivityStore } from "@/stores/activity";
import { useTabsStore } from "@/stores/tabs";

// Gap between the two foreground-process samples. A single `ps` can momentarily
// miss claude during an exec handoff (it briefly spawns a shell/ripgrep for a
// tool), so the destructive reconcile rules require claude to be absent in BOTH
// samples — we treat "present in either" as alive. Short enough to be invisible
// on a correction path, long enough to span a tool-spawn blip.
export const CONFIRM_GAP_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const hasClaude = (procs: ForegroundProc[] | undefined): boolean =>
	(procs ?? []).some((p) => classifyProc(p) === "claude");

/**
 * Reconcile a workspace's activity status against process ground truth. Probes
 * each pane's foreground process group (the same IPC that drives tab icons) to
 * learn whether claude is alive, then hands that to the store's reconcile action
 * which corrects stale "working"/"needs-attention" both ways (clears a dead
 * session, restores one dropped by a teleport). One-shot and fire-and-forget —
 * errors are swallowed and the next trigger retries. See stores/activity.ts.
 */
export const reconcileWorkspaceActivity = async (wsId: string | undefined): Promise<void> => {
	if (!wsId) return;
	try {
		const ws = useTabsStore.getState().byWorkspace[wsId];
		if (!ws) return;

		// leaf → session, snapshotted once so both samples line up. Leaves whose
		// terminal instance hasn't attached yet (null session) are omitted entirely
		// so reconcile never mistakes "not ready" for "claude is gone".
		const sessions: Array<{ leafId: string; sessionId: string }> = [];
		for (const tab of ws.tabs) {
			for (const leafId of collectLeafIds(tab.tree)) {
				const sessionId = getSessionId(leafId);
				if (sessionId) sessions.push({ leafId, sessionId });
			}
		}
		if (sessions.length === 0) return;

		const sessionIds = sessions.map((s) => s.sessionId);
		const first = await window.api.terminal.getForegroundProcs(sessionIds);
		await sleep(CONFIRM_GAP_MS);
		const second = await window.api.terminal.getForegroundProcs(sessionIds);

		const liveness: Record<string, LeafLiveness> = {};
		for (const { leafId, sessionId } of sessions) {
			liveness[leafId] = {
				claudePresent: hasClaude(first[sessionId]) || hasClaude(second[sessionId]),
			};
		}
		useActivityStore.getState().reconcileWorkspace(wsId, liveness);
	} catch {
		// Best-effort safeguard — swallow and let the next visit/focus/sweep retry.
	}
};
