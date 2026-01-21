"use client";

import {
	ChatCircle,
	Database,
	GitBranch,
	Palette,
} from "@phosphor-icons/react";
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
		icon: ChatCircle,
	},
	{
		id: "appearance" as const,
		label: "Appearance",
		icon: Palette,
	},
	{
		id: "git" as const,
		label: "Git",
		icon: GitBranch,
	},
	{
		id: "server" as const,
		label: "Server",
		icon: Database,
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
