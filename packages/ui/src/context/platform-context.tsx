"use client";

import * as React from "react";

interface PlatformContextValue {
  openDirectory: () => Promise<string | null>;
}

const PlatformContext = React.createContext<PlatformContextValue | undefined>(
  undefined,
);

export function PlatformProvider({
  openDirectory,
  children,
}: {
  openDirectory: PlatformContextValue["openDirectory"];
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ openDirectory }), [openDirectory]);
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
