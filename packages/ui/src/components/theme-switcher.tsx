"use client";

import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/sidebar";
import { useTheme } from "@/context/theme-context";

export function ThemeSwitcher() {
	const { theme, setTheme } = useTheme();

	return (
		<SidebarMenuItem>
			<DropdownMenu>
				<DropdownMenuTrigger render={<SidebarMenuButton />}>
					<IconSun className="size-4 dark:hidden" />
					<IconMoon className="hidden size-4 dark:block" />
					<span className="sr-only">Toggle theme</span>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" sideOffset={4}>
					<DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
						<DropdownMenuRadioItem value="light">
							<IconSun className="size-4" />
							Light
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="dark">
							<IconMoon className="size-4" />
							Dark
						</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="system">
							<IconDeviceDesktop className="size-4" />
							System
						</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</SidebarMenuItem>
	);
}
