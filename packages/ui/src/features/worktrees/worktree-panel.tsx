"use client";

import { useMemo } from "react";
import { Result, useAtomValue } from "@effect-atom/atom-react";
import * as Option from "effect/Option";

import { worktreeAtomFamily } from "@/api/worktree-atoms";
import { WorktreeContent } from "./worktree-content";

interface WorktreePanelProps {
  worktreeId: string;
}

export function WorktreePanel({ worktreeId }: WorktreePanelProps) {
  // Use stable atom from family for proper caching
  const worktreeAtom = useMemo(
    () => worktreeAtomFamily(worktreeId),
    [worktreeId]
  );
  const worktreeResult = useAtomValue(worktreeAtom);

  return (
    <div className="h-full">
      {Result.matchWithWaiting(worktreeResult, {
        onWaiting: (result) => {
          const cached = Option.getOrNull(Result.value(result));
          if (!cached) {
            return (
              <div className="text-muted-foreground text-sm p-4">
                Loading...
              </div>
            );
          }
          return <WorktreeContent worktree={cached} isRefreshing />;
        },
        onError: () => (
          <div className="text-destructive text-sm p-4">
            Failed to load worktree details.
          </div>
        ),
        onDefect: () => (
          <div className="text-destructive text-sm p-4">
            Failed to load worktree details.
          </div>
        ),
        onSuccess: (success) => <WorktreeContent worktree={success.value} />,
      })}
    </div>
  );
}
