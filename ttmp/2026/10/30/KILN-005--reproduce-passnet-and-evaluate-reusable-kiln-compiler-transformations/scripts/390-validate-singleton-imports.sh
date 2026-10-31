#!/usr/bin/env bash
set -eu
TICKET=ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations
python3 -m unittest discover -s integrations/passnet -p 'test_fx_*.py' > "$TICKET/sources/singleton-fx-validation-v2.log" 2>&1
