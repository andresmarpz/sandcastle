import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useUIStore } from "@/stores/ui"
import { ProjectsPage } from "@/pages/ProjectsPage"
import { WorktreesPage } from "@/pages/WorktreesPage"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
})

function AppContent() {
  const currentView = useUIStore((state) => state.currentView)

  return (
    <main className="min-h-screen bg-background">
      {currentView === "projects" && <ProjectsPage />}
      {currentView === "worktrees" && <WorktreesPage />}
    </main>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  )
}

export default App
