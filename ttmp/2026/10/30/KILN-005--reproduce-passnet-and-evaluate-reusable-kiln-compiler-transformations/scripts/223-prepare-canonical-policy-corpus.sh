#!/usr/bin/env bash
# New declared source population; excludes all previously observed policy models.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_study.py --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/policy-corpus-v8" --config "$TICKET/sources/canonical-study-selection-v8.json"
