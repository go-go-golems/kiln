#!/usr/bin/env bash
# On bling: structural sensitivity and reference checks, no timing selection.
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
POLICY_CORPUS_VERSION="${2:-v1}"
if [ "${1:-}" != "--compile-only" ]; then
 node scripts/run-node-tests.mjs packages/kiln/test
fi
for policy in baseline disabled strict default relaxed125 relaxed2; do
 node integrations/passnet/compile_policy.mjs --directory ../policy-corpus-$POLICY_CORPUS_VERSION --output "../policy-artifacts-$POLICY_CORPUS_VERSION/$policy" --policy "../policy-corpus-$POLICY_CORPUS_VERSION/policies/$policy.json" --target a100
done
