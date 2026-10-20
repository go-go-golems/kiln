#!/bin/bash
# B1 supplement: the file pipeline's stages one at a time on a golden clip (gst-launch-1.0, no Python).
F=/Volumes/SSD/data/factory-shots/golden-clips/v1/marker-short-left.mp4
HEAD="filesrc location=$F ! qtdemux ! queue ! h264parse ! vtdec"
declare -a NAMES=("decode" "decode+videoconvert RGB" "decode+videoconvert RGB n-threads=4" "decode+videoconvert GRAY8")
declare -a TAILS=("fakesink sync=false" "videoconvert ! video/x-raw,format=RGB ! fakesink sync=false" \
                  "videoconvert n-threads=4 ! video/x-raw,format=RGB ! fakesink sync=false" \
                  "videoconvert ! video/x-raw,format=GRAY8 ! fakesink sync=false")
for rep in 1 2 3; do
  for i in "${!NAMES[@]}"; do
    s=$(python3 -c "import time,subprocess,sys; t=time.perf_counter(); subprocess.run(sys.argv[1:],check=True,stdout=subprocess.DEVNULL); print(round(time.perf_counter()-t,3))" \
        gst-launch-1.0 -q $HEAD ! ${TAILS[$i]})
    echo "{\"rep\": $rep, \"stage\": \"${NAMES[$i]}\", \"s\": $s, \"msPerFrame\": $(python3 -c "print(round($s*1000/2250,3))")}"
  done
done
