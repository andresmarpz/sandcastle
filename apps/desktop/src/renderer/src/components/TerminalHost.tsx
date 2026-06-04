import { useAtomValue } from "@effect/atom-react";
import { WorkspaceId } from "@sandcastle/contracts";
import { useParams } from "@tanstack/react-router";

import PaneTree from "@/components/PaneTree";
import { workspaceGetQuery } from "@/rpc/queries";
import { useTabsStore } from "@/stores/tabs";

/**
 * Persistent terminal host.
 *
 * Rendered by `Layout` (which wraps `<Outlet/>` and never unmounts across route
 * changes), so the active workspace's terminals stay mounted while the user flips
 * between tabs, detours to /settings, or visits the index — eliminating the React
 * remount + re-fit + forced repaint that a routed `<PaneTree>` paid on every
 * switch.
 *
 * Mount scope is bounded to the ACTIVE workspace: all of its tabs are mounted
 * (hidden ones via `display:none` — a pure CSS toggle, no unmount), while other
 * workspaces' terminals stay warm in the module registry (`terminalRegistry`) and
 * reattach on demand when their workspace is opened.
 */

function WorkspaceTerminals({
	wsId,
	visible,
	routeTabId,
}: {
	wsId: WorkspaceId;
	visible: boolean;
	routeTabId: string | undefined;
}): React.JSX.Element | null {
	const workspaceResult = useAtomValue(workspaceGetQuery(wsId));
	const tabs = useTabsStore((s) => s.byWorkspace[wsId as string]?.tabs);
	const storeActiveTabId = useTabsStore((s) => s.byWorkspace[wsId as string]?.activeTabId);

	// We need the workspace path to spawn terminals at the right cwd.
	// WorkspaceRedirect gates navigation on Success, so by the time a tab route
	// renders this is resolved; if not (e.g. a just-deleted workspace), render
	// nothing rather than spawn shells at $HOME.
	if (workspaceResult._tag !== "Success") return null;
	if (!tabs || tabs.length === 0) return null;

	const defaultCwd = workspaceResult.value.path as unknown as string;
	// The route's tabId is the source of truth for what's visible; fall back to the
	// store's activeTabId (e.g. on a bare /workspaces/$wsId before the redirect).
	const activeTabId =
		routeTabId && tabs.some((t) => t.id === routeTabId)
			? routeTabId
			: (storeActiveTabId ?? tabs[0].id);

	return (
		<div className="absolute inset-0" style={{ display: visible ? undefined : "none" }}>
			{tabs.map((tab) => {
				const isActive = tab.id === activeTabId;
				return (
					// Hidden tabs are display:none (not visibility:hidden) so they leave
					// layout flow entirely — react-resizable-panels bails on the zero
					// measured size and defers layout until reveal, when the container's
					// ResizeObserver fires once and fits.
					<div
						key={tab.id}
						className="absolute inset-0"
						style={{ display: isActive ? undefined : "none" }}
					>
						<PaneTree
							workspaceId={wsId}
							tabId={tab.id}
							defaultCwd={defaultCwd}
							autoFocus={visible && isActive}
						/>
					</div>
				);
			})}
		</div>
	);
}

function TerminalHost(): React.JSX.Element | null {
	const params = useParams({ strict: false }) as { wsId?: string; tabId?: string };

	// Retain the last workspace so its terminals stay mounted (and warm) across
	// detours to /settings or / (routes that carry no wsId). The route wins when
	// present; otherwise fall back to the persisted last-active workspace (kept up
	// to date by WorkspaceView's setActiveTab mirror) — a store read, so no ref.
	const lastActiveWorkspaceId = useTabsStore((s) => s.lastActiveWorkspaceId);
	const activeWsId = params.wsId ?? lastActiveWorkspaceId;
	if (!activeWsId) return null;

	// Hidden (display:none) on non-workspace routes; the routed view (ProjectsIndex
	// / SettingsRoute) shows instead, with the terminals kept warm underneath.
	const visible = params.wsId != null;

	return (
		// Keyed by workspace: switching workspaces unmounts the old PaneTrees (their
		// xterms detach into the warm registry) and mounts the new set — bounded
		// memory. A tab switch within a workspace is just the CSS toggle above.
		<WorkspaceTerminals
			key={activeWsId}
			wsId={WorkspaceId.make(activeWsId)}
			visible={visible}
			routeTabId={params.tabId}
		/>
	);
}

export default TerminalHost;
