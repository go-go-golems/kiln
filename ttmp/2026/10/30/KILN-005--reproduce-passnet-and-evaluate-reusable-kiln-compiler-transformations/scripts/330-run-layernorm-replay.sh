#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:/usr/bin:/bin
node --version
ROOT=/home/manuel/passnet-kiln/KILN-005
cd "$ROOT/kiln"
python3 integrations/passnet/evaluate_tasks.py --root "$ROOT" --plan "$ROOT/gelu-layernorm-replay-plan.json" --output "$ROOT/gelu-layernorm-cohort-v1"
