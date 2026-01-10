"use client";

import { Outlet } from "react-router";

import { AppSidebar } from "./app-sidebar";

export function ShellLayout() {
  return (
    <div className="bg-background flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
