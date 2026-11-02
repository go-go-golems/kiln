#!/usr/bin/env bash
# On bling through sg docker; only baseline and the committed training selection.
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/policy-measurements-v5-r2/heldout.json"
test -f "$ROOT/policy-measurements-v5-r2/selection.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/integrations/passnet:/work/kiln/runtime/python:/work/upstream python /work/179-run-rich-full-precision.py --corpus /work/policy-corpus-v5-r2 --artifacts /work/policy-artifacts-v5-r1 --upstream /work/upstream --output /work/policy-measurements-v5-r2/heldout.json --phase heldout --selection /work/policy-measurements-v5-r2/selection.json --include-path /usr/local/cuda/include'
