---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

# Default to using Bun instead of Node.js

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

## Workflow

- Never run development servers, always assume these are already running by me.
- No need to run 'bun build' ever.

### Pre-commit Hooks

This repo has pre-commit hooks that automatically run on every commit:
- **Typecheck** - runs `bun typecheck` on the full codebase
- **Biome** - runs `bun biome` (format + lint), auto-stages fixes

You do NOT need to run these checks manually. Just commit your changes and the hooks will run automatically. If there are errors, the commit will fail and show you what needs fixing.

**Commit frequently** after completing significant chunks of work. This ensures your changes pass checks incrementally rather than accumulating issues.

Do not bypass checks with `@ts-ignore`, `@ts-expect-error`, or by disabling Biome rules. Address the root cause instead.

## Effect.ts Library Best Practices

**Before implementing Effect features**, run `bunx effect-solutions list` and read the relevant guide.

Topics include: services and layers, data modeling, error handling, configuration, testing, HTTP clients, CLIs, observability, and project structure.

**Effect Source Code Reference:** `~/.local/share/effect-solutions/effect`

Search the real source code to figure out how the library works. Use an Explore subagent for this. Never look into `node_modules`, look at the real source code instead.

### Effect Atom (effect-atom) library

Prefer reading the existing doc first at 'docs/effect-atom-guide.md'. If you need further investigation the source code is at `~/.local/share/effect-solutions/effect-atom`.

## Git Committing or Making a PR

When committing work or creating a pull request, always use the `/commit-and-pr` skill. This skill ensures:

- Conventional commit messages (one-liner only)
- Quality checks are run before committing
- PR titles use conventional commit format
- PR descriptions include a summary with bullet points of changes made
