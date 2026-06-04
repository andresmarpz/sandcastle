import type { WorkspaceId } from "@sandcastle/contracts";
import { useEffect } from "react";

import WorkspaceKeybindings from "@/keybindings/WorkspaceKeybindings";
import { reconcileWorkspaceActivity } from "@/lib/activityReconcile";
import { collectLeafIds } from "@/lib/paneTree";
import { focusTerminal } from "@/lib/terminalRegistry";
import { useActivityStore } from "@/stores/activity";
import { type TabId, useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
};

/**
 * Route component for `/workspaces/$wsId/tabs/$tabId`.
 *
 * The terminals themselves are mounted by the persistent `TerminalHost` (in
 * `Layout`) so they survive navigation. This component owns only the
 * route-scoped concerns: workspace keybindings, mirroring the URL into the tabs
 * store (which also records the landing workspace), and restoring pane focus on
 * a workspace/tab switch. It renders no visible box — the host paints behind it.
 */
function WorkspaceView({ workspaceId, tabId }: Props): React.JSX.Element {
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setActiveLeaf = useTabsStore((s) => s.setActiveLeaf);

	// Mirror the URL into the store so switching workspaces remembers the last tab
	// the user was actually on (createTab/closeTab alone leave activeTabId stale
	// once the user navigates between tabs), and persists the landing workspace.
	useEffect(() => {
		setActiveTab(workspaceId, tabId);
		// Viewing a workspace clears its latched done/needs-attention status...
		useActivityStore.getState().acknowledgeWorkspace(workspaceId as string);
		// ...and verifies the dot against process ground truth in case it drifted —
		// a Stop hook that never landed, or a "working" lost during a teleport.
		// Deferred so a freshly-attached pane has a live PTY for the probe to read.
		const reconcileTimer = setTimeout(
			() => void reconcileWorkspaceActivity(workspaceId as string),
			600,
		);
		return () => clearTimeout(reconcileTimer);
	}, [workspaceId, tabId, setActiveTab]);

	// Restore pane focus after a workspace/tab switch. The host attaches the active
	// tab's terminals (only the active tab self-focuses); we override on the next
	// frame so the *remembered* leaf wins rather than whichever pane attached last.
	// Read state imperatively so this runs only on workspace/tab switch — not every
	// time the user clicks a different pane and bumps activeLeafId.
	useEffect(() => {
		const current = useTabsStore
			.getState()
			.byWorkspace[workspaceId as string]?.tabs.find((t) => t.id === tabId);
		if (!current) return;
		const leaves = collectLeafIds(current.tree);
		if (leaves.length === 0) return;
		const target =
			current.activeLeafId && leaves.includes(current.activeLeafId)
				? current.activeLeafId
				: leaves[0];
		if (target !== current.activeLeafId) {
			setActiveLeaf(workspaceId, tabId, target);
		}
		const frame = requestAnimationFrame(() => focusTerminal(target));
		return () => cancelAnimationFrame(frame);
	}, [workspaceId, tabId, setActiveLeaf]);

	return <WorkspaceKeybindings workspaceId={workspaceId} tabId={tabId} />;
}

export default WorkspaceView;
