import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { projectsApi } from "@/lib/api"

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
}

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.list(),
    queryFn: projectsApi.list,
  })
}

export function useAddProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ gitPath, name }: { gitPath: string; name?: string }) =>
      projectsApi.add(gitPath, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

export function useRemoveProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => projectsApi.remove(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}
