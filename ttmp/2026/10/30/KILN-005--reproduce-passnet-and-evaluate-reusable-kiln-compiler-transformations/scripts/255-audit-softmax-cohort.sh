#!/usr/bin/env bash
set -eu
COHORT=${1:?pass frozen cohort run name}
[[ "$COHORT" =~ ^(softmax-cohort|reshape-source-cohort)-v[0-9]+$ ]]
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/summarize_task_run.py --directory "$TICKET/sources/$COHORT" --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/$COHORT-audit.json"
