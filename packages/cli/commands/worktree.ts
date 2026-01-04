import { Args, Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { ConfigService } from "@sandcastle/config";
import { WorktreeService } from "@sandcastle/worktree";
import { petname } from "@sandcastle/petname";
import { ProjectService } from "../services/index.ts";
import * as path from "node:path";
import * as os from "node:os";

// Helper to compute worktree path using project name
export const computeWorktreePath = (
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

// Arguments
const projectArg = Args.text({ name: "project" }).pipe(
  Args.withDescription("Project name (registered with 'project add')")
);

const worktreeNameArg = Args.text({ name: "name" }).pipe(
  Args.withDescription("Worktree/branch name (auto-generated if not provided)"),
  Args.optional
);

const worktreeNameArgRequired = Args.text({ name: "name" }).pipe(
  Args.withDescription("Worktree/branch name")
);

// Options
const fromOption = Options.text("from").pipe(
  Options.optional,
  Options.withDescription(
    "Branch or ref to base the worktree from (defaults to HEAD)"
  )
);

const forceOption = Options.boolean("force").pipe(
  Options.withAlias("f"),
  Options.withDescription("Force removal even if worktree is dirty")
);

const editorOption = Options.text("editor").pipe(
  Options.optional,
  Options.withAlias("e"),
  Options.withDescription("Editor command to use (default: cursor)")
);

const openOption = Options.boolean("open").pipe(
  Options.withAlias("o"),
  Options.withDescription("Open worktree in editor after creation")
);

const noInitOption = Options.boolean("no-init").pipe(
  Options.withDescription("Skip running the init hook from sandcastle.config.ts")
);

// Handler functions (exported for testing)
export interface CreateWorktreeOptions {
  project: string;
  name: Option.Option<string>;
  from: Option.Option<string>;
  open: boolean;
  editor: Option.Option<string>;
  skipInit?: boolean;
}

export const createWorktreeHandler = (options: CreateWorktreeOptions) =>
  Effect.gen(function* () {
    const { project, name: nameOption, from, open, editor, skipInit = false } = options;

    // Resolve project name to repo path
    const projects = yield* ProjectService;
    const proj = yield* projects.get(project);
    const repoPath = proj.gitPath;

    // Use provided name or auto-generate with petname
    const worktreeName = Option.getOrElse(nameOption, () => petname());

    const service = yield* WorktreeService;
    const worktreePath = computeWorktreePath(proj.name, worktreeName);
    const fromRef = Option.getOrElse(from, () => "HEAD");

    yield* Effect.log(
      `Creating worktree '${worktreeName}' for project '${project}'`
    );
    yield* Effect.log(`  Path: ${worktreePath}`);
    yield* Effect.log(`  Based on: ${fromRef}`);

    const result = yield* service.create({
      repoPath,
      worktreePath,
      branch: worktreeName,
      createBranch: true,
      fromRef,
    });

    yield* Effect.log(`Worktree created successfully.`);
    yield* Effect.log(`  Branch: ${result.branch}`);
    yield* Effect.log(`  Commit: ${result.commit}`);

    // Run init hook (unless skipped)
    if (!skipInit) {
      const configService = yield* ConfigService;
      const initParams = {
        baseRepoPath: repoPath,
        worktreePath,
        projectName: proj.name,
        worktreeName,
        branch: worktreeName,
        baseBranch: fromRef,
      };

      yield* configService.loadAndRunInit(repoPath, initParams).pipe(
        Effect.tapError((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(`Init hook failed: ${error}`);
            yield* Effect.logWarning("Rolling back worktree...");

            // Rollback: remove the created worktree
            yield* service.remove({
              repoPath,
              worktreePath,
              force: true,
            }).pipe(
              Effect.tapError((removeErr) =>
                Effect.logError(`Failed to rollback worktree: ${removeErr}`)
              ),
              Effect.catchAll(() => Effect.void)
            );
          })
        )
      );
    }

    // Open in editor if requested
    if (open) {
      const editorCmd = Option.getOrElse(editor, () => "cursor");
      yield* Effect.promise(() => Bun.$`${editorCmd} ${worktreePath}`.quiet());
      yield* Effect.log(`Opened in ${editorCmd}.`);
    }
  });

// Commands
export const worktreeCreate = Command.make(
  "create",
  {
    project: projectArg,
    name: worktreeNameArg,
    from: fromOption,
    open: openOption,
    editor: editorOption,
    noInit: noInitOption,
  },
  (args) => createWorktreeHandler({ ...args, skipInit: args.noInit })
).pipe(Command.withDescription("Create a new worktree for a project"));

export interface ListWorktreesOptions {
  project: string;
}

export const listWorktreesHandler = (options: ListWorktreesOptions) =>
  Effect.gen(function* () {
    const { project } = options;

    // Resolve project name to repo path
    const projects = yield* ProjectService;
    const proj = yield* projects.get(project);

    const service = yield* WorktreeService;

    yield* Effect.log(`Worktrees for '${project}':\n`);
    const worktrees = yield* service.list(proj.gitPath);

    if (worktrees.length === 0) {
      yield* Effect.log("No worktrees found.");
      return;
    }

    for (const wt of worktrees) {
      const mainIndicator = wt.isMain ? " (main)" : "";
      yield* Effect.log(`${wt.branch}${mainIndicator}`);
      yield* Effect.log(`  Path: ${wt.path}`);
      yield* Effect.log(`  Commit: ${wt.commit}`);
    }
  });

export const worktreeList = Command.make(
  "list",
  { project: projectArg },
  listWorktreesHandler
).pipe(Command.withDescription("List worktrees for a project"));

export interface DeleteWorktreeOptions {
  project: string;
  name: string;
  force: boolean;
}

export const deleteWorktreeHandler = (options: DeleteWorktreeOptions) =>
  Effect.gen(function* () {
    const { project, name, force } = options;

    // Resolve project name to repo path
    const projects = yield* ProjectService;
    const proj = yield* projects.get(project);

    const service = yield* WorktreeService;
    const worktreePath = computeWorktreePath(proj.name, name);

    yield* Effect.log(`Deleting worktree '${name}' from project '${project}'`);

    yield* service.remove({
      repoPath: proj.gitPath,
      worktreePath,
      force,
    });

    yield* Effect.log("Worktree deleted successfully.");
  });

export const worktreeDelete = Command.make(
  "delete",
  { project: projectArg, name: worktreeNameArgRequired, force: forceOption },
  deleteWorktreeHandler
).pipe(Command.withDescription("Delete a worktree"));

export interface OpenWorktreeOptions {
  project: string;
  name: Option.Option<string>;
  editor: Option.Option<string>;
}

export const openWorktreeHandler = (options: OpenWorktreeOptions) =>
  Effect.gen(function* () {
    const { project, name: nameOption, editor } = options;

    // Resolve project name to repo path
    const projects = yield* ProjectService;
    const proj = yield* projects.get(project);

    // Name is required for open command
    const worktreeName = Option.getOrThrowWith(
      nameOption,
      () => new Error("Worktree name is required for 'open' command")
    );

    const service = yield* WorktreeService;
    const worktreePath = computeWorktreePath(proj.name, worktreeName);

    // Verify worktree exists
    yield* service.get(proj.gitPath, worktreePath);

    const editorCmd = Option.getOrElse(editor, () => "cursor");
    yield* Effect.log(`Opening worktree '${worktreeName}' at ${worktreePath}`);

    yield* Effect.promise(() => Bun.$`${editorCmd} ${worktreePath}`.quiet());

    yield* Effect.log(`Opened in ${editorCmd}.`);
  });

export const worktreeOpen = Command.make(
  "open",
  { project: projectArg, name: worktreeNameArg, editor: editorOption },
  openWorktreeHandler
).pipe(Command.withDescription("Open a worktree in your editor"));

export interface PruneWorktreesOptions {
  project: string;
}

export const pruneWorktreesHandler = (options: PruneWorktreesOptions) =>
  Effect.gen(function* () {
    const { project } = options;

    // Resolve project name to repo path
    const projects = yield* ProjectService;
    const proj = yield* projects.get(project);

    const service = yield* WorktreeService;

    yield* Effect.log(`Pruning stale worktree references for '${project}'...`);
    yield* service.prune(proj.gitPath);
    yield* Effect.log("Pruned successfully.");
  });

export const worktreePrune = Command.make(
  "prune",
  { project: projectArg },
  pruneWorktreesHandler
).pipe(Command.withDescription("Clean up stale worktree references"));

// Parent command with subcommands
export const worktreeCommand = Command.make("worktree").pipe(
  Command.withDescription("Manage worktrees"),
  Command.withSubcommands([
    worktreeCreate,
    worktreeList,
    worktreeDelete,
    worktreeOpen,
    worktreePrune,
  ])
);
