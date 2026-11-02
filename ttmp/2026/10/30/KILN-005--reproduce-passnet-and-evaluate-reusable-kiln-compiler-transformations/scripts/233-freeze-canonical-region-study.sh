#!/usr/bin/env bash
# New broader declared population, /3 source and exact aliases; no timing feedback.
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_controls.py --kiln . --corpus "$TICKET/sources/policy-corpus-v8-r2" --artifacts "$TICKET/sources/policy-artifacts-v8-r2-controls"
python3 integrations/passnet/freeze_study.py --corpus "$TICKET/sources/policy-corpus-v8-r2" --controls "$TICKET/sources/policy-artifacts-v8-r2-controls" --execution-wrapper "$TICKET/scripts/179-run-rich-full-precision.py" --strategy region
