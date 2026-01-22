"use client";

import {
	Sidebar as SidebarPrimitive,
	SidebarRail,
	useSidebar,
} from "@/components/sidebar";
import MainSidebar from "@/features/sidebar/main/main-sidebar";
import Rail from "@/features/sidebar/rail/rail-sidebar";
import { cn } from "@/lib/utils";

export function Sidebar() {
	const { open } = useSidebar();

	return (
		<SidebarPrimitive
			data-open={open}
			collapsible="icon"
			className={cn(
				"overflow-hidden *:data-[sidebar=sidebar]:flex-row data-[open=false]:[border-right:none]",
				"top-(--header-height) h-[calc(100svh-var(--header-height))]!",
			)}
		>
			{/* This is the sidebar vertical Rail that contains all the repository items, Slack style. */}
			<Rail />

			{/* Second sidebar - session list for the selected repository */}
			<MainSidebar />

			{open && <SidebarRail />}
		</SidebarPrimitive>
	);
}
