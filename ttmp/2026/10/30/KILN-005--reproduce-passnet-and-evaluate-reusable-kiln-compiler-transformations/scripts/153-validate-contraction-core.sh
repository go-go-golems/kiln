#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:$PATH
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/run-node-tests.mjs packages/kiln/test
node scripts/kiln-export.mjs --script /home/manuel/passnet-kiln/KILN-005/selective-reference-cohort-v1/task-182/corpus/007.kiln.js --target a100 --contraction separate --out /home/manuel/passnet-kiln/KILN-005/contraction-separate-probe.kiln.json
