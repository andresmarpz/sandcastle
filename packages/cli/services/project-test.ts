import { Effect, Layer, Ref } from "effect"
import { ProjectService, type Project } from "./project.ts"
import { ProjectExistsError, ProjectNotFoundError, InvalidGitRepoError } from "./errors.ts"

export interface ProjectServiceTestConfig {
  /** Paths that should be considered valid git repos */
  validGitPaths?: Set<string>
  /** Initial projects to seed */
  initialProjects?: Project[]
}

/**
 * Creates a test layer for ProjectService with in-memory storage.
 * Optionally configure which paths are valid git repos and seed initial projects.
 */
export const makeProjectServiceTest = (config: ProjectServiceTestConfig = {}) => {
  const { validGitPaths = new Set(), initialProjects = [] } = config

  return Layer.effect(
    ProjectService,
    Effect.gen(function* () {
      const projectsRef = yield* Ref.make<Map<string, Project>>(
        new Map(initialProjects.map((p) => [p.name, p]))
      )

      return {
        add: (gitPath: string, name?: string) =>
          Effect.gen(function* () {
            // Validate git repo (only paths in validGitPaths are considered valid)
            if (!validGitPaths.has(gitPath)) {
              return yield* Effect.fail(new InvalidGitRepoError({ path: gitPath }))
            }

            const projectName = name ?? gitPath.split("/").pop() ?? "unknown"
            const projects = yield* Ref.get(projectsRef)

            if (projects.has(projectName)) {
              return yield* Effect.fail(new ProjectExistsError({ name: projectName }))
            }

            const project: Project = {
              id: crypto.randomUUID(),
              name: projectName,
              gitPath,
              createdAt: Date.now(),
            }

            yield* Ref.update(projectsRef, (map) => new Map(map).set(projectName, project))

            return project
          }),

        list: () =>
          Effect.gen(function* () {
            const projects = yield* Ref.get(projectsRef)
            return Array.from(projects.values()).sort((a, b) => a.name.localeCompare(b.name))
          }),

        get: (name: string) =>
          Effect.gen(function* () {
            const projects = yield* Ref.get(projectsRef)
            const project = projects.get(name)

            if (!project) {
              return yield* Effect.fail(new ProjectNotFoundError({ name }))
            }

            return project
          }),

        remove: (name: string) =>
          Effect.gen(function* () {
            const projects = yield* Ref.get(projectsRef)

            if (!projects.has(name)) {
              return yield* Effect.fail(new ProjectNotFoundError({ name }))
            }

            yield* Ref.update(projectsRef, (map) => {
              const newMap = new Map(map)
              newMap.delete(name)
              return newMap
            })
          }),
      }
    })
  )
}

/**
 * Default test layer with no valid paths (all paths will fail validation)
 */
export const ProjectServiceTest = makeProjectServiceTest()
