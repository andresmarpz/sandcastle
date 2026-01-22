"use client";

import { ChatCircleIcon } from "@phosphor-icons/react/ChatCircle";
import { DatabaseIcon } from "@phosphor-icons/react/Database";
import { GitBranchIcon } from "@phosphor-icons/react/GitBranch";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import {
	SidebarContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	Sidebar as SidebarPrimitive,
} from "@/components/sidebar";
import type { SettingsSection } from "./settings-modal";

const settingsNav = [
	{
		id: "chat" as const,
		label: "Chat",
		icon: ChatCircleIcon,
	},
	{
		id: "appearance" as const,
		label: "Appearance",
		icon: PaletteIcon,
	},
	{
		id: "git" as const,
		label: "Git",
		icon: GitBranchIcon,
	},
	{
		id: "server" as const,
		label: "Server",
		icon: DatabaseIcon,
	},
];

interface SettingsSidebarProps {
	section: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
}

export function SettingsSidebar({
	section,
	onSectionChange,
}: SettingsSidebarProps) {
	return (
		<SidebarPrimitive collapsible="none" className="w-56 shrink-0 border-r">
			<SidebarContent className="px-2 pt-2">
				<SidebarMenu>
					{settingsNav.map((item) => {
						const isActive = section === item.id;
						return (
							<SidebarMenuItem key={item.id}>
								<SidebarMenuButton
									isActive={isActive}
									onClick={() => onSectionChange(item.id)}
								>
									<item.icon className="size-4" />
									<span>{item.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarContent>
		</SidebarPrimitive>
	);
}
