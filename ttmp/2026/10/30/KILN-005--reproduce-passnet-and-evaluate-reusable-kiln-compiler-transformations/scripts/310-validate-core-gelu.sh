#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
node scripts/run-node-tests.mjs packages/kiln/test > "$TICKET/sources/gelu-full-core-validation-v1.log" 2>&1
