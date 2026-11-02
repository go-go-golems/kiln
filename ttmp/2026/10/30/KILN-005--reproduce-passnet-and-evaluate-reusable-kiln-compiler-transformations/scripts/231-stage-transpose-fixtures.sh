#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a apps/workbench/src/compile.js "$DEST/kiln/apps/workbench/src/"
rsync -a "$TICKET/sources/transpose-fixtures" "$TICKET/sources/transpose-probe-models" "$DEST/"
rsync -a "$TICKET/scripts/226-check-transpose-cuda.py" "$TICKET/scripts/232-run-transpose-cuda.sh" "$DEST/"
