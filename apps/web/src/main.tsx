import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import Layout from "@sandcastle/ui/features/app/layout";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

const copyToClipboard = async (text: string): Promise<void> => {
	try {
		await navigator.clipboard.writeText(text);
	} catch (error) {
		console.error("Failed to copy to clipboard:", error);
	}
};

function pathToFileUrl(path: string): string {
	return path.replace(/\\/g, "/");
}

const openInEditor = async (path: string): Promise<void> => {
	window.open(`cursor://file/${pathToFileUrl(path)}`, "_blank", "noopener");
};

const openInVSCode = async (path: string): Promise<void> => {
	window.open(`vscode://file/${pathToFileUrl(path)}`, "_blank", "noopener");
};

export function App() {
	return (
		<PlatformProvider
			openDirectory={async () => {
				return "";
			}}
			copyToClipboard={copyToClipboard}
			openInEditor={openInEditor}
			openInVSCode={openInVSCode}
		>
			<Layout />
		</PlatformProvider>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
