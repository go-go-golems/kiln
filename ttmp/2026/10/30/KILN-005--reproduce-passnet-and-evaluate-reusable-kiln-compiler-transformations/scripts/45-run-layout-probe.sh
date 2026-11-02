#!/usr/bin/env bash
# Run on bling.local after staging sources; correctness only, no latency claim.
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/kiln-export.mjs --script ../layouts/probe.kiln.js --target a100 --out ../layouts/probe.json
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c 'PYTHONPATH=/work/kiln/runtime/python:/work/upstream python check_layouts_cuda.py /work'
