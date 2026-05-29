import "./index.css";

import { RegistryContext } from "@effect/atom-react";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { installMcpBridge } from "./lib/mcpBridge";
import { router } from "./router";
import { appRegistry } from "./rpc/registry";

// Tell main this page (re)loaded so it can reclaim terminal sessions orphaned
// by a soft reload before we register fresh ones.
window.api?.terminal?.rendererReady?.();

// Listen for MCP-driven UI commands (split / new tab / teleport) from main.
installMcpBridge();

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RegistryContext.Provider value={appRegistry}>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<HotkeysProvider>
					<RouterProvider router={router} />
				</HotkeysProvider>
			</ThemeProvider>
		</RegistryContext.Provider>
	</StrictMode>,
);
