import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function RootLayout() {
  return (
    <div className="bg-background flex h-screen flex-col">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto p-6 pt-13">
          <div className="text-muted-foreground flex h-full items-center justify-center">
            <p className="text-sm">
              Select a project or worktree to get started
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
