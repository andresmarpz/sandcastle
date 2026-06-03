import { ProjectId, WorkspaceId } from "@sandcastle/contracts";

import { reconcileWorkspaceActivity } from "@/lib/activityReconcile";
import { collectLeafIds, makeLeaf, splitLeaf } from "@/lib/paneTree";
import {
	focusTerminal,
	getLeafIdBySession,
	getTeleportedCwd,
	getTerminalCwd,
	setTeleportedCwd,
} from "@/lib/terminalRegistry";
import { router } from "@/router";
import { workspacesListQuery } from "@/rpc/queries";
import { appRegistry } from "@/rpc/registry";
import { useActivityStore } from "@/stores/activity";
import { useTabsStore } from "@/stores/tabs";

// Derived from the globally-typed preload API so we don't import across bundles.
type McpCommand = Parameters<Parameters<typeof window.api.mcp.onCommand>[0]>[0];

/**
 * Renderer half of the MCP integration. The in-process MCP server (main) sends
 * `mcp:command`s for the terminal that issued an MCP tool call; we apply the UI
 * mutation against the tabs store + terminal registry and reply with the result.
 *
 * All state lives in Zustand / the terminal registry (singletons), so this is a
 * plain module — no React needed; navigation uses the router singleton.
 */

type Located = { wsId: string; tabId: string; leafId: string };

/** Find which workspace/tab currently holds the pane for a PTY session. */
const locate = (sessionId: string): Located | null => {
	const leafId = getLeafIdBySession(sessionId);
	if (!leafId) return null;
	const byWorkspace = useTabsStore.getState().byWorkspace;
	for (const [wsId, ws] of Object.entries(byWorkspace)) {
		for (const tab of ws.tabs) {
			if (collectLeafIds(tab.tree).includes(leafId)) {
				return { wsId, tabId: tab.id, leafId };
			}
		}
	}
	return null;
};

const navigateToTab = (wsId: string, tabId: string): void => {
	void router.navigate({
		to: "/workspaces/$wsId/tabs/$tabId",
		params: { wsId, tabId },
	});
};

/** The workspace/tab the user is currently viewing, parsed from the route. */
const currentRoute = (): { wsId: string; tabId: string } | null => {
	const m = /^\/workspaces\/([^/]+)\/tabs\/([^/]+)/.exec(router.state.location.pathname);
	return m?.[1] && m[2] ? { wsId: m[1], tabId: m[2] } : null;
};

