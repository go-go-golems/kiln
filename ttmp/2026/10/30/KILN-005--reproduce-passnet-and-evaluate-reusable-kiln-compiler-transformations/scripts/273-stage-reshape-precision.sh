#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
DEST=bling.local:/home/manuel/passnet-kiln/KILN-005
rsync -a "$TICKET/sources/singleton-reshape-precision-diagnostic" "$DEST/"
rsync -a "$TICKET/scripts/271-diagnose-reshape-precision-cuda.py" "$TICKET/scripts/272-run-reshape-precision-cuda.sh" "$DEST/"
