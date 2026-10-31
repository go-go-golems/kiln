#!/usr/bin/env bash
# Run on bling.local, preserving original failed artifact.
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/kiln-export.mjs --script ../third-task/000.kiln.js --target a100 --out ../third-task/bias-fixed.json
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python python check_third_task_cuda.py /work bias-fixed.json'
