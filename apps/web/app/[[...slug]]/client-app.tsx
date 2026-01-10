"use client";

import { RegistryProvider } from "@effect-atom/atom-react";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter } from "react-router";

import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";

// Lazy load the main app to defer heavy dependencies
const RootLayout = lazy(() =>
  import("@sandcastle/ui/features/app").then((m) => ({ default: m.RootLayout }))
);

// Web platform implementations
const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

// Hide loading screen when app is ready
function hideLoadingScreen() {
  const el = document.getElementById("loading-screen");
  if (el) el.style.display = "none";
}

// Wrapper that hides loading screen after RootLayout mounts
function AppReady({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hideLoadingScreen();
  }, []);
  return <>{children}</>;
}

export default function ClientApp() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PlatformProvider
          openDirectory={async () => null}
          openInFileManager={null}
          openInEditor={null}
          copyToClipboard={copyToClipboard}
        >
          <RegistryProvider>
            <Suspense fallback={null}>
              <AppReady>
                <RootLayout />
              </AppReady>
            </Suspense>
          </RegistryProvider>
        </PlatformProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
