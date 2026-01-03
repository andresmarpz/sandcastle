import { Context, Effect } from "effect"
import type { ProjectExistsError, ProjectNotFoundError, InvalidGitRepoError } from "./errors.ts"

export interface Project {
  id: string
  name: string
  gitPath: string
  createdAt: number
}

export class ProjectService extends Context.Tag("ProjectService")<
  ProjectService,
  {
    add: (
      gitPath: string,
      name?: string
    ) => Effect.Effect<Project, ProjectExistsError | InvalidGitRepoError>

    list: () => Effect.Effect<Project[]>

    get: (name: string) => Effect.Effect<Project, ProjectNotFoundError>

    remove: (name: string) => Effect.Effect<void, ProjectNotFoundError>
  }
>() {}
