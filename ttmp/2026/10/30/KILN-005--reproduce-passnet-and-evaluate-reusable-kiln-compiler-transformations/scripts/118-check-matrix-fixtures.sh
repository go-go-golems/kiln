#!/usr/bin/env bash
set -eu
bash /home/manuel/passnet-kiln/KILN-005/117-compile-matrix-fixtures.sh
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python python check_linalg_cuda.py --directory /work/linalg-fixtures --upstream /work --output /work/linalg-cuda.json --include-path /usr/local/cuda/include'
