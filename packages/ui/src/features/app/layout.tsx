import { RegistryProvider } from "@effect-atom/atom-react";
import { BrowserRouter, Route, Routes } from "react-router";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/sidebar";
import { usePlatform } from "@/context/platform-context";
import { ThemeProvider } from "@/context/theme-context";
import { Sidebar } from "@/features/sidebar/sidebar";
import { cn } from "@/lib/utils";
import { HomePage } from "./pages/home";
import { SessionPage } from "./pages/session";
import { WorktreePage } from "./pages/worktree";

export default function Layout() {
	// Ensure the component is wrapped with a <PlatformProvider>
	usePlatform();

	return (
		<ThemeProvider>
			<RegistryProvider defaultIdleTTL={5 * 60 * 1000}>
				<BrowserRouter>
					<div className="[--header-height:calc(--spacing(14))]">
						<SidebarProvider className="flex flex-col">
							<header className="bg-background sticky top-0 z-50 flex w-full items-center pl-4 sm:pl-0">
								<div className="hidden sm:ml-0 sm:block w-[72px]" />
								<div className="flex h-(--header-height) w-full items-center gap-2">
									<SidebarTrigger />
								</div>
							</header>
							<div className="flex flex-1">
								<Sidebar />
								<SidebarMainContent />
							</div>
						</SidebarProvider>
					</div>
				</BrowserRouter>
			</RegistryProvider>
		</ThemeProvider>
	);
}

function SidebarMainContent() {
	const { open } = useSidebar();

	return (
		<SidebarInset
			data-tauri-drag-region
			data-state={open ? "expanded" : "collapsed"}
			className={cn(
				"relative h-[calc(100vh-var(--header-height))] overflow-hidden sm:border-l sm:border-t",
				"data-[state=collapsed]:rounded-tl-md",
			)}
		>
			<div className="flex-1 min-h-0 overflow-hidden">
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/worktree/:worktreeId" element={<WorktreePage />} />
					<Route path="/repository/:repositoryId" element={<HomePage />} />
					<Route
						path="/repository/:repositoryId/sessions/:sessionId"
						element={<SessionPage />}
					/>
				</Routes>
			</div>
		</SidebarInset>
	);
}
