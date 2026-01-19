"use client";

import { useMatch } from "react-router";
import {
	SidebarContent,
	SidebarMenu,
	Sidebar as SidebarPrimitive,
	SidebarRail,
	useSidebar,
} from "@/components/sidebar";
import Rail from "@/features/sidebar/rail/rail";
import { SessionList } from "@/features/sidebar/sessions";
import { WorktreeSection } from "@/features/sidebar/sessions/worktree-section";
import { cn } from "@/lib/utils";

export function Sidebar() {
	const { open } = useSidebar();
	const match = useMatch("/repository/:repositoryId/*");
	const repositoryId = match?.params.repositoryId;

	return (
		<SidebarPrimitive
			collapsible="icon"
			className={cn(
				"overflow-hidden *:data-[sidebar=sidebar]:flex-row border-r-0",
				"top-(--header-height) h-[calc(100svh-var(--header-height))]!",
			)}
			style={{
				borderRight: !open ? "none" : undefined,
			}}
		>
			{/* This is the sidebar vertical Rail that contains all the repository items, Slack style. */}
			<Rail />

			{/* Second sidebar - session list for the selected repository */}
			<SidebarPrimitive
				collapsible="none"
				className="flex flex-1 flex-col border-l border-t md:rounded-tl-md"
			>
				<SidebarContent className="flex-1 overflow-y-auto pt-2 px-2">
					<SidebarMenu>
						{repositoryId ? (
							<SessionList repositoryId={repositoryId} />
						) : (
							<div className="text-muted-foreground text-sm px-2 py-8 text-center">
								Select a repository to view sessions
							</div>
						)}
					</SidebarMenu>
				</SidebarContent>

				{/* Worktree section at bottom - toggleable, max 20% height */}
				{repositoryId && <WorktreeSection repositoryId={repositoryId} />}
			</SidebarPrimitive>

			{open && <SidebarRail />}
		</SidebarPrimitive>
	);
}
