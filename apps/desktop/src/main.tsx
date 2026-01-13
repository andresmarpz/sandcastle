import { RegistryProvider } from "@effect-atom/atom-react";
import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { BackendUrlSetup } from "@sandcastle/ui/features/app/backend-url-setup";
import { hasBackendUrl } from "@sandcastle/ui/lib/backend-url";
import { open } from "@tauri-apps/plugin-dialog";
import { Command } from "@tauri-apps/plugin-shell";
import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";

import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";
import { LoadingScreen } from "@/features/app/loading-screen";

// Lazy load the main app to defer heavy dependencies
const RootLayout = lazy(() =>
	import("@sandcastle/ui/features/app").then((m) => ({
		default: m.RootLayout,
	})),
);

const openDirectory = async () => {
	const selection = await open({ directory: true, multiple: false });
	if (!selection) return null;
	return Array.isArray(selection) ? (selection[0] ?? null) : selection;
};

const openInFileManager = async (path: string) => {
	// Open -R reveals the item in Finder on macOS
	const command = Command.create("open", ["-R", path]);
	await command.execute();
};

const openInEditor = async (path: string) => {
	// Open the path with Cursor using macOS open command
	const command = Command.create("open", ["-a", "Cursor", path]);
	await command.execute();
};

const copyToClipboard = async (text: string) => {
	await navigator.clipboard.writeText(text);
};

// Hide loading screen when app is ready
function hideLoadingScreen() {
	const el = document.getElementById("loading-screen");
	if (el) el.style.display = "none";
}

// Wrapper that hides loading screen after RootLayout mounts
function AppReady({ children }: { children: React.ReactNode }) {
	useEffect(() => {
		hideLoadingScreen();
	}, []);
	return <>{children}</>;
}

function App() {
	// Gate app behind backend URL configuration
	if (!hasBackendUrl()) {
		return (
			<ThemeProvider>
				<BackendUrlSetup />
			</ThemeProvider>
		);
	}

	return (
		<BrowserRouter>
			<ThemeProvider>
				<PlatformProvider
					openDirectory={openDirectory}
					openInFileManager={openInFileManager}
					openInEditor={openInEditor}
					copyToClipboard={copyToClipboard}
				>
					<RegistryProvider>
						<Suspense fallback={<LoadingScreen />}>
							<AppReady>
								<RootLayout />
							</AppReady>
						</Suspense>
					</RegistryProvider>
				</PlatformProvider>
			</ThemeProvider>
		</BrowserRouter>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
