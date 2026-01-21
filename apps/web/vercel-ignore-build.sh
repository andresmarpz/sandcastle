#!/bin/bash

# Vercel Ignored Build Step
# https://vercel.com/docs/project-configuration/git-settings#ignored-build-step
#
# Exit 0 = Cancel build
# Exit 1 = Proceed with build

# Skip release-please branches (they trigger both preview AND production builds)
if [[ "$VERCEL_GIT_COMMIT_REF" == release-please--* ]]; then
  echo "⏭ Release-please branch, skipping build"
  exit 0
fi

# Always build preview deployments (PRs)
if [ "$VERCEL_ENV" != "production" ]; then
  exit 1
fi

# Production: only build on release commits from release-please
if git log -1 --pretty=%s | grep -qE "^chore\(main\): release"; then
  echo "✓ Release commit - building production"
  exit 1
fi

echo "⏭ Not a release commit, skipping production build"
exit 0
