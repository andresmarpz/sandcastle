import { RegistryProvider } from "@effect-atom/atom-react";
import { BrowserRouter, Route, Routes } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/sidebar";
import { Sidebar } from "@/components/sidebar/sidebar";
import { usePlatform } from "@/context/platform-context";
import { ThemeProvider } from "@/context/theme-context";
import { HomePage } from "./pages/home";
import { WorktreePage } from "./pages/worktree";

export default function Layout() {
	// Ensure the component is wrapped with a <PlatformProvider>
	usePlatform();

	return (
		<ThemeProvider>
			<RegistryProvider defaultIdleTTL={5 * 60 * 1000}>
				<BrowserRouter>
					<SidebarProvider>
						<Sidebar />
						<SidebarInset className="relative">
							<div
								data-tauri-drag-region
								className="border-border flex-row items-center justify-between border-b h-12 min-h-12 bg-sidebar sticky top-0 z-20"
							/>

							<Routes>
								<Route path="/" element={<HomePage />} />
								<Route
									path="/worktree/:worktreeId"
									element={<WorktreePage />}
								/>
							</Routes>
						</SidebarInset>
					</SidebarProvider>
				</BrowserRouter>
			</RegistryProvider>
		</ThemeProvider>
	);
}
