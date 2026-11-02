#!/usr/bin/env bash
set -eu
COHORT=${1:?pass frozen cohort run name}
PLAN=${2:?pass frozen plan basename}
[[ "$COHORT" =~ ^(softmax-cohort|reshape-source-cohort)-v[0-9]+$ ]]
[[ "$PLAN" =~ ^[a-z0-9-]+\.json$ ]]
export PATH=/usr/local/bin:$PATH
node --version
cd /home/manuel/passnet-kiln/KILN-005/kiln
python3 integrations/passnet/evaluate_tasks.py --root /home/manuel/passnet-kiln/KILN-005 --plan /home/manuel/passnet-kiln/KILN-005/"$PLAN" --output /home/manuel/passnet-kiln/KILN-005/"$COHORT"
