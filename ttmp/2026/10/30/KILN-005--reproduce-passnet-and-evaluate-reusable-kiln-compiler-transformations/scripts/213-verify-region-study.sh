#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/verify_study.py --corpus "$TICKET/sources/policy-corpus-v7" --artifacts "$TICKET/sources/policy-artifacts-v7" --measurements "$TICKET/sources/policy-measurements-v7" --source-verification "$TICKET/sources/region-remote-source-verification.json" --selection-commit "$1" --output "$TICKET/sources/policy-measurements-v7/summary.json"
