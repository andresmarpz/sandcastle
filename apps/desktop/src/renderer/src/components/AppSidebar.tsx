import { CaretRightIcon, GearIcon, TerminalWindowIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function AppSidebar(): React.JSX.Element {
	const [openSessions, setOpenSessions] = useState(true);

	const onSessionContextMenu = async (
		e: React.MouseEvent,
		sessionLabel: string,
	): Promise<void> => {
		e.preventDefault();
		e.stopPropagation();
		const choice = await window.api.menu.popup([
			{ id: "rename", label: `Rename "${sessionLabel}"` },
			{ id: "duplicate", label: "Duplicate" },
			{ type: "separator" },
			{ id: "close-terminal", label: "Close terminal" },
		]);
		if (!choice) return;
		// TODO: wire actions once session management lands
		console.log("[sidebar] menu choice:", choice, sessionLabel);
	};

	return (
		<Sidebar collapsible="offcanvas" variant="inset">
			<SidebarHeader />
			<SidebarContent>
				<Collapsible open={openSessions} onOpenChange={setOpenSessions}>
					<SidebarGroup>
						<CollapsibleTrigger
							render={
								<SidebarGroupLabel className="flex w-full cursor-pointer items-center justify-between gap-1 select-none hover:text-sidebar-foreground" />
							}
						>
							<span>Sessions</span>
							<CaretRightIcon
								className={cn(
									"size-3 transition-transform duration-150",
									openSessions && "rotate-90",
								)}
							/>
						</CollapsibleTrigger>
						<CollapsibleContent className="data-closed:hidden">
							<SidebarGroupContent>
								<SidebarMenu>
									<SidebarMenuItem
										onContextMenu={(e) => void onSessionContextMenu(e, "Terminal")}
									>
										<SidebarMenuButton tooltip="Terminal" data-active>
											<TerminalWindowIcon />
											<span>Terminal</span>
										</SidebarMenuButton>
										<SidebarMenuSub>
											<SidebarMenuSubItem>
												<SidebarMenuSubButton href="#">
													<span>Shell</span>
												</SidebarMenuSubButton>
											</SidebarMenuSubItem>
										</SidebarMenuSub>
									</SidebarMenuItem>
								</SidebarMenu>
							</SidebarGroupContent>
						</CollapsibleContent>
					</SidebarGroup>
				</Collapsible>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Settings">
							<GearIcon />
							<span>Settings</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}

export default AppSidebar;
