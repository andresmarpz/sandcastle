import type { ProjectId, WorkspaceId } from "@sandcastle/contracts";
import type { Atom } from "effect/unstable/reactivity";

import { projectsListQuery, workspaceGetQuery, workspacesListQuery } from "@/rpc/queries";
import { appRegistry } from "@/rpc/registry";

/**
 * Startup prefetch + stale-while-revalidate for server state.
 *
 * Runs once at boot (called from `main.tsx`, like `installMcpBridge`) against
 * the shared `appRegistry` singleton — the same registry the React tree uses,
 * so everything warmed here is the *exact* node a component later subscribes
 * to. It walks the read graph eagerly:
 *
 *   projects.list ─▶ for each project: workspaces.list ─▶ for each ws: workspaces.get
 *
 * The query atoms are keepAlive (see `rpc/queries.ts`), so once warmed they
 * stay resident for the session. The payoff: by the time the user clicks a
 * workspace, its `workspaces.get` is already `Success`, so `WorkspaceRedirect`
 * redirects instantly and `WorkspaceView` renders with no "Opening workspace…".
 *
 * The list subscriptions are reactive, so projects/workspaces created later
 * (including out of band via the MCP teleport bridge) are warmed automatically.
 *
 * Subscriptions/mounts are intentionally never torn down — this is a permanent,
 * app-lifetime warm cache. `keepAlive` would keep the nodes anyway; holding the
 * subscriptions also lets us drive revalidation.
 */

// Every atom we've warmed, so window-focus revalidation can refresh them all.
const tracked = new Set<Atom.Atom<unknown>>();
// Dedupe keys for the dynamic (per-project / per-workspace) layers so a re-fired
// list subscription doesn't stack redundant subscriptions/mounts.
const warmed = new Set<string>();

let started = false;
let focusInstalled = false;

const warmWorkspaceGet = (workspaceId: WorkspaceId): void => {
	const key = `get:${workspaceId as string}`;
	if (warmed.has(key)) return;
	warmed.add(key);
	const atom = workspaceGetQuery(workspaceId);
	tracked.add(atom);
	appRegistry.mount(atom);
};

const warmWorkspacesList = (projectId: ProjectId): void => {
	const key = `list:${projectId as string}`;
	if (warmed.has(key)) return;
	warmed.add(key);
	const atom = workspacesListQuery(projectId);
	tracked.add(atom);
	appRegistry.subscribe(
		atom,
		(result) => {
			if (result._tag !== "Success") return;
			for (const ws of result.value) warmWorkspaceGet(ws.id);
		},
		{ immediate: true },
	);
};

/**
 * Stale-while-revalidate trigger: when the window regains visibility, refresh
 * every warmed atom. keepAlive keeps the last `Success` on screen while the
 * refresh runs (`AsyncResult` flips to `waiting: true` carrying the stale
 * value), so nothing blanks. Throttled so a burst of focus/visibility events
 * fires at most one refresh sweep. Mirrors `Atom.refreshOnWindowFocus`, done
 * imperatively so we reuse the identical atoms instead of minting new ones.
 */
const installFocusRevalidation = (): void => {
	if (focusInstalled) return;
	focusInstalled = true;
	let last = 0;
	const onVisibility = (): void => {
		if (document.visibilityState !== "visible") return;
		const now = Date.now();
		if (now - last < 1000) return;
		last = now;
		for (const atom of tracked) appRegistry.refresh(atom);
	};
	document.addEventListener("visibilitychange", onVisibility);
};

export const startPrefetch = (): void => {
	if (started) return;
	started = true;

	const projects = projectsListQuery();
	tracked.add(projects);
	appRegistry.subscribe(
		projects,
		(result) => {
			if (result._tag !== "Success") return;
			for (const project of result.value) warmWorkspacesList(project.id);
		},
		{ immediate: true },
	);

	installFocusRevalidation();
};
