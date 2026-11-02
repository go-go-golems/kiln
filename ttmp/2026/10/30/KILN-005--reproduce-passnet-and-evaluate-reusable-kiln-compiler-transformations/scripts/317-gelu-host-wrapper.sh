#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
bash /home/manuel/passnet-kiln/KILN-005/315-run-gelu-validation.sh
