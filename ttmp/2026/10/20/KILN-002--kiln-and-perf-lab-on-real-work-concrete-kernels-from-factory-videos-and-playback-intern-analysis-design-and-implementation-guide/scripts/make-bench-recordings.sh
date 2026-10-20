#!/usr/bin/env bash
# Build a recorder-shaped tree of real factory footage for services/redaction/scripts/validate_on_host.sh (KILN-002 C4).
#
# The GB10 hosts used for C4 hold no NVR recordings, and validate_on_host.sh stages its inputs from one
# (stage_bench_inputs.py walks <recordings>/<camera>/high/YYYY/MM/DD/HH/seg_<epoch>.ts and keeps the segments in which
# the service itself finds people). This cuts the section-table videos into that layout:
#
#   4 cameras (left and right table, two dates) x 3 hours x 12 segments of 6 s, re-encoded to H.264 1080p24 with one
#   keyframe per segment (GOP 144), MPEG-TS, no audio — the shape of the recorder's 1080p24 segments that the
#   redaction performance doc's baseline is stated for.
#
# The footage shows people at work: it stays on the hosts used for the measurement and never appears in a report.
#
#   make-bench-recordings.sh SOURCES_DIR OUT_DIR
set -euo pipefail
src=${1:?sources dir}; out=${2:?output dir}
cams=(
  "section-table-left_2026-09-21.mp4 4b1e0c52-0000-4000-8000-00000000000a"
  "section-table-right_2026-09-21.mp4 4b1e0c52-0000-4000-8000-00000000000b"
  "section-table-left_2026-09-23_1st.mp4 4b1e0c52-0000-4000-8000-00000000000c"
  "section-table-right_2026-09-23_1st.mp4 4b1e0c52-0000-4000-8000-00000000000d"
)
base=$(date -u -j -f "%Y-%m-%d %H:%M:%S" "2026-10-19 08:00:00" +%s 2>/dev/null || date -u -d "2026-10-19 08:00:00" +%s)
for spec in "${cams[@]}"; do
  read -r file cam <<<"$spec"
  for h in 0 1 2; do
    hour=$((base + h * 3600))
    dir="$out/$cam/high/$(date -u -r "$hour" +%Y/%m/%d/%H 2>/dev/null || date -u -d "@$hour" +%Y/%m/%d/%H)"
    mkdir -p "$dir"
    tmp=$(mktemp -d)
    # 72 s from a different part of the recording for each hour
    ffmpeg -nostdin -loglevel error -ss $((300 + h * 600)) -t 72 -i "$src/$file" -an -vf fps=24 \
      -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -g 144 -keyint_min 144 -sc_threshold 0 \
      -f segment -segment_time 6 -reset_timestamps 1 "$tmp/part_%03d.ts"
    i=0
    for part in "$tmp"/part_*.ts; do
      mv "$part" "$dir/seg_$((hour + i * 6)).ts"
      i=$((i + 1))
    done
    rmdir "$tmp"
    echo "$cam hour $h: $i segments in $dir"
  done
done
