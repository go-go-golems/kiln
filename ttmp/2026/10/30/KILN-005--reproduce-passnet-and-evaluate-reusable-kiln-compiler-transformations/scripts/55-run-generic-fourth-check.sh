#!/usr/bin/env bash
# Remote host: shared runner, all outputs; no performance claims.
set -eu
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/upstream python check_corpus_cuda.py --directory /work/fourth-task --upstream /work/upstream --include-path /usr/local/cuda/include'
