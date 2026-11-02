#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
cd "$ROOT/kiln"
test ! -e "$ROOT/gelu-cuda-validation-v1.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 check_gelu_cuda.py --directory /work/gelu-fixtures-v1 --output /work/gelu-cuda-validation-v1.json --include-path /usr/local/cuda/include
python3 integrations/passnet/evaluate_tasks.py --root "$ROOT" --plan "$ROOT/gelu-source-cohort-plan.json" --output "$ROOT/gelu-source-cohort-v1"
