#!/usr/bin/env bash
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
for dtype in f32 f16 bf16; do
 node scripts/kiln-export.mjs --script /home/manuel/passnet-kiln/KILN-005/activation-fixtures/$dtype.kiln.js --target a100 --out /home/manuel/passnet-kiln/KILN-005/activation-fixtures/$dtype.json
done
