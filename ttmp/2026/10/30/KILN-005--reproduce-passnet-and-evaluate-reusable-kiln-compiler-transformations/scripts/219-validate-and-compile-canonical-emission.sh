#!/usr/bin/env bash
# Use subprocess permission for the real Node test runner; spawn errors are failures.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
node scripts/run-node-tests.mjs packages/kiln/test
node integrations/passnet/test_fusion_policy.mjs
node "$TICKET/scripts/203-compile-region-fusion-fixtures.mjs" . "$TICKET/sources/selective-fusion-fixtures" "$TICKET/sources/canonical-fusion-fixtures"
