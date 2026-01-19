"use client";

import { Dialog, DialogContent } from "@/components/dialog";
import {
	AppearanceSettings,
	ChatSettings,
	GitSettings,
	ServerSettings,
} from "./sections";
import { SettingsSidebar } from "./settings-sidebar";

export type SettingsSection = "chat" | "appearance" | "git" | "server";

interface SettingsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	section: SettingsSection;
	onSectionChange: (section: SettingsSection) => void;
	version?: string;
}

export function SettingsModal({
	open,
	onOpenChange,
	section,
	onSectionChange,
	version,
}: SettingsModalProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton
				className="w-[85vw]! h-[85vh]! max-w-[85vw]! max-sm:w-full! max-sm:h-full! max-sm:max-w-full! max-sm:rounded-none flex flex-col p-0 gap-0"
			>
				<div className="flex flex-1 overflow-hidden">
					<SettingsSidebar
						section={section}
						onSectionChange={onSectionChange}
						version={version}
					/>
					<main className="flex-1 overflow-y-auto p-6">
						<SettingsContent section={section} />
					</main>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function SettingsContent({ section }: { section: SettingsSection }) {
	switch (section) {
		case "chat":
			return <ChatSettings />;
		case "appearance":
			return <AppearanceSettings />;
		case "git":
			return <GitSettings />;
		case "server":
			return <ServerSettings />;
		default:
			return <ChatSettings />;
	}
}
