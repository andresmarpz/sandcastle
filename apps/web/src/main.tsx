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

export function App() {
	return (
		<PlatformProvider
			openDirectory={async () => {
				return "";
			}}
			copyToClipboard={copyToClipboard}
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
