# Commit Changes

Commit staged and unstaged changes following conventional commit practices.

## Step 1: Gather Git Context

Run these commands in parallel:

```bash
git status
git diff
git diff --staged
git log --oneline -10
```

## Step 2: Analyze Changes

Review the diff output:

- Identify what files changed and why
- Group related changes together
- Note any new features, bug fixes, refactors, tests, or documentation changes

## Step 3: Commit Changes

**Commit message rules:**

- One-liner lowercase messages
- Use conventional commit format: `type: short description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- NO "authored by claude code" or similar footers
- Keep commits focused on a single logical change

**Split commits by concern:**

- Logic/feature = separate commits for distinct pieces
- Tests = separate commit(s)
- Documentation = separate commit
- Config/tooling = separate commit

**Example workflow:**

```bash
# Stage related files only
git add path/to/related/files
git commit -m "feat: add user authentication"

# Separate commit for tests
git add tests/
git commit -m "test: add auth tests"

# Separate commit for docs
git add README.md
git commit -m "docs: document auth usage"
```
