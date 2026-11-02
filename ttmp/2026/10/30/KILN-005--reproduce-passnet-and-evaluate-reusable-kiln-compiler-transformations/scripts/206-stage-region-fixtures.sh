#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
rsync -a packages/kiln/src/std/loop.js packages/kiln/src/std/index.js packages/kiln/src/std/fusion.js "$DEST/kiln/packages/kiln/src/std/"
rsync -a --exclude=__pycache__/ --exclude='*.pyc' integrations/passnet/ "$DEST/kiln/integrations/passnet/"
rsync -a "$TICKET/sources/region-fusion-fixtures" "$DEST/"
rsync -a "$TICKET/scripts/207-run-region-fusion-cuda.sh" "$DEST/"
