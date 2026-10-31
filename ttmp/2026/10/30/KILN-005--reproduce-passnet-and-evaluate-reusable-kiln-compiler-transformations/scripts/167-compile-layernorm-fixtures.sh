#!/usr/bin/env bash
# Local Node 26 compilation; no CUDA checks disabled.
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
python3 integrations/passnet/corpus.py compile --directory ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/layernorm-fixtures --kiln /home/manuel/code/wesen/kiln/worktrees/passnet --target a100 --contraction separate
