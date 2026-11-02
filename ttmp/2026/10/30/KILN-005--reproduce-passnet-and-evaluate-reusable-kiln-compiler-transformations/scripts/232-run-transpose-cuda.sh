#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
test ! -e "$ROOT/transpose-cuda.json"
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/226-check-transpose-cuda.py
