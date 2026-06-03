import { useEffect } from "react";

import { getActiveView } from "@/lib/activeView";
import { reconcileWorkspaceActivity } from "@/lib/activityReconcile";
import { getLeafIdForSession, subscribeActivity } from "@/lib/terminalRegistry";
import { useActivityStore } from "@/stores/activity";

// Steady-state safety net: a session can die *while* you sit on its workspace, so
// no visit/teleport/focus event fires to trigger a reconcile. This slow sweep
// catches that — but only when it could matter: the app is focused and the
// viewed workspace currently shows "working". Idle ticks are a cheap store read.
const SWEEP_MS = 5000;

/**
 * Pumps the two activity producers into the activity store. Mount once near the
 * app root (see Layout). Decouples the producers (the terminal registry's
 * byte-path detector and the main-process Claude Code hook receiver) from the
 * store the same way useTabProcesses consumes subscribeStats.
 */
export const useActivityBridge = (): void => {
	useEffect(() => {
		const store = useActivityStore.getState();

		// Byte path + focus/dispose lifecycle, straight from the terminal registry.
		const offRegistry = subscribeActivity((event) => {
			switch (event.kind) {
				case "byte-working":
					store.setByteWorking(event.leafId, event.working);
					break;
				case "focus":
					store.acknowledgeLeaf(event.leafId);
					break;
				case "dispose":
					store.pruneLeaf(event.leafId);
					break;
			}
		});

		// Authoritative status from Claude Code lifecycle hooks, delivered by main
		// over IPC. Sessions are keyed by sessionId; resolve to the owning leaf.
		const offHooks = window.api.claude.onHookEvent((event) => {
			const leafId = getLeafIdForSession(event.sessionId);
			if (leafId) store.applyHook(leafId, event.event);
		});

		// Returning to the app acknowledges the pane you land back on, so a dot
		// that latched while the window was blurred clears on refocus — and verifies
		// the workspace against process ground truth, in case status drifted while
		// you were away (a session that died, a Stop hook lost mid-absence).
		const onWindowFocus = (): void => {
			useActivityStore.getState().acknowledgeActivePane();
			void reconcileWorkspaceActivity(getActiveView()?.wsId);
		};
		window.addEventListener("focus", onWindowFocus);

		const sweep = setInterval(() => {
			if (typeof document !== "undefined" && !document.hasFocus()) return;
			const wsId = getActiveView()?.wsId;
			if (!wsId) return;
			if (useActivityStore.getState().workspaceStatus[wsId] !== "working") return;
			void reconcileWorkspaceActivity(wsId);
		}, SWEEP_MS);

		return () => {
			offRegistry();
			offHooks();
			window.removeEventListener("focus", onWindowFocus);
			clearInterval(sweep);
		};
	}, []);
};
