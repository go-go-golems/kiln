#!/usr/bin/env bash
# Same declaration after a missing source binding; separate immutable attempt.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_study.py --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/policy-corpus-v8-r1" --config "$TICKET/sources/canonical-study-selection-v8.json"
