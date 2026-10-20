#!/usr/bin/env python3
# B1 (KILN-002): run with the factory-videos venv, PYTHONPATH=<fv>/src, DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib.
# How much videoconvert n-threads=4 changes the RGB frames of a golden clip (first 60 frames).
import sys
import numpy as np
from factory.backends.media import gst

Gst = gst.require_gst()[0]
F = "/Volumes/SSD/data/factory-shots/golden-clips/v1/marker-short-left.mp4"

def frames(n_threads, count):
    p = Gst.parse_launch(f"filesrc location={F} ! qtdemux ! queue ! h264parse ! vtdec name=dec ! videoconvert n-threads={n_threads} "
                         f"! video/x-raw,format=RGB ! {gst.FILE_SINK}")
    sink = p.get_by_name("sink"); p.set_state(Gst.State.PLAYING); out = []
    vt_caps = None
    while len(out) < count:
        s = sink.emit("try-pull-sample", 5 * Gst.SECOND)
        if s is None: break
        out.append(gst.sample_rgb(s)[0].copy())
    dec = p.get_by_name("dec")
    caps = dec.get_static_pad("src").get_current_caps().to_string()
    p.set_state(Gst.State.NULL)
    return out, caps

a, caps = frames(1, 60); b, _ = frames(4, 60)
print("vtdec src caps:", caps)
d = [np.abs(x.astype(np.int16) - y.astype(np.int16)) for x, y in zip(a, b)]
diff_px = [int((x.max(axis=2) > 0).sum()) for x in d]
print("frames", len(d), "max |d|", max(int(x.max()) for x in d), "px differing per frame median", int(np.median(diff_px)),
      "of", a[0].shape[0] * a[0].shape[1], "mean |d| over all", float(np.mean([x.mean() for x in d])))
rows = np.nonzero(d[0].max(axis=(1, 2)))[0]
print("rows with differences in frame 0:", len(rows), rows[:20], "...")
from factory.kernels.motion import to_gray
g = [np.abs(to_gray(x, 480, 270).astype(int) - to_gray(y, 480, 270).astype(int)) for x, y in zip(a, b)]
print("to_gray: max |d|", max(int(x.max()) for x in g), "share of grey px differing", float(np.mean([(x > 0).mean() for x in g])))
