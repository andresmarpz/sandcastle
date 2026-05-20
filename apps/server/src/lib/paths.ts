import { mkdir, stat } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { Effect } from "effect"

export const ensureDir = (path: string): Effect.Effect<void, NodeJS.ErrnoException> =>
  Effect.tryPromise({
    try: () => mkdir(path, { recursive: true }).then(() => undefined),
    catch: (cause) => cause as NodeJS.ErrnoException,
  })

export interface PathStat {
  readonly exists: boolean
  readonly isDirectory: boolean
}

export const pathStat = (path: string): Effect.Effect<PathStat> =>
  Effect.tryPromise({
    try: () => stat(path),
    catch: () => null,
  }).pipe(
    Effect.match({
      onSuccess: (s) => ({ exists: true, isDirectory: s.isDirectory() }) satisfies PathStat,
      onFailure: () => ({ exists: false, isDirectory: false }) satisfies PathStat,
    }),
  )

export const isAbsolutePath = (path: string): boolean => isAbsolute(path)

export const worktreePathFor = (
  worktreesRoot: string,
  workspaceId: string,
  sessionId: string,
): string => join(worktreesRoot, workspaceId, sessionId)
