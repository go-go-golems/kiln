#!/usr/bin/env bash
# Run services/redaction's pytest suite at one revision of a Playback clone, inside the redaction image, on the GPU
# host (KILN-002; run-on-gpu-host.sh calls it there).
#
# The revision's tree is streamed into the container with git archive and unpacked under /tmp, so the clone's working
# tree is neither read nor written: tests that create directories in their working directory pass, and the run tests
# exactly the commit named. Two test files read files at the repository root, so the whole tree is sent. The cached
# TensorRT engine (the volume the service builds it into) is linked where test_trt_engine_raw.py looks for it; without
# the volume that test skips.
#
#   pb-pytest.sh CLONE REV IMAGE [pytest args…]          one run (default args: -q -rfEs tests/)
#   REPS=N pb-pytest.sh CLONE REV IMAGE TEST_ID…         each test N times, one "<id><TAB>pass|fail" line per run
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,13p' "$0" >&2; exit 2; }
clone=$1 rev=$2 image=$3; shift 3
[ $# -gt 0 ] || set -- -q -rfEs tests/
volume=${ENGINE_VOLUME:-playback_ds-engine-cache}

git -C "$clone" archive "$rev" | docker run --rm -i --gpus all -v "$volume:/engine-cache:ro" -e REPS="${REPS:-0}" \
  -e NVIDIA_TF32_OVERRIDE=0 -e PYTHONDONTWRITEBYTECODE=1 --entrypoint sh "$image" -c '
set -e
mkdir -p /opt/models /tmp/r
[ -f /engine-cache/rtmdet-ins_m.engine ] && ln -sf /engine-cache/rtmdet-ins_m.engine /opt/models/rtmdet-ins_m.engine
tar -C /tmp/r -xf -
cd /tmp/r/services/redaction
pip install -q --root-user-action=ignore pytest pytest-asyncio >/dev/null 2>&1
export PYTHONPATH=/tmp/r/services/redaction
if [ "$REPS" -gt 0 ]; then
  for id in "$@"; do
    i=0
    while [ "$i" -lt "$REPS" ]; do
      if python3 -m pytest -p no:cacheprovider -q "$id" >/dev/null 2>&1; then r=pass; else r=fail; fi
      printf "%s\t%s\n" "$id" "$r"
      i=$((i + 1))
    done
  done
else
  exec python3 -m pytest -p no:cacheprovider "$@"
fi' sh "$@"
