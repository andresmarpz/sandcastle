import { useAtomValue } from "@effect/atom-react";
import type { WorkspaceId } from "@sandcastle/contracts";
import { Cause } from "effect";
import { useEffect } from "react";

import PaneTree from "@/components/PaneTree";
import WorkspaceKeybindings from "@/keybindings/WorkspaceKeybindings";
import { reconcileWorkspaceActivity } from "@/lib/activityReconcile";
import { collectLeafIds } from "@/lib/paneTree";
import { focusTerminal } from "@/lib/terminalRegistry";
import { workspaceGetQuery } from "@/rpc/queries";
import { useActivityStore } from "@/stores/activity";
import { type TabId, useTabsStore } from "@/stores/tabs";

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
};

function WorkspaceView({ workspaceId, tabId }: Props): React.JSX.Element {
	const workspaceResult = useAtomValue(workspaceGetQuery(workspaceId));

	const tab = useTabsStore((s) =>
		s.byWorkspace[workspaceId as string]?.tabs.find((t) => t.id === tabId),
	);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setActiveLeaf = useTabsStore((s) => s.setActiveLeaf);

	// Mirror the URL into the store so switching workspaces remembers the last
	// tab the user was actually on (createTab/closeTab alone leave activeTabId
	// stale once the user navigates between tabs via clicks or Cmd+1..9).
	useEffect(() => {
		setActiveTab(workspaceId, tabId);
		// Viewing a workspace clears its latched done/needs-attention status.
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

	// Restore pane focus after the tab mounts. The terminal registry attaches
	// inside Terminal's effect and self-focuses; we override on the next frame
	// so the *remembered* leaf wins rather than whichever Terminal mounted last.
	// Read state imperatively so this runs only on workspace/tab switch — not
	// every time the user clicks a different pane and bumps activeLeafId.
	useEffect(() => {
		const ws = useTabsStore.getState().byWorkspace[workspaceId as string];
		const current = ws?.tabs.find((t) => t.id === tabId);
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

	if (workspaceResult._tag === "Initial") {
		return <p className="p-4 text-xs text-muted-foreground">Loading workspace…</p>;
	}
	if (workspaceResult._tag === "Failure") {
		return <p className="p-4 text-xs text-destructive">{Cause.pretty(workspaceResult.cause)}</p>;
	}
	if (!tab) {
		return <p className="p-4 text-xs text-muted-foreground">Tab not found</p>;
	}

	const defaultCwd = workspaceResult.value.path as unknown as string;

	return (
		<div className="min-h-0 flex-1">
			<WorkspaceKeybindings workspaceId={workspaceId} tabId={tabId} />
			<PaneTree workspaceId={workspaceId} tabId={tabId} defaultCwd={defaultCwd} />
		</div>
	);
}

export default WorkspaceView;
