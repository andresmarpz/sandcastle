"use client";

import * as React from "react";

interface VersionContextValue {
	currentVersion: string;
}

const VersionContext = React.createContext<VersionContextValue | undefined>(
	undefined,
);

export interface VersionProviderProps {
	currentVersion: string;
	children: React.ReactNode;
}

export function VersionProvider({
	currentVersion,
	children,
}: VersionProviderProps) {
	const value = React.useMemo(
		() => ({
			currentVersion,
		}),
		[currentVersion],
	);
	return (
		<VersionContext.Provider value={value}>{children}</VersionContext.Provider>
	);
}

/**
 * Hook to get the current app version.
 * Returns undefined if used outside a VersionProvider (e.g., in web-only mode).
 */
export function useVersion(): string | undefined {
	const context = React.useContext(VersionContext);
	return context?.currentVersion;
}
