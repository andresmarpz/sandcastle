import { Database } from "bun:sqlite";
import { Effect, Layer } from "effect";
import { WorktreeService, WorktreeServiceLive } from "@sandcastle/worktree";
import { petname } from "@sandcastle/petname";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

// ─── Types ─────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  gitPath: string;
  createdAt: number;
}

interface WorktreeInfo {
  path: string;
  branch: string;
  commit: string;
  isMain: boolean;
}

// ─── Database Setup ────────────────────────────────────────────────────────

const SANDCASTLE_DIR = path.join(os.homedir(), "sandcastle");
const DB_PATH = path.join(SANDCASTLE_DIR, "sandcastle.db");

const ensureDir = () => {
  if (!fs.existsSync(SANDCASTLE_DIR)) {
    fs.mkdirSync(SANDCASTLE_DIR, { recursive: true });
  }
};

const getDb = (): Database => {
  ensureDir();
  const db = new Database(DB_PATH, { create: true });
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      git_path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  return db;
};

const isGitRepo = (gitPath: string): boolean => {
  const gitDir = path.join(gitPath, ".git");
  return fs.existsSync(gitDir);
};

const rowToProject = (row: {
  id: string;
  name: string;
  git_path: string;
  created_at: number;
}): Project => ({
  id: row.id,
  name: row.name,
  gitPath: row.git_path,
  createdAt: row.created_at,
});

// ─── Project Operations ────────────────────────────────────────────────────

const listProjects = (): Project[] => {
  const db = getDb();
  const rows = db.query("SELECT * FROM projects ORDER BY name").all() as Array<{
    id: string;
    name: string;
    git_path: string;
    created_at: number;
  }>;
  return rows.map(rowToProject);
};

const addProject = (
  gitPath: string,
  name?: string
): { success: true; project: Project } | { success: false; error: string } => {
  const absolutePath = path.resolve(gitPath);

  if (!isGitRepo(absolutePath)) {
    return {
      success: false,
      error: `Not a valid git repository: ${absolutePath}`,
    };
  }

  const projectName = name ?? path.basename(absolutePath);
  const id = crypto.randomUUID();
  const db = getDb();

  const existing = db
    .query("SELECT id FROM projects WHERE name = ?")
    .get(projectName);

  if (existing) {
    return { success: false, error: `Project '${projectName}' already exists` };
  }

  db.run("INSERT INTO projects (id, name, git_path) VALUES (?, ?, ?)", [
    id,
    projectName,
    absolutePath,
  ]);

  const row = db.query("SELECT * FROM projects WHERE id = ?").get(id) as {
    id: string;
    name: string;
    git_path: string;
    created_at: number;
  };

  return { success: true, project: rowToProject(row) };
};

const getProject = (name: string): Project | null => {
  const db = getDb();
  const row = db.query("SELECT * FROM projects WHERE name = ?").get(name) as {
    id: string;
    name: string;
    git_path: string;
    created_at: number;
  } | null;

  return row ? rowToProject(row) : null;
};

const removeProject = (
  name: string
): { success: true } | { success: false; error: string } => {
  const db = getDb();
  const existing = db.query("SELECT id FROM projects WHERE name = ?").get(name);

  if (!existing) {
    return { success: false, error: `Project '${name}' not found` };
  }

  db.run("DELETE FROM projects WHERE name = ?", [name]);
  return { success: true };
};

// ─── Worktree Operations ───────────────────────────────────────────────────

const computeWorktreePath = (
  projectName: string,
  worktreeName: string
): string => {
  return path.join(
    os.homedir(),
    "sandcastle",
    "worktrees",
    projectName,
    worktreeName
  );
};

const runtime = Layer.toRuntime(WorktreeServiceLive).pipe(
  Effect.scoped,
  Effect.runSync
);

const listWorktrees = async (
  projectName: string
): Promise<
  | { success: true; worktrees: WorktreeInfo[] }
  | { success: false; error: string }
