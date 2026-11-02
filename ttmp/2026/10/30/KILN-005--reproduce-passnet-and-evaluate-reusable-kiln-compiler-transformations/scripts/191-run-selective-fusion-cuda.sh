#!/usr/bin/env bash
# On bling through sg docker; preserve the first correctness receipt.
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/selective-fusion-cuda.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/189-check-selective-fusion-cuda.py
