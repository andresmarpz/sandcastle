import { useState } from "react"
import {
  ArrowLeft,
  GitBranch,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useWorktrees,
  useCreateWorktree,
  useRemoveWorktree,
  useOpenWorktree,
} from "@/hooks/use-worktrees"
import { useUIStore } from "@/stores/ui"

export function WorktreesPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newWorktreeName, setNewWorktreeName] = useState("")
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [forceDelete, setForceDelete] = useState(false)

  const selectedProject = useUIStore((state) => state.selectedProject)
  const goBackToProjects = useUIStore((state) => state.goBackToProjects)

  const { data: worktrees, isLoading, error } = useWorktrees(selectedProject)
  const createWorktree = useCreateWorktree()
  const removeWorktree = useRemoveWorktree()
  const openWorktree = useOpenWorktree()

  const handleCreateWorktree = async () => {
    if (!selectedProject) return

    try {
      await createWorktree.mutateAsync({
        projectName: selectedProject,
        worktreeName: newWorktreeName.trim() || undefined,
      })
      setNewWorktreeName("")
      setIsCreateDialogOpen(false)
    } catch (err) {
      console.error("Failed to create worktree:", err)
    }
  }

  const handleRemoveWorktree = async (worktreeName: string) => {
    if (!selectedProject) return

    try {
      await removeWorktree.mutateAsync({
        projectName: selectedProject,
        worktreeName,
        force: forceDelete,
      })
      setForceDelete(false)
    } catch (err) {
      console.error("Failed to remove worktree:", err)
    }
  }

  const handleOpenInCursor = async (worktreeName: string) => {
    if (!selectedProject) return

    try {
      await openWorktree.mutateAsync({
        projectName: selectedProject,
        worktreeName,
        editor: "cursor",
      })
    } catch (err) {
      console.error("Failed to open worktree:", err)
    }
  }

  const handleCopyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(null), 2000)
    } catch (err) {
      console.error("Failed to copy path:", err)
    }
  }

  if (!selectedProject) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Failed to load worktrees</p>
        <Button variant="outline" onClick={goBackToProjects}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={goBackToProjects}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {selectedProject}
              </h1>
              <p className="text-muted-foreground">Manage worktrees</p>
            </div>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Worktree
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Worktree</DialogTitle>
                <DialogDescription>
                  Create a new worktree with a new branch for parallel development.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label htmlFor="worktree-name" className="text-sm font-medium">
                    Worktree Name (optional)
                  </label>
                  <Input
                    id="worktree-name"
                    placeholder="feature-branch"
                    value={newWorktreeName}
                    onChange={(e) => setNewWorktreeName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to auto-generate a fun name
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateWorktree}
                  disabled={createWorktree.isPending}
                >
                  {createWorktree.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Create Worktree
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {worktrees?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No worktrees yet</h3>
              <p className="text-muted-foreground text-center mt-2">
                Create a worktree to start working on a feature in parallel
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {worktrees?.map((worktree) => (
              <Card key={worktree.path}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div className="flex items-start gap-3">
                    <GitBranch className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {worktree.branch}
                        </CardTitle>
                        {worktree.isMain && (
                          <Badge variant="secondary" className="gap-1">
                            <Star className="h-3 w-3" />
                            Main
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="font-mono text-xs flex items-center gap-2">
                        {worktree.path}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopyPath(worktree.path)}
                            >
                              {copiedPath === worktree.path ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {copiedPath === worktree.path
                              ? "Copied!"
                              : "Copy path"}
                          </TooltipContent>
                        </Tooltip>
                      </CardDescription>
                      <p className="text-xs text-muted-foreground font-mono">
                        {worktree.commit.slice(0, 7)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!worktree.isMain && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenInCursor(worktree.branch)}
                            disabled={openWorktree.isPending}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open in Cursor
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Open this worktree in Cursor editor
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {!worktree.isMain && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Worktree?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will delete the worktree "{worktree.branch}" and
                              its directory. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="flex items-center gap-2 py-2">
                            <input
                              type="checkbox"
                              id="force-delete"
                              checked={forceDelete}
                              onChange={(e) => setForceDelete(e.target.checked)}
                              className="h-4 w-4"
                            />
                            <label
                              htmlFor="force-delete"
                              className="text-sm text-muted-foreground"
                            >
                              Force delete (even if there are uncommitted changes)
                            </label>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setForceDelete(false)}>
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRemoveWorktree(worktree.branch)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
