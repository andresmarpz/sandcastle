import { Outlet } from "react-router"
import { AppHeader } from "./app-header"

export function RootLayout() {
  return (
    <div className="bg-background min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 pt-12 pb-12">
        <Outlet />
      </main>
    </div>
  )
}
