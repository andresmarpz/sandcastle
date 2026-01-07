---
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*)
description: Commit changes
---

# Commit Changes

Commit staged and unstaged changes related to the conversation. Ignore all other files.

## Context

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Staged changes: !`git diff --staged`
- Unstaged changes: !`git diff`
- Recent commits (for style reference): !`git log --oneline -5`

## Step 1: Analyze Changes

Review the diff output:

- Identify what files changed and why
- Group related changes together
- Note any new features, bug fixes, refactors, tests, or documentation changes

## Step 2: Commit Changes

**Commit message rules:**

- One-liner lowercase messages
- Keep commits focused on a single logical change

**Split commits by concern:**

- Piece of logic/feature = separate commits for distinct pieces. Don't add entire features in a single commit. Make surgical commits (max 2-3 files)
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
