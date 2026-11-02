#!/usr/bin/env bash
set -eu
python3 integrations/passnet/corpus.py inspect --upstream ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream --sample-list ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream/sample_lists/eval/hf_fusible_eval_samples_v2.txt --output ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/import-audit-after-layernorm.json
