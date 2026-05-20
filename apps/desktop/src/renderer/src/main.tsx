import "./index.css";

import { RegistryProvider } from "@effect/atom-react";
import { ThemeProvider } from "next-themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router";
import Layout from "./components/Layout";
import IndexRoute from "./routes/index";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RegistryProvider>
			<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
				<HashRouter>
					<Routes>
						<Route element={<Layout />}>
							<Route index element={<IndexRoute />} />
						</Route>
					</Routes>
				</HashRouter>
			</ThemeProvider>
		</RegistryProvider>
	</StrictMode>,
);
