#!/usr/bin/env bash
# On bling, through sg docker: preserve the first complete training run.
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/policy-measurements-v5-r1/train.json"
mkdir -p "$ROOT/policy-measurements-v5-r1"
nvidia-smi
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/upstream python measure_policy.py --corpus /work/policy-corpus-v5-r1 --artifacts /work/policy-artifacts-v5-r1 --upstream /work/upstream --output /work/policy-measurements-v5-r1/train.json --phase train --include-path /usr/local/cuda/include'
