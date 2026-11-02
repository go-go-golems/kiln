#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:$PATH
cd /home/manuel/passnet-kiln/KILN-005/kiln
node scripts/run-node-tests.mjs packages/kiln/test
node /home/manuel/passnet-kiln/KILN-005/146-reproduce-loop-precision-gap.mjs /home/manuel/passnet-kiln/KILN-005/kiln
for pair in 051:003 060:019; do
 task=${pair%:*}
 variant=${pair#*:}
 node /home/manuel/passnet-kiln/KILN-005/142-diagnose-compiler-reference.mjs /home/manuel/passnet-kiln/KILN-005/kiln /home/manuel/passnet-kiln/KILN-005/reference-domain-cohort-v1/task-$task/corpus/$variant.kiln.js
 done
node /home/manuel/passnet-kiln/KILN-005/142-diagnose-compiler-reference.mjs /home/manuel/passnet-kiln/KILN-005/kiln /home/manuel/passnet-kiln/KILN-005/selective-reference-cohort-v1/task-182/corpus/007.kiln.js
