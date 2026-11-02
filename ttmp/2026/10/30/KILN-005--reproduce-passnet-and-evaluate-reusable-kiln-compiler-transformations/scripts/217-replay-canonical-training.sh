#!/usr/bin/env bash
# Validation replay of observed training programs only; no timing or new study.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
for POLICY in baseline region-work; do
 node integrations/passnet/compile_policy.mjs --directory "$TICKET/sources/policy-corpus-v7" --output "$TICKET/sources/canonicalization-v7-replay/$POLICY" --policy "$TICKET/sources/policy-corpus-v7/policies/$POLICY.json" --target a100 --phase train
done
