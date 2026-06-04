import "./index.css";

import { RegistryContext } from "@effect/atom-react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import LoadingScreen from "./components/LoadingScreen";
import { installMcpBridge } from "./lib/mcpBridge";
import { runStartup } from "./lib/startup";
import { router } from "./router";
import { appRegistry } from "./rpc/registry";
import { useStartupStore } from "./stores/startup";

// Tell main this page (re)loaded so it can reclaim terminal sessions orphaned
// by a soft reload before we register fresh ones.
window.api?.terminal?.rendererReady?.();

// Listen for MCP-driven UI commands (split / new tab / teleport) from main.
installMcpBridge();

// Own app bring-up: warm server data, restore the last workspace, reattach
// surviving PTYs, then reveal once the landing terminals first-paint. The
// RouterProvider always renders (so the landing view mounts and warms beneath
// the overlay); the LoadingScreen sits on top until `phase === "ready"`.
runStartup();

function Root(): React.JSX.Element {
	const phase = useStartupStore((s) => s.phase);
	return (
		<>
			<RouterProvider router={router} />
			{phase === "loading" && <LoadingScreen />}
		</>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RegistryContext.Provider value={appRegistry}>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<HotkeysProvider>
					<Root />
				</HotkeysProvider>
			</ThemeProvider>
		</RegistryContext.Provider>
	</StrictMode>,
);
