#!/bin/bash

# Vercel Ignored Build Step
# https://vercel.com/docs/project-configuration/git-settings#ignored-build-step
#
# Exit 0 = Cancel build
# Exit 1 = Proceed with build

# Skip release-please branches (they create unnecessary preview deployments)
if [[ "$VERCEL_GIT_COMMIT_REF" == release-please--* ]]; then
  echo "⏭ Release-please branch, skipping build"
  exit 0
fi

# Build everything else (preview and production)
exit 1
