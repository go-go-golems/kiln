#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/kiln/integrations/passnet/measure_compiler_confirmation.py --corpus /work/reshape-confirmation-v2 --artifacts /work/reshape-confirmation-artifacts-v2 --upstream /work/upstream --passbench /work/upstream --output /work/reshape-confirmation-measurements-v2.json --include-path /usr/local/cuda/include
