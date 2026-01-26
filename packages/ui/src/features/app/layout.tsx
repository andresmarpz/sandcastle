import { RegistryProvider } from "@effect-atom/atom-react";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "@/components/sidebar";
import { Toaster } from "@/components/sonner";
import { usePlatform } from "@/context/platform-context";
import { ThemeProvider } from "@/context/theme-context";
import { initNotificationManager } from "@/features/chat/services/notification-manager";
import { Sidebar } from "@/features/sidebar/sidebar";
import { cn } from "@/lib/utils";
import { CreatePRButton } from "./components/create-pr-button";
import { HomePage } from "./pages/home";
import { SessionPage } from "./pages/session";
import { StatusPlayground } from "./pages/status-playground";

export default function Layout() {
	const platform = usePlatform();

	// Initialize notification manager with platform bridge
	useEffect(() => {
		initNotificationManager({
			setDockBadge: platform.setDockBadge ?? null,
		});
	}, [platform.setDockBadge]);

	return (
		<ThemeProvider>
			<RegistryProvider defaultIdleTTL={5 * 60 * 1000}>
				<BrowserRouter>
					<div className="[--header-height:calc(--spacing(10))]">
						<SidebarProvider className="flex flex-col">
							<header
								data-tauri-drag-region
								className="bg-background sticky top-0 z-50 flex w-full items-center pl-4 sm:pl-0"
							>
								<div
									data-tauri-drag-region
									className="hidden sm:ml-0 sm:block w-[72px]"
								/>
								<div
									data-tauri-drag-region
									className="flex h-(--header-height) w-full items-center justify-between gap-2 pr-4"
								>
									<SidebarTrigger />
									<CreatePRButton />
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
			<Toaster />
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
					{/* <Route path="/worktree/:worktreeId" element={<WorktreePage />} /> */}
					<Route path="/repository/:repositoryId" element={<HomePage />} />
					<Route
						path="/repository/:repositoryId/sessions/:sessionId"
						element={<SessionPage />}
					/>
					<Route path="/ui/status" element={<StatusPlayground />} />
				</Routes>
			</div>
		</SidebarInset>
	);
}
