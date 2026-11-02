#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
source /home/manuel/.nvm/nvm.sh
nvm use v26
python3 integrations/passnet/compiler_confirmation.py freeze --corpus "$TICKET/sources/reshape-confirmation-v2" --declaration "$TICKET/sources/reshape-confirmation-declaration-v2.json" --repo .
python3 integrations/passnet/compiler_confirmation.py compile --corpus "$TICKET/sources/reshape-confirmation-v2" --output "$TICKET/sources/reshape-confirmation-artifacts-v2" --baseline /tmp/kiln-passnet-reshape-baseline-c15c610 --candidate .
