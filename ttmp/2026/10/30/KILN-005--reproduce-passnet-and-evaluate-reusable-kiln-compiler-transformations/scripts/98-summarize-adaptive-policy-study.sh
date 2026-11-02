#!/usr/bin/env bash
# Local worktree: audit complete train/held-out membership and summarize fixed policy.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/summarize_policy.py --corpus "$TICKET/sources/policy-corpus-v4" --training "$TICKET/sources/policy-measurements-v3/train.json" --selection "$TICKET/sources/policy-measurements-v3/selection.json" --heldout "$TICKET/sources/policy-measurements-v3/heldout.json" --output "$TICKET/sources/policy-measurements-v3/summary.json"
