import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { open } from "@tauri-apps/plugin-dialog";
import { Command } from "@tauri-apps/plugin-shell";
import ReactDOM from "react-dom/client";

import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";
import { StrictMode } from "react";
import { UpdaterProvider } from "@/context/updater-context";
import Layout from "@/features/app/layout";

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

function App() {
	return (
		<PlatformProvider
			openDirectory={openDirectory}
			openInFileManager={openInFileManager}
			openInEditor={openInEditor}
			copyToClipboard={copyToClipboard}
		>
			<UpdaterProvider>
				<Layout />
			</UpdaterProvider>
		</PlatformProvider>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
