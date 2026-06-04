import { type Project, type ProjectId, type Workspace, WorkspaceId } from "@sandcastle/contracts";
import { Effect } from "effect";
import type { Atom } from "effect/unstable/reactivity";
import { AtomRegistry } from "effect/unstable/reactivity";

import { collectLeafIds } from "@/lib/paneTree";
import { whenTerminalReady } from "@/lib/terminalRegistry";
import { router } from "@/router";
import { projectsListQuery, workspaceGetQuery, workspacesListQuery } from "@/rpc/queries";
import { appRegistry } from "@/rpc/registry";
import { usePrStatusStore } from "@/stores/prStatus";
import { useStartupStore } from "@/stores/startup";
import { type TabId, useTabsStore } from "@/stores/tabs";

/**
 * Startup orchestrator — owns app bring-up (replaces the old `lib/prefetch.ts`).
 *
 * On launch it: warms the projects/workspaces read graph (gating), re-establishes
 * the session-lifetime keep-warm + focus-revalidation subscriptions, restores the
 * last-active workspace, reaps dead PTYs and reattaches surviving ones, then —
 * concurrently — warms every worktree's sidebar PR badge and waits for the
 * landing workspace's active terminals to first-paint, before flipping the
 * startup phase to `ready` so `main.tsx` lifts the LoadingScreen. A hard boot
 * timeout guarantees the overlay always lifts, even with a down server or a
 * silent shell.
 *
 * The query atoms are family-memoized + keepAlive (see `rpc/queries.ts`), so
 * everything warmed here against the shared `appRegistry` is the exact node the
 * React tree later subscribes to.
 */

// How long the data-warm cascade may run before we give up and reveal anyway.
const DATA_TIMEOUT_MS = 4000;
// Per-step insurance bound on the PR-badge warm — matches `gh`'s own per-call
// timeout (one round-trip). The absolute boot failsafe below still caps the
// user-visible wait; this only stops `runStartup`'s chain hanging on a wedged
// IPC channel that never replies.
const PR_TIMEOUT_MS = 8000;
// Absolute failsafe: the loading screen always lifts within this window, even if
// a gating step (data, PRs, terminal paint) is still running.
const BOOT_TIMEOUT_MS = 6000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── keep-warm (session-lifetime, ongoing) ───────────────────────────────────
// Ported from the old prefetcher. Reactive subscriptions so projects/workspaces
// created later (including out of band via the MCP teleport bridge) warm
// automatically, plus window-focus stale-while-revalidate over everything warmed.

// Every atom we've warmed, so window-focus revalidation can refresh them all.
const tracked = new Set<Atom.Atom<unknown>>();
// Dedupe keys for the dynamic (per-project / per-workspace) layers so a re-fired
// list subscription doesn't stack redundant subscriptions/mounts.
const warmed = new Set<string>();

let keepWarmInstalled = false;
let focusInstalled = false;
let started = false;

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

const installKeepWarm = (): void => {
	if (keepWarmInstalled) return;
	keepWarmInstalled = true;
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
};

