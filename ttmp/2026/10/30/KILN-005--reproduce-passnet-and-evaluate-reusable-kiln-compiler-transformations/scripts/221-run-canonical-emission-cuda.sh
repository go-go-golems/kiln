#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/canonical-emission-cuda.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/upstream python check_fusion_cuda.py --directory /work/canonical-fusion-fixtures --output /work/canonical-emission-cuda.json --include-path /usr/local/cuda/include'
