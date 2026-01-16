"use client";

import { RegistryProvider } from "@effect-atom/atom-react";
import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { BrowserRouter } from "react-router";
import { SidebarProvider } from "@/components/sidebar";
import { Sidebar } from "@/components/sidebar/sidebar";

// Web platform implementations
const copyToClipboard = async (text: string) => {
	await navigator.clipboard.writeText(text);
};

export default function ClientOnly() {
	return (
		<BrowserRouter>
			<ThemeProvider>
				<PlatformProvider
					openDirectory={async () => null}
					openInFileManager={null}
					openInEditor={null}
					copyToClipboard={copyToClipboard}
				>
					<RegistryProvider defaultIdleTTL={5 * 60 * 1000}>
						<SidebarProvider>
							<Sidebar />
						</SidebarProvider>
					</RegistryProvider>
				</PlatformProvider>
			</ThemeProvider>
		</BrowserRouter>
	);
}
