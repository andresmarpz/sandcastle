import { Database } from "bun:sqlite"
import { Effect, Layer } from "effect"
import * as path from "node:path"
import * as os from "node:os"
import * as fs from "node:fs"
import { ProjectService, type Project } from "./project.ts"
import { ProjectExistsError, ProjectNotFoundError, InvalidGitRepoError } from "./errors.ts"

const SANDCASTLE_DIR = path.join(os.homedir(), "sandcastle")
const DB_PATH = path.join(SANDCASTLE_DIR, "sandcastle.db")

// Ensure sandcastle directory exists
const ensureDir = () => {
  if (!fs.existsSync(SANDCASTLE_DIR)) {
    fs.mkdirSync(SANDCASTLE_DIR, { recursive: true })
  }
}

// Initialize database with schema
const getDb = (): Database => {
  ensureDir()
  const db = new Database(DB_PATH, { create: true })
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      git_path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
  return db
}

// Check if path is a valid git repo
const isGitRepo = (gitPath: string): boolean => {
  const gitDir = path.join(gitPath, ".git")
  return fs.existsSync(gitDir)
}

// Map database row to Project
const rowToProject = (row: {
  id: string
  name: string
  git_path: string
  created_at: number
}): Project => ({
  id: row.id,
  name: row.name,
  gitPath: row.git_path,
  createdAt: row.created_at,
})

export const ProjectServiceLive = Layer.sync(ProjectService, () => ({
  add: (gitPath: string, name?: string) =>
    Effect.gen(function* () {
      // Resolve to absolute path
      const absolutePath = path.resolve(gitPath)

      // Validate git repo
      if (!isGitRepo(absolutePath)) {
        return yield* Effect.fail(new InvalidGitRepoError({ path: absolutePath }))
      }

      const projectName = name ?? path.basename(absolutePath)
      const id = crypto.randomUUID()
      const db = getDb()

      // Check if project already exists
      const existing = db
        .query("SELECT id FROM projects WHERE name = ?")
        .get(projectName)

      if (existing) {
        return yield* Effect.fail(new ProjectExistsError({ name: projectName }))
      }

      // Insert project
      db.run(
        "INSERT INTO projects (id, name, git_path) VALUES (?, ?, ?)",
        [id, projectName, absolutePath]
      )

      // Fetch and return the inserted project
      const row = db
        .query("SELECT * FROM projects WHERE id = ?")
        .get(id) as { id: string; name: string; git_path: string; created_at: number }

      return rowToProject(row)
    }),

  list: () =>
    Effect.sync(() => {
      const db = getDb()
      const rows = db.query("SELECT * FROM projects ORDER BY name").all() as Array<{
        id: string
        name: string
        git_path: string
        created_at: number
      }>
      return rows.map(rowToProject)
    }),

  get: (name: string) =>
    Effect.gen(function* () {
      const db = getDb()
      const row = db
        .query("SELECT * FROM projects WHERE name = ?")
        .get(name) as { id: string; name: string; git_path: string; created_at: number } | null

      if (!row) {
        return yield* Effect.fail(new ProjectNotFoundError({ name }))
      }

      return rowToProject(row)
    }),

  remove: (name: string) =>
    Effect.gen(function* () {
      const db = getDb()

      // Check if project exists
      const existing = db
        .query("SELECT id FROM projects WHERE name = ?")
        .get(name)

      if (!existing) {
        return yield* Effect.fail(new ProjectNotFoundError({ name }))
      }

      db.run("DELETE FROM projects WHERE name = ?", [name])
    }),
}))
