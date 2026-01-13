"use client";

import { useCallback } from "react";
import { Outlet, useSearchParams } from "react-router";

import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/sidebar";
import { SettingsModal, type SettingsSection } from "@/features/settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "./sidebar/app-sidebar";

export function ShellLayout() {
	const isMobile = useIsMobile();
	const [searchParams, setSearchParams] = useSearchParams();

	const settingsSection = searchParams.get("settings") as SettingsSection | null;
	const isSettingsOpen = settingsSection !== null;

	const handleSettingsOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				setSearchParams((prev) => {
					prev.delete("settings");
					return prev;
				});
			}
		},
		[setSearchParams],
	);

	const handleSettingsSectionChange = useCallback(
		(section: SettingsSection) => {
			setSearchParams((prev) => {
				prev.set("settings", section);
				return prev;
			});
		},
		[setSearchParams],
	);

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
				<div className="flex-1 min-w-0 overflow-hidden">
					<Outlet />
				</div>
			</SidebarInset>
			<SettingsModal
				open={isSettingsOpen}
				onOpenChange={handleSettingsOpenChange}
				section={settingsSection ?? "chat"}
				onSectionChange={handleSettingsSectionChange}
			/>
		</SidebarProvider>
	);
}
