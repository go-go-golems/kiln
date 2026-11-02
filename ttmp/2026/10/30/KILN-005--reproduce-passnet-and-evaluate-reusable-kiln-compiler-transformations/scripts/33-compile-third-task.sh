#!/usr/bin/env bash
set -eu
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/kiln-export.mjs --script ../third-task/000.kiln.js --target a100 --out ../third-task/000.json
