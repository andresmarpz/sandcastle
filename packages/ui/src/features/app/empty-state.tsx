export function EmptyState() {
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-3 py-2 border-b border-border bg-background" />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a worktree to start chatting
      </div>
    </div>
  );
}
