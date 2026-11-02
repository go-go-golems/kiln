#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/qualify_policies.py --corpus "$TICKET/sources/policy-corpus-v4" --artifacts "$TICKET/sources/policy-artifacts-v4" --output "$TICKET/sources/policy-artifacts-v4/sensitivity.json"
