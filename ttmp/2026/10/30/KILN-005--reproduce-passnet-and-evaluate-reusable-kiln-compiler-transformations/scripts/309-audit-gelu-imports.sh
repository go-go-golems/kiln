#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python integrations/passnet/corpus.py inspect --upstream "$TICKET/sources/upstream" --sample-list "$TICKET/sources/upstream/sample_lists/eval/hf_fusible_eval_samples_v2.txt" --output "$TICKET/sources/import-audit-after-gelu.json" > "$TICKET/sources/import-audit-after-gelu.log" 2>&1