> => {
  const project = getProject(projectName);
  if (!project) {
    return { success: false, error: `Project '${projectName}' not found` };
  }

  const program = Effect.gen(function* () {
    const service = yield* WorktreeService;
    return yield* service.list(project.gitPath);
  });

  try {
    const worktrees = await Effect.runPromise(
      program.pipe(Effect.provide(runtime))
    );
    return { success: true, worktrees };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

const createWorktree = async (
  projectName: string,
  worktreeName?: string
): Promise<
  { success: true; worktree: WorktreeInfo } | { success: false; error: string }
> => {
  const project = getProject(projectName);
  if (!project) {
    return { success: false, error: `Project '${projectName}' not found` };
  }

  const name = worktreeName ?? petname();
  const worktreePath = computeWorktreePath(projectName, name);

  const program = Effect.gen(function* () {
    const service = yield* WorktreeService;
    return yield* service.create({
      repoPath: project.gitPath,
      worktreePath,
      branch: name,
      createBranch: true,
      fromRef: "HEAD",
    });
  });

  try {
    const worktree = await Effect.runPromise(
      program.pipe(Effect.provide(runtime))
    );
    return { success: true, worktree };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

const removeWorktree = async (
  projectName: string,
  worktreeName: string,
  force: boolean = false
): Promise<{ success: true } | { success: false; error: string }> => {
  const project = getProject(projectName);
  if (!project) {
    return { success: false, error: `Project '${projectName}' not found` };
  }

  const worktreePath = computeWorktreePath(projectName, worktreeName);

  const program = Effect.gen(function* () {
    const service = yield* WorktreeService;
    return yield* service.remove({
      repoPath: project.gitPath,
      worktreePath,
      force,
    });
  });

  try {
    await Effect.runPromise(program.pipe(Effect.provide(runtime)));
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

const openWorktree = async (
  projectName: string,
  worktreeName: string,
  editor: string = "cursor"
): Promise<{ success: true } | { success: false; error: string }> => {
  const project = getProject(projectName);
  if (!project) {
    return { success: false, error: `Project '${projectName}' not found` };
  }

  const worktreePath = computeWorktreePath(projectName, worktreeName);

  try {
    await Bun.$`${editor} ${worktreePath}`.quiet();
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

// ─── HTTP Server ───────────────────────────────────────────────────────────

const PORT = 8015;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data: unknown, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
};

Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ─── Projects Routes ─────────────────────────────────────────────────

    // GET /api/projects - List all projects
    if (method === "GET" && url.pathname === "/api/projects") {
      const projects = listProjects();
      return json({ projects });
    }

    // POST /api/projects - Add a new project
    if (method === "POST" && url.pathname === "/api/projects") {
      const body = (await req.json()) as { gitPath: string; name?: string };
      const result = addProject(body.gitPath, body.name);
      if (result.success) {
        return json({ project: result.project }, 201);
      }
      return json({ error: result.error }, 400);
    }

    // DELETE /api/projects/:name - Remove a project
    const projectDeleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (method === "DELETE" && projectDeleteMatch?.[1]) {
      const projectName = decodeURIComponent(projectDeleteMatch[1]);
      const result = removeProject(projectName);
      if (result.success) {
        return json({ success: true });
      }
      return json({ error: result.error }, 404);
    }

    // ─── Worktrees Routes ────────────────────────────────────────────────

    // GET /api/projects/:name/worktrees - List worktrees
    const worktreeListMatch = url.pathname.match(
      /^\/api\/projects\/([^/]+)\/worktrees$/
    );
    if (method === "GET" && worktreeListMatch?.[1]) {
      const projectName = decodeURIComponent(worktreeListMatch[1]);
      const result = await listWorktrees(projectName);
      if (result.success) {
        return json({ worktrees: result.worktrees });
      }
      return json({ error: result.error }, 404);
    }

    // POST /api/projects/:name/worktrees - Create a worktree
    if (method === "POST" && worktreeListMatch?.[1]) {
      const projectName = decodeURIComponent(worktreeListMatch[1]);
      const body = (await req.json()) as { name?: string };
      const result = await createWorktree(projectName, body.name);
      if (result.success) {
        return json({ worktree: result.worktree }, 201);
      }
      return json({ error: result.error }, 400);
    }

    // DELETE /api/projects/:name/worktrees/:worktreeName - Remove a worktree
    const worktreeDeleteMatch = url.pathname.match(
      /^\/api\/projects\/([^/]+)\/worktrees\/([^/]+)$/
    );
    if (
      method === "DELETE" &&
      worktreeDeleteMatch?.[1] &&
      worktreeDeleteMatch[2]
    ) {
      const projectName = decodeURIComponent(worktreeDeleteMatch[1]);
      const worktreeName = decodeURIComponent(worktreeDeleteMatch[2]);
      const force = url.searchParams.get("force") === "true";
      const result = await removeWorktree(projectName, worktreeName, force);
      if (result.success) {
        return json({ success: true });
      }
      return json({ error: result.error }, 400);
    }

    // POST /api/projects/:name/worktrees/:worktreeName/open - Open in editor
    const worktreeOpenMatch = url.pathname.match(
      /^\/api\/projects\/([^/]+)\/worktrees\/([^/]+)\/open$/
    );
    if (method === "POST" && worktreeOpenMatch?.[1] && worktreeOpenMatch[2]) {
      const projectName = decodeURIComponent(worktreeOpenMatch[1]);
      const worktreeName = decodeURIComponent(worktreeOpenMatch[2]);
      const body = (await req.json().catch(() => ({}))) as { editor?: string };
      const result = await openWorktree(projectName, worktreeName, body.editor);
      if (result.success) {
        return json({ success: true });
      }
      return json({ error: result.error }, 400);
    }

    // ─── Health Check ────────────────────────────────────────────────────

    if (method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" });
    }

    // ─── 404 ─────────────────────────────────────────────────────────────

    return json({ error: "Not found" }, 404);
  },
});

console.log(`Sandcastle backend running on http://localhost:${PORT}`);
