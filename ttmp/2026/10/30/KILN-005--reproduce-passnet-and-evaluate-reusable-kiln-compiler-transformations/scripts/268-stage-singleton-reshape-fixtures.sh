#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a packages/kiln/src/std/tensor.js "$DEST/kiln/packages/kiln/src/std/"
rsync -a apps/workbench/src/compile.js "$DEST/kiln/apps/workbench/src/"
rsync -a "$TICKET/sources/singleton-reshape-fixtures" "$TICKET/sources/singleton-reshape-probe-models" "$DEST/"
rsync -a "$TICKET/scripts/267-check-singleton-reshape-cuda.py" "$TICKET/scripts/269-run-singleton-reshape-cuda.sh" "$DEST/"
