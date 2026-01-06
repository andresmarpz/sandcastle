import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { worktreesApi } from "@/lib/api"

export const worktreeKeys = {
  all: ["worktrees"] as const,
  list: (projectName: string) =>
    [...worktreeKeys.all, "list", projectName] as const,
}

export function useWorktrees(projectName: string | null) {
  return useQuery({
    queryKey: worktreeKeys.list(projectName || ""),
    queryFn: () => worktreesApi.list(projectName!),
    enabled: !!projectName,
  })
}

export function useCreateWorktree() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectName,
      worktreeName,
    }: {
      projectName: string
      worktreeName?: string
    }) => worktreesApi.create(projectName, worktreeName),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: worktreeKeys.list(variables.projectName),
      })
    },
  })
}

export function useRemoveWorktree() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      projectName,
      worktreeName,
      force,
    }: {
      projectName: string
      worktreeName: string
      force?: boolean
    }) => worktreesApi.remove(projectName, worktreeName, force),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: worktreeKeys.list(variables.projectName),
      })
    },
  })
}

export function useOpenWorktree() {
  return useMutation({
    mutationFn: ({
      projectName,
      worktreeName,
      editor,
    }: {
      projectName: string
      worktreeName: string
      editor?: string
    }) => worktreesApi.open(projectName, worktreeName, editor),
  })
}
