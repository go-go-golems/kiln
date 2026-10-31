#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/corpus.py compile --directory "$TICKET/sources/softmax-fixtures" --kiln . --target a100 --contraction separate
