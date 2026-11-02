#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005/sources/adaptive-pooling-qualification-v1
cd "$ROOT/kiln"
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
python3 integrations/passnet/evaluate_tasks.py --root "$ROOT" --plan "$ROOT/plan.json" --output "$ROOT/results" --image sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba
