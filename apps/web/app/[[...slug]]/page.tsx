"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import { PlatformProvider } from "@/context/platform-context";

const Layout = dynamic(() => import("@sandcastle/ui/features/app/layout"), {
	ssr: false,
});

export default function ClientApp() {
	const openDirectory = useCallback(async (): Promise<string | null> => {
		// Check if the File System Access API is available
		if (!("showDirectoryPicker" in window)) {
			return null;
		}

		try {
			const handle = await window.showDirectoryPicker({ mode: "read" });
			// On web, we can only get the directory name, not the full path
			return handle.name;
		} catch (error) {
			// User cancelled the picker or permission denied
			if (error instanceof Error && error.name === "AbortError") {
				return null;
			}
			console.error("Failed to open directory picker:", error);
			return null;
		}
	}, []);

	const copyToClipboard = useCallback(async (text: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.error("Failed to copy to clipboard:", error);
		}
	}, []);

	return (
		<PlatformProvider
			openDirectory={openDirectory}
			copyToClipboard={copyToClipboard}
		>
			<Layout />
		</PlatformProvider>
	);
}
