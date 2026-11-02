#!/usr/bin/env bash
set -eu
export PATH=/usr/local/bin:$PATH
node --version
cd /home/manuel/passnet-kiln/KILN-005/kiln
python3 integrations/passnet/evaluate_tasks.py --root /home/manuel/passnet-kiln/KILN-005 --plan /home/manuel/passnet-kiln/KILN-005/reference-domain-cohort-plan.json --output /home/manuel/passnet-kiln/KILN-005/reference-domain-cohort-v1
