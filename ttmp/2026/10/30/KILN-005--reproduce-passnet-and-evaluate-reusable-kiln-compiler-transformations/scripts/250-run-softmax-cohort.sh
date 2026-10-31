#!/usr/bin/env bash
set -eu
COHORT=${1:?pass frozen cohort run name}
[[ "$COHORT" =~ ^softmax-cohort-v[0-9]+$ ]]
export PATH=/usr/local/bin:$PATH
node --version
cd /home/manuel/passnet-kiln/KILN-005/kiln
python3 integrations/passnet/evaluate_tasks.py --root /home/manuel/passnet-kiln/KILN-005 --plan /home/manuel/passnet-kiln/KILN-005/softmax-cohort-plan.json --output /home/manuel/passnet-kiln/KILN-005/"$COHORT"