const handle = async (cmd: McpCommand): Promise<unknown> => {
	const loc = locate(cmd.sessionId);
	const store = useTabsStore.getState();

	// A deleted workspace (worktree removed) — drop its tab state and refresh the
	// sidebar. Runs even when the calling terminal has already moved out or closed,
	// so it must not depend on `loc`.
	if (cmd.kind === "workspace-removed") {
		const removed = cmd.targetWorkspaceId;
		if (!removed) return { removed: false };
		// If the user is looking at the workspace that just vanished, follow the
		// calling terminal to wherever it now lives (teleported back to originalCwd).
		const cur = currentRoute();
		if (cur?.wsId === removed && loc) {
			navigateToTab(loc.wsId, loc.tabId);
			requestAnimationFrame(() => focusTerminal(loc.leafId));
		}
		store.removeWorkspace(WorkspaceId.make(removed));
		if (cmd.targetProjectId) {
			appRegistry.refresh(workspacesListQuery(ProjectId.make(cmd.targetProjectId)));
		}
		return { removed: true };
	}

	if (!loc) throw new Error("calling terminal is not attached to any workspace tab");
	const wsId = WorkspaceId.make(loc.wsId);

	switch (cmd.kind) {
		case "whoami": {
			const cwd = await getTerminalCwd(loc.leafId);
			return { workspaceId: loc.wsId, tabId: loc.tabId, leafId: loc.leafId, cwd };
		}

		case "split": {
			const orientation = cmd.orientation ?? "horizontal";
			// Prefer a teleport destination over the live PTY cwd: after a worktree
			// teleport the shell still sits in the origin dir, so the live cwd would
			// drag the split back there. See setTeleportedCwd.
			const cwd =
				cmd.cwd ?? getTeleportedCwd(loc.leafId) ?? (await getTerminalCwd(loc.leafId)) ?? undefined;
			const newLeaf = makeLeaf(cwd);
			store.updateTree(wsId, loc.tabId, (tree) =>
				splitLeaf(tree, loc.leafId, orientation, newLeaf),
			);
			store.setActiveLeaf(wsId, loc.tabId, newLeaf.id);
			return { newLeafId: newLeaf.id, orientation };
		}

		case "new-tab": {
			// Same teleport-aware resolution as split: a new tab from a teleported
			// pane should open in the workspace it was teleported into.
			const cwd = cmd.cwd ?? getTeleportedCwd(loc.leafId) ?? (await getTerminalCwd(loc.leafId));
			if (!cwd) throw new Error("could not resolve a working directory for the new tab");
			const tabId = store.createTab(wsId, cwd);
			if (cmd.focus !== false) navigateToTab(loc.wsId, tabId);
			return { tabId };
		}

		case "teleport": {
			const target = cmd.targetWorkspaceId;
			if (!target) throw new Error("missing target workspace");
			if (target === loc.wsId) return { moved: false, workspaceId: target };
			// Capture whether the user is actually looking at this tab BEFORE the
			// move — a background pane entering a worktree must not yank the view.
			const cur = currentRoute();
			const onScreen = cur?.wsId === loc.wsId && cur?.tabId === loc.tabId;
			const moved = store.moveTabToWorkspace(wsId, loc.tabId, WorkspaceId.make(target));
			// The activity rollup is folded per-workspace from its tabs' leaves, but
			// the move changes membership without touching any leaf's own status — so
			// re-fold both ends, else the status dot would stay stranded on the old
			// workspace and never light up on the new one.
			if (moved) {
				useActivityStore.getState().recomputeWorkspaces([loc.wsId, target]);
				// Entering a worktree often coincides with claude re-rooting / tool
				// churn that drops the "working" signal at exactly the wrong moment.
				// Verify the destination against process ground truth shortly after so
				// its dot reflects reality rather than the value at the move instant.
				setTimeout(() => void reconcileWorkspaceActivity(target), 600);
			}
			// The shell PTY doesn't follow Claude into the worktree, so its live cwd
			// would resolve splits/new-tabs back to the origin workspace. Remember
			// where we teleported so those spawn in the destination instead.
			if (moved && cmd.targetPath) setTeleportedCwd(loc.leafId, cmd.targetPath);
			// The destination workspace may have just been created server-side by
			// main's upsert, which posts straight to the relay and so never bumps the
			// sidebar's ["workspaces", projectId] reactivity key. Refresh that exact
			// query so the new workspace row (and its now-non-empty tab list) shows
			// without a reload. Harmless if the workspace already existed.
			if (moved && cmd.targetProjectId) {
				appRegistry.refresh(workspacesListQuery(ProjectId.make(cmd.targetProjectId)));
			}
			// Follow only when the user is looking at this exact tab: push the route
			// to the new workspace and refocus the terminal. Otherwise leave the view
			// put — the workspace now shows in the sidebar for the user to pick.
			if (moved && onScreen) {
				navigateToTab(target, loc.tabId);
				requestAnimationFrame(() => focusTerminal(loc.leafId));
			}
			return { moved, workspaceId: target, followed: moved && onScreen };
		}

		default:
			throw new Error(`unknown command: ${(cmd as { kind: string }).kind}`);
	}
};

let installed = false;

export const installMcpBridge = (): void => {
	if (installed) return;
	if (!window.api?.mcp) return;
	installed = true;
	window.api.mcp.onCommand((cmd) => {
		void handle(cmd)
			.then((data) => window.api.mcp.respond(cmd.requestId, true, data))
			.catch((err: unknown) =>
				window.api.mcp.respond(cmd.requestId, false, undefined, String(err)),
			);
	});
};
