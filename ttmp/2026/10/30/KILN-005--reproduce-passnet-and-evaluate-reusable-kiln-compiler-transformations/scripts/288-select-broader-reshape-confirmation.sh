#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_study.py --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/reshape-confirmation-v2" --config "$TICKET/sources/reshape-confirmation-selection-v2.json"
