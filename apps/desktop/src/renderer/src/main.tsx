import "./index.css";

import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { router } from "./router";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RegistryProvider>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<RouterProvider router={router} />
			</ThemeProvider>
		</RegistryProvider>
	</StrictMode>,
);
