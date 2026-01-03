# Create GitHub PR

Create a GitHub Pull Request following best practices for commit hygiene and PR descriptions.

## Step 1: Gather Git Context

Start by running these commands in parallel to understand the current state:

```bash
git status
git diff
git diff --staged
git log --oneline -20
git branch --show-current
git log origin/main..HEAD --oneline 2>/dev/null || echo "No commits ahead of main"
```

If the user provides specific instructions, follow those instead.

## Step 2: Analyze Code Changes

Review the diff output carefully:

- Identify what files changed and why
- Group related changes together
- Note any new features, bug fixes, refactors, tests, or documentation changes
- Look for any issues that should be fixed before committing

## Step 3: Run Quality Checks

Find and read the most relevant `package.json` file to identify available scripts:

```bash
cat package.json 2>/dev/null || cat packages/*/package.json 2>/dev/null | head -100
```

Run the appropriate quality scripts. Common ones to look for:

- `lint` or `eslint` - code style checks
- `typecheck` or `tsc` - TypeScript type checking
- `test` - run tests
- `build` - ensure code builds

Example:

```bash
bun run lint
bun run typecheck
bun test
```

If checks fail, fix the issues before proceeding.

## Step 4: Commit Changes

**CRITICAL RULES for commits:**

- One-liner lowercase messages
- Use conventional commit format: `type: short description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`
- NO "authored by claude code" or similar footers
- Keep commits short and focused on a single logical change
- Separate commits for different concerns:
  - Logic/feature implementation = split into multiple commits if there are distinct logical pieces
  - Tests = separate commit(s)
  - Documentation = separate commit
  - Config/tooling changes = separate commit

**Commit workflow:**

```bash
# Stage related files only
git add path/to/related/files

# Commit with conventional message
git commit -m "feat: add user authentication endpoint"

# Repeat for each logical group of changes
git add tests/
git commit -m "test: add auth endpoint tests"

git add README.md
git commit -m "docs: document auth api usage"
```

## Step 5: Create GitHub PR

Push the branch and create the PR:

```bash
# Push with upstream tracking
git push -u origin $(git branch --show-current)

# Create PR with detailed description
gh pr create --title "feat: short descriptive title" --body "$(cat <<'EOF'
## Summary

Brief description of what this PR does and why.

## Changes

- List of specific changes made
- Another change
- And another

## Usage Example

If adding new API/feature, show a brief example:

```ts
// Example code showing how to use the new feature
const result = await newFeature();
```

## Testing

- [ ] Tests added/updated
- [ ] Manual testing done

## Notes

Any additional context, breaking changes, or things reviewers should know.
EOF
)"
```

**PR Description Guidelines:**
- Start with a clear summary of what and why
- List specific changes made
- Include usage examples for new APIs/features
- Add testing checklist
- Note any breaking changes or special considerations
- Keep it concise but informative
