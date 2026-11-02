#!/usr/bin/env bash
set -eu
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/168-check-layernorm-cuda.py
