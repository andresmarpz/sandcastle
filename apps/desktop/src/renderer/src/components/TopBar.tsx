import { useAtomValue } from "@effect/atom-react";
import { WorkspaceId } from "@sandcastle/contracts";
import { useParams } from "@tanstack/react-router";

import CaffeinateButton from "@/components/CaffeinateButton";
import TabBar from "@/components/TabBar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Client } from "@/rpc/client";

const isMac =
	typeof navigator !== "undefined" && navigator.platform.toUpperCase().startsWith("MAC");

function TopBarTabs({
	wsId,
	tabId,
}: {
	wsId: string;
	tabId: string | undefined;
}): React.JSX.Element | null {
	const workspaceId = WorkspaceId.make(wsId);
	const workspaceResult = useAtomValue(
		Client.query("workspaces.get", { workspaceId }, { reactivityKeys: ["workspaces", wsId] }),
	);
	if (workspaceResult._tag !== "Success") return null;
	const defaultCwd = workspaceResult.value.path as unknown as string;
	return <TabBar workspaceId={workspaceId} activeTabId={tabId ?? ""} defaultCwd={defaultCwd} />;
}

function TopBar(): React.JSX.Element {
	const params = useParams({ strict: false }) as { wsId?: string; tabId?: string };

	return (
		<header
			className={cn(
				"drag flex h-9 w-full shrink-0 items-center gap-1 pr-2",
				isMac ? "pl-19.5" : "pl-2",
			)}
		>
			<SidebarTrigger className="no-drag" />
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
