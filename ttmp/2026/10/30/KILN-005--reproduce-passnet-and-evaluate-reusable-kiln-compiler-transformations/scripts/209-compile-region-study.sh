#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/compile_study.py --kiln . --corpus "$TICKET/sources/policy-corpus-v7" --artifacts "$TICKET/sources/policy-artifacts-v7"
