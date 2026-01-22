"use client";

import * as React from "react";

interface PlatformContextValue {
	openDirectory: () => Promise<string | null>;
	/** Open a path in the system file manager (Finder on macOS). Null if not supported. */
	openInFileManager?: ((path: string) => Promise<void>) | null;
	/** Open a path in an external editor (e.g., Cursor). Null if not supported. */
	openInEditor?: ((path: string) => Promise<void>) | null;
	/** Copy a path to the clipboard. Null if not supported (falls back to navigator.clipboard). */
	copyToClipboard?: ((text: string) => Promise<void>) | null;
	/** Parse markdown to HTML using native Rust comrak parser (Tauri only). Null if not supported. */
	parseMarkdown?: ((markdown: string) => Promise<string>) | null;
	/** Open an external URL in the system's default browser (Tauri only). Null if not supported. */
	openExternalUrl?: ((url: string) => Promise<void>) | null;
	/** Set the dock badge count (macOS only). Null if not supported. */
	setDockBadge?: ((count: number) => Promise<void>) | null;
}

const PlatformContext = React.createContext<PlatformContextValue | undefined>(
	undefined,
);

export interface PlatformProviderProps {
	openDirectory: PlatformContextValue["openDirectory"];
	openInFileManager?: PlatformContextValue["openInFileManager"];
	openInEditor?: PlatformContextValue["openInEditor"];
	copyToClipboard?: PlatformContextValue["copyToClipboard"];
	parseMarkdown?: PlatformContextValue["parseMarkdown"];
	openExternalUrl?: PlatformContextValue["openExternalUrl"];
	setDockBadge?: PlatformContextValue["setDockBadge"];
	children: React.ReactNode;
}

export function PlatformProvider({
	openDirectory,
	openInFileManager,
	openInEditor,
	copyToClipboard,
	parseMarkdown,
	openExternalUrl,
	setDockBadge,
	children,
}: PlatformProviderProps) {
	const value = React.useMemo(
		() => ({
			openDirectory,
			openInFileManager,
			openInEditor,
			copyToClipboard,
			parseMarkdown,
			openExternalUrl,
			setDockBadge,
		}),
		[
			openDirectory,
			openInFileManager,
			openInEditor,
			copyToClipboard,
			parseMarkdown,
			openExternalUrl,
			setDockBadge,
		],
	);
	return (
		<PlatformContext.Provider value={value}>
			{children}
		</PlatformContext.Provider>
	);
}

export function usePlatform() {
	const context = React.useContext(PlatformContext);
	if (!context) {
		throw new Error("usePlatform must be used within a PlatformProvider");
	}
	return context;
}
