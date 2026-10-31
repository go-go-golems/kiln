#!/usr/bin/env bash
set -eu
COHORT=${1:?pass frozen cohort run name}
DRIVER=${2:?pass driver log basename}
[[ "$COHORT" =~ ^(softmax-cohort|reshape-source-cohort)-v[0-9]+$ ]]
[[ "$DRIVER" =~ ^(softmax-cohort|reshape-source-cohort)(-v[0-9]+)?-driver.log$ ]]
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
ssh bling.local "python3 -c 'import json;from pathlib import Path;p=Path(\"/home/manuel/passnet-kiln/KILN-005/$COHORT/run.json\");assert json.loads(p.read_text())[\"status\"]==\"complete\",\"Cohort still active; preserve same job\"'"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' bling.local:/home/manuel/passnet-kiln/KILN-005/$COHORT "$TICKET/sources/"
scp bling.local:/home/manuel/passnet-kiln/KILN-005/$DRIVER "$TICKET/sources/"
