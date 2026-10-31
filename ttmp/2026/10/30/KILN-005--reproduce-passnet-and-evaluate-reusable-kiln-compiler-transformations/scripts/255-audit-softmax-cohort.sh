#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 integrations/passnet/summarize_task_run.py --directory "$TICKET/sources/softmax-cohort-v1" --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/softmax-cohort-v1-audit.json"
