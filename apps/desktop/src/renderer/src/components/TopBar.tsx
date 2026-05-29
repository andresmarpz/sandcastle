import { WorkspaceId } from "@sandcastle/contracts";
import { useParams } from "@tanstack/react-router";

import CaffeinateButton from "@/components/CaffeinateButton";
import TabBar from "@/components/TabBar";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const isMac =
	typeof navigator !== "undefined" && navigator.platform.toUpperCase().startsWith("MAC");

function TopBarTabs({
	wsId,
	tabId,
}: {
	wsId: string;
	tabId: string | undefined;
}): React.JSX.Element {
	// Tabs live in the local (persisted) store, so the strip renders immediately
	// without gating on the workspace RPC. New tabs spawn their terminals at the
	// workspace path, resolved from the workspace itself at render time.
	return <TabBar workspaceId={WorkspaceId.make(wsId)} activeTabId={tabId ?? ""} />;
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
