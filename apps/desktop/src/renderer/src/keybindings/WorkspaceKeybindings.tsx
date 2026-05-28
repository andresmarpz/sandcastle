import type { WorkspaceId } from "@sandcastle/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { type Direction, focusPaneInDirection, resizePaneInDirection } from "@/lib/paneActions";
import { type TabId, useTabsStore } from "@/stores/tabs";

import type { KeybindingId } from "./registry";
import { useKeybinding } from "./useKeybinding";

type Props = {
	workspaceId: WorkspaceId;
	tabId: TabId;
};

const TAB_SWITCH_IDS = [
	"tab.switch.1",
	"tab.switch.2",
	"tab.switch.3",
	"tab.switch.4",
	"tab.switch.5",
	"tab.switch.6",
	"tab.switch.7",
	"tab.switch.8",
	"tab.switch.9",
] as const satisfies readonly KeybindingId[];

/**
 * Registers workspace-scoped keybindings:
 *   • Cmd+1..9 → switch to the Nth tab in the active workspace (no-op if absent)
 *   • Cmd+Arrow → focus the adjacent pane
 *   • Cmd+Shift+Arrow → resize the focused pane
 *
 * Mounted inside WorkspaceView so it only registers while a workspace+tab is
 * active. Hotkeys are auto-unregistered on unmount via useHotkey.
 */
function WorkspaceKeybindings({ workspaceId, tabId }: Props): null {
	const navigate = useNavigate();
	const tabs = useTabsStore((s) => s.byWorkspace[workspaceId as string]?.tabs);
	const tree = tabs?.find((t) => t.id === tabId)?.tree;

	const switchToIndex = useCallback(
		(index: number): void => {
			const t = tabs?.[index];
			if (!t) return;
			void navigate({
				to: "/workspaces/$wsId/tabs/$tabId",
				params: { wsId: workspaceId as string, tabId: t.id },
			});
		},
		[tabs, workspaceId, navigate],
	);

	// Tab switching — registered statically so the registry always knows about
	// all 9 bindings even if fewer tabs exist. Handlers no-op when the slot is
	// empty.
	useKeybinding(TAB_SWITCH_IDS[0], () => switchToIndex(0));
	useKeybinding(TAB_SWITCH_IDS[1], () => switchToIndex(1));
	useKeybinding(TAB_SWITCH_IDS[2], () => switchToIndex(2));
	useKeybinding(TAB_SWITCH_IDS[3], () => switchToIndex(3));
	useKeybinding(TAB_SWITCH_IDS[4], () => switchToIndex(4));
	useKeybinding(TAB_SWITCH_IDS[5], () => switchToIndex(5));
	useKeybinding(TAB_SWITCH_IDS[6], () => switchToIndex(6));
	useKeybinding(TAB_SWITCH_IDS[7], () => switchToIndex(7));
	useKeybinding(TAB_SWITCH_IDS[8], () => switchToIndex(8));

	// Pane navigation
	const onNav = (dir: Direction) => (): void => {
		focusPaneInDirection(dir);
	};
	useKeybinding("pane.nav.up", onNav("up"));
	useKeybinding("pane.nav.down", onNav("down"));
	useKeybinding("pane.nav.left", onNav("left"));
	useKeybinding("pane.nav.right", onNav("right"));

	// Pane resize — needs the tree to walk the path from focused leaf to root
	const onResize = (dir: Direction) => (): void => {
		if (!tree) return;
		resizePaneInDirection(tree, dir);
	};
	useKeybinding("pane.resize.up", onResize("up"));
	useKeybinding("pane.resize.down", onResize("down"));
	useKeybinding("pane.resize.left", onResize("left"));
	useKeybinding("pane.resize.right", onResize("right"));

	return null;
}

export default WorkspaceKeybindings;
