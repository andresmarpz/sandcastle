import * as React from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface RepoContextValue {
  repoPath: string | null;
  setRepoPath: (path: string) => void;
  clearRepoPath: () => void;
  selectRepoWithDialog: () => Promise<void>;
}

const RepoContext = React.createContext<RepoContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "sandcastle:repoPath";

export function RepoProvider({ children }: { children: React.ReactNode }) {
  const [repoPath, setRepoPathState] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  const setRepoPath = React.useCallback((path: string) => {
    localStorage.setItem(STORAGE_KEY, path);
    setRepoPathState(path);
  }, []);

  const clearRepoPath = React.useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRepoPathState(null);
  }, []);

  const selectRepoWithDialog = React.useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select Git Repository",
    });

    if (selected && typeof selected === "string") {
      setRepoPath(selected);
    }
  }, [setRepoPath]);

  const value = React.useMemo(
    () => ({ repoPath, setRepoPath, clearRepoPath, selectRepoWithDialog }),
    [repoPath, setRepoPath, clearRepoPath, selectRepoWithDialog],
  );

  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo() {
  const context = React.useContext(RepoContext);
  if (!context) {
    throw new Error("useRepo must be used within a RepoProvider");
  }
  return context;
}
