#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:$PATH
cd /home/manuel/passnet-kiln/KILN-005/kiln
bash /home/manuel/passnet-kiln/KILN-005/153-validate-contraction-core.sh
for mode in allow separate; do
 node scripts/kiln-export.mjs --script /home/manuel/passnet-kiln/KILN-005/154-fma-boundary.kiln.js --target a100 --contraction "$mode" --out "/home/manuel/passnet-kiln/KILN-005/fma-boundary-$mode.json"
done
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/155-check-contraction-cuda.py
