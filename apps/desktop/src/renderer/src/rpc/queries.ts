import type { ProjectId } from "@sandcastle/contracts";

import { Client } from "@/rpc/client";

/**
 * The sidebar's per-project workspace list query.
 *
 * Centralized so anything that needs to imperatively refresh it — notably the
 * MCP teleport bridge, which creates workspaces out of band — reconstructs the
 * *exact* same atom the UI subscribes to. Query atoms are family-memoized by
 * structural key equality (tag + payload + reactivity keys), so an identical
 * call resolves to the same node; if the shape here drifts from the consumer,
 * the refresh would silently target a different node. One source of truth keeps
 * them in lockstep.
 */
export const workspacesListQuery = (projectId: ProjectId) =>
	Client.query(
		"workspaces.list",
		{ projectId },
		{ reactivityKeys: ["workspaces", projectId as string] },
	);
