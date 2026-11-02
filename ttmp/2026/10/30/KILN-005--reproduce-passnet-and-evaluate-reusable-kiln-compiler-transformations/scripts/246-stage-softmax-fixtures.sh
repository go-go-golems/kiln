#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a apps/workbench/src/compile.js "$DEST/kiln/apps/workbench/src/"
rsync -a "$TICKET/sources/softmax-fixtures" "$TICKET/sources/softmax-probe-models" "$DEST/"
rsync -a "$TICKET/scripts/245-check-softmax-cuda.py" "$TICKET/scripts/247-run-softmax-cuda.sh" "$DEST/"
