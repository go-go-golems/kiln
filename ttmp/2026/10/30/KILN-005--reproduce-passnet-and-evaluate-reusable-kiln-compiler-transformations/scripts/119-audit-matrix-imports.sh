#!/usr/bin/env bash
# Local worktree: full denominator, explicit first blocker for every graph.
set -eu
cd /home/manuel/code/wesen/kiln/worktrees/passnet
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/corpus.py inspect --upstream "$TICKET/sources/upstream" --sample-list "$TICKET/sources/upstream/sample_lists/eval/hf_fusible_eval_samples_v2.txt" --output "$TICKET/sources/import-audit-after-linalg.json"
