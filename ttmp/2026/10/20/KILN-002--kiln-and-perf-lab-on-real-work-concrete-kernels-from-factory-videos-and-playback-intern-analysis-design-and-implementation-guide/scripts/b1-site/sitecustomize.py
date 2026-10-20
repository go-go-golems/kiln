# B1 (KILN-002): patches applied to the factory worker for motion-split.py's variants; no factory source is edited.
# On PYTHONPATH ahead of site-packages only for those variants.
#   B1_VIDEOCONVERT_THREADS=N  the RGB conversion runs videoconvert on N threads ("vcN")
#   B1_FREE_GRAY=1             to_gray returns a preallocated zero image: an oracle for "grey costs nothing" ("…+free")
import os

if os.environ.get("B1_VIDEOCONVERT_THREADS"):
    from factory.backends.media import gst

    gst._RGB = f"videoconvert n-threads={int(os.environ['B1_VIDEOCONVERT_THREADS'])} ! video/x-raw,format=RGB"

if os.environ.get("B1_FREE_GRAY"):
    import numpy as np

    from factory.kernels import motion

    _zeros = {}

    def _free_gray(rgb, width, height):
        if (height, width) not in _zeros:
            _zeros[(height, width)] = np.zeros((height, width), np.uint8)
        return _zeros[(height, width)]

    motion.to_gray = _free_gray
