const API_BASE = "http://localhost:8015";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  gitPath: string;
  createdAt: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

// ─── API Client ────────────────────────────────────────────────────────────

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "API request failed");
  }

  return data;
}

// ─── Project API ───────────────────────────────────────────────────────────

export const projectsApi = {
  list: async (): Promise<Project[]> => {
    const data = await apiRequest<{ projects: Project[] }>("/api/projects");
    return data.projects;
  },

  add: async (gitPath: string, name?: string): Promise<Project> => {
    const data = await apiRequest<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ gitPath, name }),
    });
    return data.project;
  },

  remove: async (name: string): Promise<void> => {
    await apiRequest(`/api/projects/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
  },
};

// ─── Worktree API ──────────────────────────────────────────────────────────

export const worktreesApi = {
  list: async (projectName: string): Promise<WorktreeInfo[]> => {
    const data = await apiRequest<{ worktrees: WorktreeInfo[] }>(
      `/api/projects/${encodeURIComponent(projectName)}/worktrees`
    );
    return data.worktrees;
  },

  create: async (
    projectName: string,
    worktreeName?: string
  ): Promise<WorktreeInfo> => {
    const data = await apiRequest<{ worktree: WorktreeInfo }>(
      `/api/projects/${encodeURIComponent(projectName)}/worktrees`,
      {
        method: "POST",
        body: JSON.stringify({ name: worktreeName }),
      }
    );
    return data.worktree;
  },

  remove: async (
    projectName: string,
    worktreeName: string,
    force: boolean = false
  ): Promise<void> => {
    const params = force ? "?force=true" : "";
    await apiRequest(
      `/api/projects/${encodeURIComponent(
        projectName
      )}/worktrees/${encodeURIComponent(worktreeName)}${params}`,
      { method: "DELETE" }
    );
  },

  open: async (
    projectName: string,
    worktreeName: string,
    editor: string = "cursor"
  ): Promise<void> => {
    await apiRequest(
      `/api/projects/${encodeURIComponent(
        projectName
      )}/worktrees/${encodeURIComponent(worktreeName)}/open`,
      {
        method: "POST",
        body: JSON.stringify({ editor }),
      }
    );
  },
};
