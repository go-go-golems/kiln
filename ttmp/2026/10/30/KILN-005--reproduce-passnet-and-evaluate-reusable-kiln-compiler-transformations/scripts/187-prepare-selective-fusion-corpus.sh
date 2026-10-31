#!/usr/bin/env bash
# Fresh exact models; declarations are stored before scanning or timing.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_study.py --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/policy-corpus-v6" --config "$TICKET/sources/selective-study-selection-v6.json"
