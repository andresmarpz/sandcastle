import { useState } from "react";

import AppSidebar from "@/components/AppSidebar";
import DebugOverlay from "@/components/DebugOverlay";
import SidebarResizeHandle from "@/components/SidebarResizeHandle";
import TopBar from "@/components/TopBar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import ProjectKeybindings from "@/keybindings/ProjectKeybindings";
import SidebarKeybindings from "@/keybindings/SidebarKeybindings";
import { cn } from "@/lib/utils";

const DEFAULT_SIDEBAR_WIDTH = 276;

type Props = {
	children: React.ReactNode;
};

function Layout({ children }: Props): React.JSX.Element {
	const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
	const [isResizing, setIsResizing] = useState(false);

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
					{children}
				</SidebarInset>
				<SidebarResizeHandle
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					onResizingChange={setIsResizing}
				/>
			</main>
			<ProjectKeybindings />
			<SidebarKeybindings />
			{import.meta.env.DEV && <DebugOverlay />}
		</SidebarProvider>
	);
}

export default Layout;
