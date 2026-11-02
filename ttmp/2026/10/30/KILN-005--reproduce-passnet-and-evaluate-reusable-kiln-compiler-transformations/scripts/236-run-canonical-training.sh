#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/policy-measurements-v8-r2/train.json"
mkdir -p "$ROOT/policy-measurements-v8-r2"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/integrations/passnet:/work/kiln/runtime/python:/work/upstream python /work/179-run-rich-full-precision.py --corpus /work/policy-corpus-v8-r2 --artifacts /work/policy-artifacts-v8-r2 --upstream /work/upstream --output /work/policy-measurements-v8-r2/train.json --phase train --include-path /usr/local/cuda/include'
