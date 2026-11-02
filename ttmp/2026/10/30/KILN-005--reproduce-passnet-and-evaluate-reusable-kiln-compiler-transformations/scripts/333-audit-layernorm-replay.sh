#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python integrations/passnet/summarize_task_run.py --directory "$TICKET/sources/gelu-layernorm-cohort-v1" --upstream "$TICKET/sources/upstream" --output "$TICKET/sources/gelu-layernorm-cohort-v1-audit.json"
python "$TICKET/scripts/325-verify-gelu-cohort.py" --cohort gelu-layernorm-cohort-v1 --plan gelu-layernorm-replay-plan.json --source-checkpoint gelu-layernorm-source-v1.json
