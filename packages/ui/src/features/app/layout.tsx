import { RegistryProvider } from "@effect-atom/atom-react";
import { BrowserRouter, Route, Routes } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/sidebar";
import { usePlatform } from "@/context/platform-context";
import { ThemeProvider } from "@/context/theme-context";
import { Sidebar } from "@/features/sidebar/sidebar";
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
						<SidebarInset className="relative h-screen overflow-hidden">
							<div
								data-tauri-drag-region
								className="border-border flex-row items-center justify-between border-b h-12 min-h-12 bg-sidebar flex-shrink-0"
							/>

							<div className="flex-1 min-h-0 overflow-hidden">
								<Routes>
									<Route path="/" element={<HomePage />} />
									<Route
										path="/worktree/:worktreeId"
										element={<WorktreePage />}
									/>
								</Routes>
							</div>
						</SidebarInset>
					</SidebarProvider>
				</BrowserRouter>
			</RegistryProvider>
		</ThemeProvider>
	);
}
