#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
ssh bling.local "python3 -c 'import json;from pathlib import Path;p=Path(\"/home/manuel/passnet-kiln/KILN-005/softmax-cohort-v1/run.json\");assert json.loads(p.read_text())[\"status\"]==\"complete\",\"Cohort still active; preserve same job\"'"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' bling.local:/home/manuel/passnet-kiln/KILN-005/softmax-cohort-v1 "$TICKET/sources/"
scp bling.local:/home/manuel/passnet-kiln/KILN-005/softmax-cohort-driver.log "$TICKET/sources/"
