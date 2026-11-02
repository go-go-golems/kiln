#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 "$TICKET/scripts/69-freeze-policy-corpus.py" --version v2 --extra-heldout-tasks 81 153
python3 "$TICKET/scripts/70-prepare-policy-controls.py" --directory "$TICKET/sources/policy-corpus-v2"
