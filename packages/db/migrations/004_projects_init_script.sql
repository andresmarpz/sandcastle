-- Per-project initialization script. Run once in each new worktree workspace
-- right after `git worktree add` succeeds (e.g. `pnpm install`, `just init`).
-- NULL means no script configured; existing projects start with no script.
ALTER TABLE projects ADD COLUMN init_script TEXT;
