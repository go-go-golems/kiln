#!/usr/bin/env bash
# KILN-002 C4 diagnosis: both validate_on_host arms again, one short paired run, then each arm's per-segment stage
# timers (metric:segment_timing) from its log. Same image, mounts and env as validate_on_host.sh's start_arm.
set -euo pipefail
IMG=playback-redaction:kiln-002-ac835daa
SVC=~/code/playback-kiln-002/services/redaction
OUT=~/kiln-002/c4-diag; rm -rf "$OUT"; mkdir -p "$OUT/bench"
cp -r ~/kiln-002/c4-validate/bench/people "$OUT/bench/people"
start() { # name port src [env...]
  docker rm -f "$1" >/dev/null 2>&1 || true
  docker run -d --name "$1" --gpus all -v "$3:/app/src:ro" -v "$SVC/scripts:/app/scripts:ro" -v "$SVC/tests:/app/tests:ro" \
    -v ~/kiln-002/bench-recordings:/data/recordings -v "$OUT/bench:/data/recordings/_bench" \
    -v playback_ds-engine-cache:/engine-cache -p "127.0.0.1:$2:8200" \
    -e NVIDIA_TF32_OVERRIDE=0 -e MALLOC_ARENA_MAX=2 -e REDACTION_PORT=8200 -e REDACTION_ROOT=/data/recordings \
    -e REDACTION_LOG_LEVEL=INFO -e REDACTION_SMOOTHING_WINDOW_MS=100 -e REDACTION_SEMAPHORE_CAPACITY=4 "${@:4}" "$IMG" >/dev/null
}
start diag-a 8221 ~/kiln-002/c4-validate/baseline-src
start diag-b 8222 "$SVC/src" -e REDACTION_MASK_POST=kiln
for p in 8221 8222; do for _ in $(seq 1 240); do curl -sf --max-time 3 "http://127.0.0.1:$p/health" >/dev/null && break; sleep 2; done; done
curl -s http://127.0.0.1:8221/health | python3 -c 'import json,sys; d=json.load(sys.stdin); print("a", d.get("backend"), d.get("mask_post"))'
curl -s http://127.0.0.1:8222/health | python3 -c 'import json,sys; d=json.load(sys.stdin); print("b", d.get("backend"), d.get("mask_post"))'
python3 "$SVC/scripts/bench_ab.py" --a http://127.0.0.1:8221 --b http://127.0.0.1:8222 --root "$OUT/bench" \
  --ctr-root /data/recordings/_bench --group people --conc "${CONC:-1,4}" --burst 12 --pairs "${PAIRS:-2}" --out "$OUT/throughput.json" \
  > "$OUT/throughput.txt" 2>&1
docker logs diag-a > "$OUT/arm-a.log" 2>&1; docker logs diag-b > "$OUT/arm-b.log" 2>&1
docker rm -f diag-a diag-b >/dev/null
tail -12 "$OUT/throughput.txt"
echo "a: $(grep -c metric:segment_timing "$OUT/arm-a.log") timing lines, b: $(grep -c metric:segment_timing "$OUT/arm-b.log")"
