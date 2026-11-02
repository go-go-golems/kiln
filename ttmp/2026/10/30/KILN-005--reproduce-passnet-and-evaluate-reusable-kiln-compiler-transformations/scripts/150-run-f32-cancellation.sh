#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:$PATH
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/kiln-export.mjs --script /home/manuel/passnet-kiln/KILN-005/148-f32-cancellation.kiln.js --target a100 --out /home/manuel/passnet-kiln/KILN-005/f32-cancellation.kiln.json
docker run --rm --gpus all -v /home/manuel/passnet-kiln/KILN-005:/work -w /work/kiln/integrations/passnet --entrypoint python localhost:5000/playback-redaction:base-26.05 /work/149-check-f32-cancellation-cuda.py
