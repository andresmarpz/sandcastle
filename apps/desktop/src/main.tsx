import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";

import {
	initializeBackendUrl,
	onPortFallback,
} from "@sandcastle/ui/lib/backend-url";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";

// Set up callback to show toast when using fallback port
onPortFallback((port) => {
	// Delay the toast slightly to ensure Sonner is mounted
	setTimeout(() => {
		toast.info(`Server running on port ${port}`, {
			description: "Using default port because dynamic port detection failed.",
			duration: 5000,
		});
	}, 1000);
});

// Initialize backend URL BEFORE importing components that use RPC clients.
// This ensures the Tauri sidecar port is cached before RPC URLs are computed.
await initializeBackendUrl();

// Dynamic imports AFTER initialization to ensure RPC clients get the correct URL
const { PlatformProvider } = await import(
	"@sandcastle/ui/context/platform-context"
);
const { open } = await import("@tauri-apps/plugin-dialog");
const { Command } = await import("@tauri-apps/plugin-shell");
const { invoke } = await import("@tauri-apps/api/core");
const { UpdaterProvider } = await import("@/context/updater-context");
const { default: Layout } = await import("@/features/app/layout");

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

/**
 * Parse markdown to HTML using native Rust comrak parser.
 */
const parseMarkdown = async (markdown: string): Promise<string> => {
	return invoke<string>("parse_markdown_command", { markdown });
};

function App() {
	return (
		<PlatformProvider
			openDirectory={openDirectory}
			openInFileManager={openInFileManager}
			openInEditor={openInEditor}
			copyToClipboard={copyToClipboard}
			parseMarkdown={parseMarkdown}
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
