import { RegistryProvider } from "@effect-atom/atom-react";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { ThemeProvider } from "@sandcastle/ui/context/theme-context";
import { RepoProvider } from "@sandcastle/ui/context/repo-context";
import { RootLayout } from "@/components/layout/root-layout";
import { HomePage } from "@/pages/home";
import { WorktreesPage } from "@/pages/worktrees";
import "@sandcastle/ui/globals.css";
import "@fontsource-variable/inter";
import "./tauri.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <RegistryProvider>
        <RepoProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<RootLayout />}>
                <Route index element={<HomePage />} />
                <Route path="worktrees" element={<WorktreesPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RepoProvider>
      </RegistryProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
