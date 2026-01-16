"use client";

import {
	SidebarContent,
	SidebarFooter,
	SidebarMenu,
	Sidebar as SidebarPrimitive,
	SidebarRail,
} from "@/components/sidebar";
import SidebarHeader from "@/components/sidebar/sidebar-header";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function Sidebar() {
	return (
		<SidebarPrimitive collapsible="offExamples">
			{/* Header with Add button */}
			<SidebarHeader />

			{/* Repository list */}
			<SidebarContent className="pt-2 px-2">
				{/* <SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton isActive={isActive} onClick={onWorkspacesClick}>
							<IconLayoutDashboard className="size-4" />
							<span>Workspaces</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu> */}

				<SidebarMenu>{/* List of <SidebarRepositoryItem> */}</SidebarMenu>
			</SidebarContent>

			{/* Footer with Settings */}
			<SidebarFooter className="border-border border-t p-2 flex items-center justify-end">
				<ThemeSwitcher />
			</SidebarFooter>

			{/* Resize rail */}
			<SidebarRail />
		</SidebarPrimitive>
	);
}
