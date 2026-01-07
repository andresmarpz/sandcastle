import { WelcomeSection } from "@/components/home/welcome-section"
import { RecentProjects } from "@/components/home/recent-projects"
import type { Project } from "@/types/project"

const MOCK_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Project Alpha",
    path: "/Users/dev/projects/alpha",
    lastOpened: new Date("2026-01-05"),
    description: "Main application development",
  },
  {
    id: "2",
    name: "Component Library",
    path: "/Users/dev/projects/ui-lib",
    lastOpened: new Date("2026-01-04"),
    description: "Shared UI components",
  },
  {
    id: "3",
    name: "API Backend",
    path: "/Users/dev/projects/api",
    lastOpened: new Date("2026-01-03"),
    description: "REST API service",
  },
]

export function HomePage() {
  return (
    <div className="space-y-12">
      <WelcomeSection />
      <RecentProjects projects={MOCK_PROJECTS} />
    </div>
  )
}
