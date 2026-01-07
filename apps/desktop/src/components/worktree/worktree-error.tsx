import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

interface WorktreeErrorProps {
  error: unknown;
  onRetry: () => void;
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "_tag" in error) {
    const tagged = error as {
      _tag: string;
      stderr?: string;
      message?: string;
      path?: string;
    };
    switch (tagged._tag) {
      case "GitCommandRpcError":
        return tagged.stderr || "Git command failed";
      case "InvalidRepoRpcError":
        return tagged.message || "Invalid repository";
      case "WorktreeNotFoundRpcError":
        return `Worktree not found: ${tagged.path}`;
      default:
        return "An error occurred";
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}

export function WorktreeError({ error, onRetry }: WorktreeErrorProps) {
  const errorMessage = getErrorMessage(error);

  return (
    <Card>
      <CardContent className="py-12 text-center">
        <div className="bg-destructive/10 mx-auto mb-4 flex size-12 items-center justify-center rounded-full">
          <IconAlertCircle className="text-destructive size-6" />
        </div>
        <h3 className="text-foreground font-medium">
          Failed to load worktrees
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">{errorMessage}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <IconRefresh className="size-4" />
          Try Again
        </Button>
      </CardContent>
    </Card>
  );
}
