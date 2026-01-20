---
allowed-tools: Bash(git *), Bash(gh pr *), Bash(bun run *)
description: Commit changes and create PR
---

# Commit Changes and Create PR

Commit staged and unstaged changes related to the conversation, then create a GitHub Pull Request.

## Context

- Current branch: !`git branch --show-current`
- Main branch: !`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main"`
- Git status: !`git status --short`
- Staged changes: !`git diff --staged`
- Unstaged changes: !`git diff`
- Commits ahead of main: !`git log origin/main..HEAD --oneline 2>/dev/null || echo "No commits ahead of main"`
- Recent commits (for style reference): !`git log --oneline -5`

## Step 1: Analyze Changes

Review the diff output:

- Identify what files changed and why
- Group related changes together
- Note any new features, bug fixes, refactors, tests, or documentation changes

## Step 2: Run Quality Checks

Run quality checks before committing:

```bash
bun biome
bun typecheck
```

If checks fail, fix the issues before proceeding.

## Step 3: Commit Changes

**Commit message rules:**

- Use conventional commit format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- One-liner only, lowercase, no period at the end
- Keep commits focused on a single logical change

## Step 4: Create GitHub PR

Push the branch and create the PR:

```bash
git push -u origin $(git branch --show-current)

gh pr create --title "type(scope): short descriptive title" --body "$(cat <<'EOF'
## Summary

- <bullet point describing change 1>
- <bullet point describing change 2>
- <bullet point describing change 3>
EOF
)"
```

**PR Guidelines:**

- Title uses conventional commit format: `type(scope): short descriptive title`
- Description contains a Summary section with bullet points of changes made
- Keep it concise but informative
