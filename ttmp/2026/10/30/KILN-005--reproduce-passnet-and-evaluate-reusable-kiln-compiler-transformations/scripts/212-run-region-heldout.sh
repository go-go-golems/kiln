#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/policy-measurements-v7/heldout.json"
test -f "$ROOT/policy-measurements-v7/selection.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/integrations/passnet:/work/kiln/runtime/python:/work/upstream python /work/179-run-rich-full-precision.py --corpus /work/policy-corpus-v7 --artifacts /work/policy-artifacts-v7 --upstream /work/upstream --output /work/policy-measurements-v7/heldout.json --phase heldout --selection /work/policy-measurements-v7/selection.json --include-path /usr/local/cuda/include'
