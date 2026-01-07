import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { ThemeProvider } from "@/context/theme-context";
import { RepoProvider } from "@/context/repo-context";
import { RootLayout } from "@/components/layout/root-layout";
import { HomePage } from "@/pages/home";
import { WorktreesPage } from "@/pages/worktrees";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
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
    </ThemeProvider>
  </React.StrictMode>,
);
