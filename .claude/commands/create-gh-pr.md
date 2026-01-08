---
allowed-tools: Bash(git *), Bash(gh pr *), Bash(bun run *), Bash(sed *), Bash(echo *)
description: Create GitHub PR
---

# Create GitHub PR

Create a GitHub Pull Request following best practices for commit hygiene and PR descriptions.

## Context

- Current branch: !`git branch --show-current`
- Main branch: !`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main"`
- Git status: !`git status --short`
- Staged changes: !`git diff --staged`
- Unstaged changes: !`git diff`
- Commits ahead of main: !`git log origin/main..HEAD --oneline 2>/dev/null || echo "No commits ahead of main"`
- Recent commits (for style reference): !`git log --oneline -5`

## Step 1: Analyze Changes

Review the context above:

- Identify what files changed and why
- Group related changes together
- Note any new features, bug fixes, refactors, tests, or documentation changes
- Look for any issues that should be fixed before committing

## Step 2: Run Quality Checks

Run appropriate quality scripts before committing:

```bash
bun run lint
bun run typecheck
bun test
```

If checks fail, fix the issues before proceeding.

## Step 3: Commit Changes

**Commit message rules:**

- One-liner lowercase messages
- Keep commits focused on a single logical change
- You can add attribution

**Split commits by concern:**

- Piece of logic/feature = separate commits for distinct pieces. Don't add entire features in a single commit. Make surgical commits (max 2-3 files)
- Tests = separate commit(s)
- Documentation = separate commit
- Config/tooling = separate commit

**Example workflow:**

```bash
git add path/to/related/files
git commit -m "feat: add user authentication"

git add tests/
git commit -m "test: add auth tests"

git add README.md
git commit -m "docs: document auth usage"
```

## Step 4: Create GitHub PR

Push the branch and create the PR:

```bash
git push -u origin $(git branch --show-current)

gh pr create --title "feat: short descriptive title" --body "$(cat <<'EOF'
<include useful context about the PR here>, don't add too many headings, keep it simple, understandable and easy to read>
)"
```

**PR Description Guidelines:**

- Start with a clear summary of what and why
- List specific changes made
- Include usage examples for new APIs/features
- Note any breaking changes or special considerations
- Keep it concise but informative
