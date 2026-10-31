#!/usr/bin/env bash
set -eu
ROOT=${1:?Provide the staged study directory}
IMAGE=sha256:222d8b18e671be5c3ef91cb41727a2572a0b23f59ded6c39f373a96946f6f2ba
cd "$ROOT/kiln"
test -z "$(nvidia-smi --query-compute-apps=pid --format=csv,noheader)"
python3 integrations/passnet/evaluate_tasks.py \
  --root "$ROOT" \
  --plan "$ROOT/plan.json" \
  --output "$ROOT/results" \
  --image "$IMAGE"
