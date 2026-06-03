import type { ProjectId, WorkspaceId } from "@sandcastle/contracts";
import { Duration } from "effect";

import { Client } from "@/rpc/client";

/**
 * Centralized server-state query atoms — the single source of truth for every
 * read the UI performs. Two invariants make this file load-bearing:
 *
 * 1. **Identity.** Query atoms are family-memoized by structural key equality
 *    (tag + payload + reactivityKeys + timeToLive + serializationKey). Anything
 *    that wants the *same* cache node — the components that render it, the MCP
 *    bridge that imperatively refreshes it, the startup prefetcher that warms
 *    it — must reconstruct the call identically. If a call site drifts (e.g.
 *    omits `timeToLive`), it silently resolves to a *different* node: a second
 *    fetch, a second cache entry, and refreshes that miss. Route every read
 *    through these builders so they stay in lockstep.
 *
 * 2. **Caching.** `timeToLive: Duration.infinity` maps to `Atom.keepAlive` in
 *    `AtomRpc` (a finite duration would map to `Atom.setIdleTTL`). The renderer
 *    registry's `defaultIdleTTL` (see `rpc/registry.ts`) otherwise disposes an
 *    atom shortly after its last React subscriber unmounts — so navigating away
 *    and back would re-fetch from `Initial` and flash a loader. keepAlive keeps
 *    the last `Success` resident for the session; `AsyncResult` carries the
 *    stale value (with `waiting: true`) across refreshes, giving us
 *    stale-while-revalidate for free. `lib/prefetch.ts` warms these at startup
 *    and revalidates them on window focus.
 */

/** All projects, ordered. Reactivity key: `["projects"]`. */
export const projectsListQuery = () =>
	Client.query(
		"projects.list",
		{},
		{ reactivityKeys: ["projects"], timeToLive: Duration.infinity },
	);

/**
 * The sidebar's per-project workspace list. Reactivity key:
 * `["workspaces", projectId]` — shared with the create/delete mutations and the
 * MCP teleport bridge so out-of-band changes refresh this exact node.
 */
export const workspacesListQuery = (projectId: ProjectId) =>
	Client.query(
		"workspaces.list",
		{ projectId },
		{ reactivityKeys: ["workspaces", projectId as string], timeToLive: Duration.infinity },
	);

/**
 * A single workspace by id, used by the route's redirect + view. Reactivity key
 * `["workspaces", workspaceId]` so a delete of this workspace invalidates it.
 * Prefetched per workspace at startup so opening one never blocks on a fetch.
 */
export const workspaceGetQuery = (workspaceId: WorkspaceId) =>
	Client.query(
		"workspaces.get",
		{ workspaceId },
		{ reactivityKeys: ["workspaces", workspaceId as string], timeToLive: Duration.infinity },
	);
