import { RegistryProvider } from "@effect-atom/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { PlatformProvider } from "@sandcastle/ui/context/platform-context";
import { open } from "@tauri-apps/plugin-dialog";
import { RootLayout } from "@/components/layout/root-layout";
import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";

const openDirectory = async () => {
  const selection = await open({ directory: true, multiple: false });
  if (!selection) return null;
  return Array.isArray(selection) ? (selection[0] ?? null) : selection;
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <PlatformProvider openDirectory={openDirectory}>
        <RegistryProvider>
          <RootLayout />
        </RegistryProvider>
      </PlatformProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
