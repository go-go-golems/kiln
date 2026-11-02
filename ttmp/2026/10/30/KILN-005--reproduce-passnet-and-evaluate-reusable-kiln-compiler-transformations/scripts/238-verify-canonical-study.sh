#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/verify_study.py --corpus "$TICKET/sources/policy-corpus-v8-r2" --artifacts "$TICKET/sources/policy-artifacts-v8-r2" --measurements "$TICKET/sources/policy-measurements-v8-r2" --source-verification "$TICKET/sources/canonical-remote-source-verification.json" --selection-commit "$1" --output "$TICKET/sources/policy-measurements-v8-r2/summary.json"
