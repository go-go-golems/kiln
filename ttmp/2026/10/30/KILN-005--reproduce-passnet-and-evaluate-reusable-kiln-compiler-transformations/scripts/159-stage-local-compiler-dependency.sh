#!/usr/bin/env bash
# One-time local analysis setup. No tracked dependency declarations are changed.
set -eu
mkdir -p node_modules/@kiln node_modules/acorn
rsync -aL bling.local:/home/manuel/passnet-kiln/KILN-005/kiln/node_modules/.pnpm/acorn@8.19.0/node_modules/acorn/ node_modules/acorn/
ln -s ../../packages/kiln node_modules/@kiln/kiln
ln -s ../../packages/evidence node_modules/@kiln/evidence
