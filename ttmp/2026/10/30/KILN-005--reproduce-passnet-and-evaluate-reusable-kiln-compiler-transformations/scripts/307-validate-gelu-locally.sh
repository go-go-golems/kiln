#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
node packages/kiln/test/gelu.mjs > "$TICKET/sources/gelu-core-validation-v2.log" 2>&1
python -m unittest discover -s integrations/passnet -p 'test_fx_*.py' > "$TICKET/sources/gelu-fx-validation-v2.log" 2>&1
