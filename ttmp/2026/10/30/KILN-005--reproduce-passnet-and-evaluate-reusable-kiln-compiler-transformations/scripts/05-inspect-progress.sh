#!/usr/bin/env bash
# Read-only observation of the exact known local/remote workload handles.
set -eu
TICKET=$(cd -- "$(dirname -- "$0")/.." && pwd)
tail -n 4 "$TICKET/sources/materialization.log"
if test -f "$TICKET/sources/materialized/materialization-receipt.json"; then
  cat "$TICKET/sources/materialized/materialization-receipt.json"
fi
ssh -o BatchMode=yes bling.local 'tail -n 4 /home/manuel/passnet-kiln/KILN-005/reference-full.log; pgrep -af "python /work/02-run-reference.py" || true'
