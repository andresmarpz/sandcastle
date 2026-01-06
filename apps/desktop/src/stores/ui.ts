import { create } from "zustand"

interface UIState {
  // Navigation
  currentView: "projects" | "worktrees"
  selectedProject: string | null

  // Actions
  setView: (view: "projects" | "worktrees") => void
  selectProject: (projectName: string) => void
  goBackToProjects: () => void
}

export const useUIStore = create<UIState>((set) => ({
  currentView: "projects",
  selectedProject: null,

  setView: (view) => set({ currentView: view }),

  selectProject: (projectName) =>
    set({ selectedProject: projectName, currentView: "worktrees" }),

  goBackToProjects: () =>
    set({ currentView: "projects", selectedProject: null }),
}))
