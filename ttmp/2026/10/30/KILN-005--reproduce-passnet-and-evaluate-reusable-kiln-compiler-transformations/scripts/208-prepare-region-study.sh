#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/prepare_controls.py --kiln . --corpus "$TICKET/sources/policy-corpus-v7" --artifacts "$TICKET/sources/policy-artifacts-v7-controls"
python3 integrations/passnet/freeze_study.py --corpus "$TICKET/sources/policy-corpus-v7" --controls "$TICKET/sources/policy-artifacts-v7-controls" --execution-wrapper "$TICKET/scripts/179-run-rich-full-precision.py" --strategy region
