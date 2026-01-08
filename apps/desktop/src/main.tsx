import { RegistryProvider } from "@effect-atom/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { RootLayout } from "@/components/layout/root-layout";
import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <RegistryProvider>
        <RootLayout />
      </RegistryProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
