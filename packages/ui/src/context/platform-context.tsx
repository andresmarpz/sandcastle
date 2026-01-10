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
}

const PlatformContext = React.createContext<PlatformContextValue | undefined>(
	undefined,
);

export interface PlatformProviderProps {
	openDirectory: PlatformContextValue["openDirectory"];
	openInFileManager?: PlatformContextValue["openInFileManager"];
	openInEditor?: PlatformContextValue["openInEditor"];
	copyToClipboard?: PlatformContextValue["copyToClipboard"];
	children: React.ReactNode;
}

export function PlatformProvider({
	openDirectory,
	openInFileManager,
	openInEditor,
	copyToClipboard,
	children,
}: PlatformProviderProps) {
	const value = React.useMemo(
		() => ({
			openDirectory,
			openInFileManager,
			openInEditor,
			copyToClipboard,
		}),
		[openDirectory, openInFileManager, openInEditor, copyToClipboard],
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
