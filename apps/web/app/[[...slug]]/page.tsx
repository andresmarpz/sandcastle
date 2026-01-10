"use client";

import { RegistryProvider } from "@effect-atom/atom-react";
import { BrowserRouter } from "react-router";

import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { RootLayout } from "@sandcastle/ui/features/app";

// Web platform implementations
const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

export default function Page() {
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
            <RootLayout />
          </RegistryProvider>
        </PlatformProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
