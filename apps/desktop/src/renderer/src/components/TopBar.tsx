import { useAtomValue } from "@effect/atom-react";
import { WorkspaceId } from "@sandcastle/contracts";
import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";

import CaffeinateButton from "@/components/CaffeinateButton";
import TabBar from "@/components/TabBar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";

const isMac =
	typeof navigator !== "undefined" && navigator.platform.toUpperCase().startsWith("MAC");

// Last resolved filesystem path per workspace. A workspace's path is stable, so
// caching it lets us hand TabBar a correct default cwd synchronously when we
// switch back to a workspace (or render before workspaces.get resolves) instead
// of waiting on the RPC round-trip.
const workspacePathCache = new Map<string, string>();

function TopBarTabs({
	wsId,
	tabId,
}: {
	wsId: string;
	tabId: string | undefined;
}): React.JSX.Element {
	const workspaceId = WorkspaceId.make(wsId);
	const workspaceResult = useAtomValue(
		Client.query("workspaces.get", { workspaceId }, { reactivityKeys: ["workspaces", wsId] }),
	);
	const resolvedPath =
		workspaceResult._tag === "Success"
			? (workspaceResult.value.path as unknown as string)
			: undefined;

	useEffect(() => {
		if (resolvedPath !== undefined) workspacePathCache.set(wsId, resolvedPath);
	}, [wsId, resolvedPath]);

	// Tabs live in the local (persisted) store, so render the strip immediately
	// rather than gating on the workspace RPC. Blocking here blanks the tab strip
	// on every workspace switch, collapsing the flex row and shoving the
	// right-hand icons left until the query resolves — a visible flicker. The
	// query result only feeds the default cwd for newly created tabs.
	const defaultCwd = resolvedPath ?? workspacePathCache.get(wsId) ?? "";
	return <TabBar workspaceId={workspaceId} activeTabId={tabId ?? ""} defaultCwd={defaultCwd} />;
}

function TopBar(): React.JSX.Element {
	const params = useParams({ strict: false }) as { wsId?: string; tabId?: string };

	return (
		<header
			className={cn(
				"drag flex h-11 w-full shrink-0 items-center gap-1 bg-background pr-2",
				isMac ? "pl-[84px]" : "pl-2",
			)}
		>
			<SidebarTrigger className="no-drag text-foreground-tertiary" />
			{params.wsId ? (
				<TopBarTabs wsId={params.wsId} tabId={params.tabId} />
			) : (
				<div className="flex-1" />
			)}
			<CaffeinateButton />
			<ThemeSwitcher />
		</header>
	);
}

export default TopBar;