/**
 * Stale-while-revalidate trigger: when the window regains visibility, refresh
 * every warmed atom. keepAlive keeps the last `Success` on screen while the
 * refresh runs (`AsyncResult` flips to `waiting: true` carrying the stale
 * value), so nothing blanks. Throttled so a burst of focus/visibility events
 * fires at most one refresh sweep.
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

// ── gating: warm the server read graph ──────────────────────────────────────
// projects.list ─▶ for each project: workspaces.list ─▶ for each ws: workspaces.get
// Each layer is recovered to an empty default so one failure doesn't abort the
// cascade; the whole thing is time-boxed and its result discarded.

const warmServerData = async (): Promise<void> => {
	const cascade = Effect.gen(function* () {
		const projects = yield* AtomRegistry.getResult(appRegistry, projectsListQuery()).pipe(
			Effect.orElseSucceed(() => [] as readonly Project[]),
		);
		yield* Effect.forEach(
			projects,
			(project) =>
				Effect.gen(function* () {
					const workspaces = yield* AtomRegistry.getResult(
						appRegistry,
						workspacesListQuery(project.id),
					).pipe(Effect.orElseSucceed(() => [] as readonly Workspace[]));
					yield* Effect.forEach(
						workspaces,
						(ws) =>
							AtomRegistry.getResult(appRegistry, workspaceGetQuery(ws.id)).pipe(Effect.ignore),
						{ concurrency: "unbounded", discard: true },
					);
				}),
			{ concurrency: "unbounded", discard: true },
		);
	});
	await Effect.runPromise(cascade.pipe(Effect.timeout(DATA_TIMEOUT_MS), Effect.ignore));
};

// ── gating: warm PR badges ───────────────────────────────────────────────────
// Each worktree row in the sidebar shows a PR badge fetched over IPC (main owns
// the `gh` call + caching, capped at 4 concurrent spawns). Left ungated these
// trickle in one by one *after* the loading screen lifts. So once the read graph
// is warm we resolve every worktree's PR status into the renderer cache up front
// and gate the reveal on it — bounded, with the boot failsafe backstopping a
// total hang. Reads the already-warmed projects/workspaces straight from the
// registry (no re-fetch); writes feed the same `prStatus` store the rows read.

const allWorktreeWorkspaces = (): Workspace[] => {
	const projects = appRegistry.get(projectsListQuery());
	if (projects._tag !== "Success") return [];
	const out: Workspace[] = [];
	for (const project of projects.value) {
		const list = appRegistry.get(workspacesListQuery(project.id));
		if (list._tag !== "Success") continue;
		for (const ws of list.value) {
			if (ws.kind === "worktree" && ws.branch !== null) out.push(ws);
		}
	}
	return out;
};

const warmPrStatuses = async (): Promise<void> => {
	const github = window.api?.github;
	if (!github) return;
	const workspaces = allWorktreeWorkspaces();
	if (workspaces.length === 0) return;
	const setStatus = usePrStatusStore.getState().set;
	const loads = workspaces.map((ws) => {
		const repoPath = ws.path as string;
		return github
			.prStatus({ repoPath, branch: ws.branch as string })
			.then((status) => setStatus(repoPath, status))
			.catch(() => {
				// `gh` unreachable for this worktree — leave it unresolved; the row's
				// own focus revalidation will retry later. Never blocks the reveal.
			});
	});
	// Bounded: a slow/hung `gh` can't trap the user behind the loading screen.
	await Promise.race([Promise.all(loads), delay(PR_TIMEOUT_MS)]);
};

// ── landing-workspace restore ────────────────────────────────────────────────

type Landing = { wsId: WorkspaceId; tabId: TabId; activeLeafIds: string[] };

const restoreLanding = (): Landing | null => {
	const lastId = useTabsStore.getState().lastActiveWorkspaceId;
	if (!lastId) return null;
	const wsId = WorkspaceId.make(lastId);
	// Only land on a workspace that actually warmed (i.e. still exists). If its
	// workspaces.get isn't Success, fall back to the index route.
	if (appRegistry.get(workspaceGetQuery(wsId))._tag !== "Success") return null;
	// Materialize the default tab/leaf if the persisted store has none.
	const tabId = useTabsStore.getState().ensureTab(wsId);
	const tab = useTabsStore.getState().byWorkspace[lastId]?.tabs.find((t) => t.id === tabId);
	const activeLeafIds = tab ? collectLeafIds(tab.tree) : [];
	void router.navigate({
		to: "/workspaces/$wsId/tabs/$tabId",
		params: { wsId: lastId, tabId },
	});
	return { wsId, tabId, activeLeafIds };
};

// ── PTY protect + reattach ───────────────────────────────────────────────────

// The union of every leafId across every workspace/tab. Reported to main so it
// reaps abduco servers for leaves closed while the app was down — MUST be the
// full union (a subset would kill live servers). Computed only after the tabs
// store has rehydrated (synchronous localStorage, so by the time we run).
const allLeafIds = (): string[] =>
	Object.values(useTabsStore.getState().byWorkspace)
		.flatMap((w) => w.tabs)
		.flatMap((t) => collectLeafIds(t.tree));

// Every leaf the host will mount for the landing workspace (all of its tabs).
const landingWorkspaceLeaves = (wsId: string): string[] =>
	(useTabsStore.getState().byWorkspace[wsId]?.tabs ?? []).flatMap((t) => collectLeafIds(t.tree));

const protectAndReattachPtys = async (excludeLeafIds: readonly string[]): Promise<void> => {
	const api = window.api?.terminal;
	if (!api) return;
	const union = allLeafIds();
	// Reap orphaned servers (leaves closed while down). Live servers are protected
	// because `union` covers every still-persisted leaf.
	api.reportActiveLeaves(union);
	// Headlessly reattach surviving sessions so their processes stay live and
	// repaint when later opened. Skip the landing workspace's leaves — the host
	// mounts those (a full <Terminal>), and a concurrent headless create() would
	// race main's create handler into spawning a duplicate abduco client.
	const reattachable = await api.reattachable?.(union);
	if (!reattachable || reattachable.length === 0) return;
	const excluded = new Set(excludeLeafIds);
	for (const leafId of reattachable) {
		if (excluded.has(leafId)) continue;
		void api.create({ id: `term-${leafId}`, leafId });
	}
};

// ── orchestrator ─────────────────────────────────────────────────────────────

export const runStartup = async (): Promise<void> => {
	if (started) return;
	started = true;

	// Hard failsafe: never trap the user behind the loading screen, whatever hangs
	// (down server, wedged shell, stuck IPC). setReady is idempotent.
	const failsafe = setTimeout(() => useStartupStore.getState().setReady(), BOOT_TIMEOUT_MS);

	try {
		// 1. Warm server data (gating).
		await warmServerData();

		// 2. Keep-warm subscriptions + focus revalidation (ongoing).
		installKeepWarm();
		installFocusRevalidation();

		// 3. Restore the landing workspace.
		const landing = restoreLanding();

		// 4. Protect + reattach PTYs (best-effort; creates fire without awaiting).
		const excluded = landing ? landingWorkspaceLeaves(landing.wsId as string) : [];
		await protectAndReattachPtys(excluded);

		// 5. Both gating, both independent: warm every worktree's PR badge AND
		//    await the landing workspace's terminals' first paint. Race them in
		//    parallel so bring-up is bounded by the slower of the two, not the sum.
		const landingPaint =
			landing && landing.activeLeafIds.length > 0
				? Promise.race([
						Promise.all(landing.activeLeafIds.map((id) => whenTerminalReady(id))),
						delay(BOOT_TIMEOUT_MS),
					])
				: Promise.resolve();
		await Promise.all([warmPrStatuses(), landingPaint]);
	} catch {
		// Best-effort: any unexpected failure still reveals the app below.
	} finally {
		clearTimeout(failsafe);
		// 6. Reveal.
		useStartupStore.getState().setReady();
	}
};
