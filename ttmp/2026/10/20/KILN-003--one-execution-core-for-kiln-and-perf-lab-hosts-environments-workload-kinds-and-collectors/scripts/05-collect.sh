#!/usr/bin/env bash
# Collect the KILN-003 demonstration data set through a running Kiln server, in order: the local sampler on the Mac and
# on bling, the sampler on both hosts at once, a pending plan at a larger size (dry run only), ten kernel presets on
# bling, and the imported PR 1005 evidence (screenshots only; its hosts are not on this server).
#
#   05-collect.sh [--url http://127.0.0.1:5380/] [--logs DIR]
#
# Screenshots go to ../various/shots; one log per program goes to DIR (default: the server's data directory).
set -euo pipefail
url=http://127.0.0.1:5380/
logs=/Volumes/SSD/kiln-data/kiln-003
while [ $# -gt 0 ]; do
  case "$1" in
    --url) url=$2; shift 2 ;;
    --logs) logs=$2; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
here=$(cd "$(dirname "$0")" && pwd)
shots=$(cd "$here/../various/shots" && pwd)
run() { local name=$1; shift; echo "== $name"; node "$here/03-run-lab-program.mjs" --url "$url" --shots "$shots" "$@" > "$logs/run-$name.log" 2>&1 || { echo "!! $name failed (exit $?), see $logs/run-$name.log"; return 1; }; grep -E "verdicts:|panel errors|after:" "$logs/run-$name.log" || true; }

run local-sampler-mac --program local-sampler
run local-sampler-bling --program local-sampler --params '{"host":"bling"}'
run sampler-hosts --program sampler-hosts
run local-sampler-pending --program local-sampler --params '{"queries":4096}' --dry-only
echo "== kernels on bling"
node "$here/04-measure-presets.mjs" --url "$url" --host bling --presets W-05,W-06,W-08,W-10,W-12,W-18,W-19,W-21,W-25,W-26 --shots "$shots" > "$logs/measure-bling.log" 2>&1 || echo "!! kernels failed, see $logs/measure-bling.log"
grep -E "done,|failed|refused|skipped|still" "$logs/measure-bling.log" || true
run dino-pr1005 --program dino-pr1005 --view-only --views jobs,devices
echo "== all done"
