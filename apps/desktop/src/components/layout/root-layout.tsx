import { NavLink, Outlet } from "react-router";
import { AppHeader } from "./app-header";
import { cn } from "@/lib/utils";
import { IconHome, IconGitBranch } from "@tabler/icons-react";

export function RootLayout() {
  return (
    <div className="bg-background min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-4xl px-6 pt-10">
        <nav className="border-border mb-6 flex gap-1 border-b pb-2">
          <NavItem to="/" icon={<IconHome className="size-4" />}>
            Home
          </NavItem>
          <NavItem to="/worktrees" icon={<IconGitBranch className="size-4" />}>
            Worktrees
          </NavItem>
        </nav>
        <main className="pb-12">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NavItem({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
