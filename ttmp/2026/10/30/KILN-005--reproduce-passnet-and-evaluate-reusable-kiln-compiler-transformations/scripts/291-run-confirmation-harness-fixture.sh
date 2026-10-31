#!/usr/bin/env bash
set -eu
ROOT=/home/manuel/passnet-kiln/KILN-005
docker run --rm --gpus all -v "$ROOT:/work" -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/kiln/integrations/passnet/measure_compiler_confirmation.py --corpus /work/confirmation-harness/corpus --artifacts /work/confirmation-harness/artifacts --upstream /work/confirmation-harness/upstream --passbench /work/upstream --output /work/confirmation-harness/measurements.json --include-path /usr/local/cuda/include
