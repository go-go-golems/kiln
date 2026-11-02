#!/usr/bin/env bash
# On bling: numerical validation only; no performance claim.
set -eu
bash /home/manuel/passnet-kiln/KILN-005/111-compile-owned-activation-fixtures.sh
nvidia-smi
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python python check_activations_cuda.py --directory /work/activation-owned-fixtures --output /work/activation-owned-cuda.json --owned --include-path /usr/local/cuda/include'
