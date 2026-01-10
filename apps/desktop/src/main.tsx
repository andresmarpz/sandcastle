import { RegistryProvider } from "@effect-atom/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { open } from "@tauri-apps/plugin-dialog";
import { Command } from "@tauri-apps/plugin-shell";
import { RootLayout } from "@/components/layout/root-layout";
import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PlatformProvider
          openDirectory={openDirectory}
          openInFileManager={openInFileManager}
          openInEditor={openInEditor}
          copyToClipboard={copyToClipboard}
        >
          <RegistryProvider>
            <RootLayout />
          </RegistryProvider>
        </PlatformProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
