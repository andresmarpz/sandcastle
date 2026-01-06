import { useState } from "react";
import { FolderGit2, Plus, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import {
  useProjects,
  useAddProject,
  useRemoveProject,
} from "@/hooks/use-projects";
import { useUIStore } from "@/stores/ui";

export function ProjectsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newProjectPath, setNewProjectPath] = useState("");
  const [newProjectName, setNewProjectName] = useState("");

  const { data: projects, isLoading, error } = useProjects();
  const addProject = useAddProject();
  const removeProject = useRemoveProject();
  const selectProject = useUIStore((state) => state.selectProject);

  const handleAddProject = async () => {
    if (!newProjectPath.trim()) return;

    try {
      await addProject.mutateAsync({
        gitPath: newProjectPath.trim(),
        name: newProjectName.trim() || undefined,
      });
      setNewProjectPath("");
      setNewProjectName("");
      setIsAddDialogOpen(false);
    } catch (err) {
      console.error("Failed to add project:", err);
    }
  };

  const handleRemoveProject = async (projectName: string) => {
    try {
      await removeProject.mutateAsync(projectName);
    } catch (err) {
      console.error("Failed to remove project:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Failed to load projects</p>
        <p className="text-sm text-muted-foreground">
          Make sure the backend server is running on port 8015
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your Sandcastle projects
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Project</DialogTitle>
              <DialogDescription>
                Register an existing Git repository as a Sandcastle project.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="path" className="text-sm font-medium">
                  Repository Path
                </label>
                <Input
                  id="path"
                  placeholder="/path/to/your/repo"
                  value={newProjectPath}
                  onChange={(e) => setNewProjectPath(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Project Name (optional)
                </label>
                <Input
                  id="name"
                  placeholder="my-project"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to the repository folder name
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddProject}
                disabled={!newProjectPath.trim() || addProject.isPending}
              >
                {addProject.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Add Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No projects yet</h3>
            <p className="text-muted-foreground text-center mt-2">
              Add a Git repository to get started with Sandcastle
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {projects?.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => selectProject(project.name)}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {project.gitPath}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove Project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will unregister "{project.name}" from Sandcastle.
                          The repository and its worktrees will not be deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRemoveProject(project.name)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
