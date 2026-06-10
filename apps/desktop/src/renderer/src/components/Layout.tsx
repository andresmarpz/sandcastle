import { useState } from "react";

import AppSidebar from "@/components/AppSidebar";
import DebugOverlay from "@/components/DebugOverlay";
import ReviewPanel from "@/components/ReviewPanel";
import SidebarResizeHandle from "@/components/SidebarResizeHandle";
import TerminalHost from "@/components/TerminalHost";
import TopBar from "@/components/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useActivityBridge } from "@/hooks/useActivityBridge";
import ProjectKeybindings from "@/keybindings/ProjectKeybindings";
import ReviewKeybindings from "@/keybindings/ReviewKeybindings";
import SidebarKeybindings from "@/keybindings/SidebarKeybindings";
import { cn } from "@/lib/utils";

const DEFAULT_SIDEBAR_WIDTH = 276;

type Props = {
	children: React.ReactNode;
};

function Layout({ children }: Props): React.JSX.Element {
	const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
	const [isResizing, setIsResizing] = useState(false);

	// Pump terminal + Claude-hook activity into the store for the app's lifetime.
	useActivityBridge();

	return (
		<SidebarProvider
			className={cn(
				"h-full min-h-0 flex-col bg-background",
				isResizing &&
					"[&_[data-slot=sidebar-gap]]:!transition-none [&_[data-slot=sidebar-container]]:!transition-none",
			)}
			style={
				{
					"--sidebar-width": `${sidebarWidth}px`,
				} as React.CSSProperties
			}
		>
			<TopBar />
			<main
				className="relative m-2 mt-0 flex w-auto min-h-0 flex-1 overflow-hidden rounded-[10px] bg-card shadow-elevated"
				style={{ contain: "layout" } as React.CSSProperties}
			>
				<AppSidebar />
				<SidebarInset className="relative min-w-0 overflow-hidden bg-card">
					{/* Persistent, absolutely-positioned terminal layer for the active
					    workspace. Stays mounted across route changes so tab/workspace
					    switches never remount terminals. The routed view ({children})
					    renders over it — WorkspaceView is visually empty, while
					    ProjectsIndex/SettingsRoute show with the host hidden underneath. */}
					<TerminalHost />
					{children}
				</SidebarInset>
				<ReviewPanel />
				<SidebarResizeHandle
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					onResizingChange={setIsResizing}
				/>
			</main>
			<ProjectKeybindings />
			<SidebarKeybindings />
			<ReviewKeybindings />
			{import.meta.env.DEV && <DebugOverlay />}
		</SidebarProvider>
	);
}

export default Layout;
