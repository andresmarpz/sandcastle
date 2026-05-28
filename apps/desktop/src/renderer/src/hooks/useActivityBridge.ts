import { useEffect } from "react";

import { getLeafIdForSession, subscribeActivity } from "@/lib/terminalRegistry";
import { useActivityStore } from "@/stores/activity";

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
		// that latched while the window was blurred clears on refocus.
		const onWindowFocus = (): void => useActivityStore.getState().acknowledgeActivePane();
		window.addEventListener("focus", onWindowFocus);

		return () => {
			offRegistry();
			offHooks();
			window.removeEventListener("focus", onWindowFocus);
		};
	}, []);
};
