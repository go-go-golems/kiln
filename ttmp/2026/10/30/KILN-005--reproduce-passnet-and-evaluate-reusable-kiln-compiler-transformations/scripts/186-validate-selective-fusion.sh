#!/usr/bin/env bash
# Local worktree with Node 26 already active.
set -eu
node scripts/run-node-tests.mjs packages/kiln/test
node integrations/passnet/test_fusion_policy.mjs
