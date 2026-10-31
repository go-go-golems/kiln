#!/usr/bin/env bash
set -eu
source /home/manuel/.nvm/nvm.sh
nvm use v26
cd /home/manuel/passnet-kiln/KILN-005/kiln
python3 integrations/passnet/evaluate_tasks.py --root /home/manuel/passnet-kiln/KILN-005 --plan /home/manuel/passnet-kiln/KILN-005/matrix-cohort-plan.json --output /home/manuel/passnet-kiln/KILN-005/matrix-cohort-v1
