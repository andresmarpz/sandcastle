"use client";

import { Outlet } from "react-router";

import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "./sidebar/app-sidebar";

export function ShellLayout() {
	const isMobile = useIsMobile();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="flex flex-col">
				{isMobile && (
					<header className="border-border bg-background sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-4">
						<SidebarTrigger />
						<span className="text-sm font-medium">Sandcastle</span>
					</header>
				)}
				<div className="flex-1 overflow-hidden">
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
