# 03 — Playback research: redaction and stream-engine candidate kernels

Read-only research against the Playback worktree
`/Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer`
(called **PB** below; every `path:line` is relative to PB). Branch `docs/ml-perf-001-perf-explorer`,
head `cdb84891c`. Researched 2026-10-20. Nothing was built, run, tested or modified in PB; no
docker/ssh/network. Labels: **MEASURED** (doc line, host, conditions), **DERIVED** (arithmetic shown),
**UNKNOWN**.

## Diary

Order of work, with what each step produced.

1. `ls` + `wc -l` of `services/redaction/src`, `services/stream-engine`, and the two perf docs, to size
   the reading (trt_engine.py 798 lines, seg_engine.py 563, video_pipeline.py 1691,
   redaction-performance.md 1325, stream-engine.md 570).
2. Read `services/redaction/src/trt_engine.py` in full and `services/redaction/src/seg_engine.py` in full.
   This answered Q1's engine-side half: output shapes, the on-GPU filter and index-select, where the slot
   is released, and the exact `_unletterbox_mask` / `_smooth_mask` / `_dilate_mask` bodies.
3. Read `services/redaction/src/defaults.py` and the `recommendation` block of
   `services/redaction/calibration/best_params.json`. **Surprise:** `mask_dilate_px` is `0` in the
   shipping calibration, so `_dilate_mask` is a no-op in production (kernel is `None`). Also
   `infer_width=768`, not the 640 that the `video_pipeline.py` module docstring still says.
4. Grepped for the black fill and for blur/pixelate across `services/redaction/src`. Only
   `apply_black_fill` and the bbox-bounded scatter in `video_pipeline.py` write pixels; the only "blur" is
   the mask-boundary Gaussian in `_smooth_mask`.
5. Read `services/redaction/src/video_pipeline.py` around `run_segment` (lines 660–1060) and the
   stage-timing log (1140–1245). This answered how frames are pre-resized (768×416 for 1080p), how
   per-detection masks are unioned, temporally smoothed, upscaled and filled, and where each
   `*_busy` / `infer_*` timer starts and stops.
6. Read `docs/vision/redaction-performance.md` in full (four chunks). Verified the 82 f/s, ~49 f/s,
   ~114 f/s, 601 px / 2856 px, recall 0.9681 / F2 0.9457 figures, and the "infer_decode … still open"
   line (it is item 7, lines 1313–1315).
7. Read selected sections of `docs/superpowers/investigations/2026-08-19-redaction-performance.md`
   (rig, oracle, control, budget, Experiments 2, 7, 12, 14, 17, final lever table) for the mechanism
   behind the doc's claims and for the rejected-lever verdicts.
8. Read `services/redaction/pyproject.toml`, `services/redaction/Dockerfile`, grepped for
   `cupy|cuda-python|pycuda|cuda.bindings` (no hits), and read the relevant part of
   `services/redaction/scripts/export_trt.py` (trtexec flags, NMS inside the graph).
   **Surprise:** the Dockerfile header (lines 9–13, 122–127) still says PyAV has no NVENC and encoding is
   libx264; the perf doc (lines 993–1005) records that the **amd64** image does link `h264_nvenc` and the
   service uses it. The Dockerfile comment is stale for amd64.
9. Read the three quality-gate scripts: `verify_redaction_identical.py` (emit/compare/judge, judge
   tolerance), `score_against_ground_truth.py` (whole file), and `validate_on_host.sh` (header + stages
   5–6). I did **not** run `--help` (rule: no execution); read the header comment that `--help` prints.
10. Read `services/stream-engine/src/pipeline/gstyoloxinfer.cpp` lines 1–780 and
    `gstyoloxinfer_preprocess.cu` in full. **Surprise (contradiction with the element's own header
    comment):** `run_trt` uses `B = self->batch_size` (the configured property), not the number of filled
    frames, for both `enqueueV3` and the D2H copy size (`gstyoloxinfer.cpp:371,397`). Header line 22 says
    "batch = active".
11. Traced `batch_size` to `services/stream-engine/src/pipeline/analysis_graph.py:26-30` and
    `builder.py:470-483` (= camera count at startup, clamped to `DS_MAX_BATCH_SIZE`, default 16), the
    muxer geometry to `config.py:89-90` (1920×1080), and the engine build to
    `health/engine_prebuild.py:631-641` (static shape, `--noTF32`, FP32) and
    `scripts/docker/export_yolox.py:15-33` (`decode_in_inference = False`, input `images`, output
    `output`, opset 11).
12. **Dead end:** `gstyoloxinfer_preprocess.cu:15` cites `tests/test_yolox_preprocess.py` as the
    byte-equivalence test. `ls services/stream-engine/tests` has no such file (only
    `test_gstyoloxinfer_contract.py`, `test_yolox.py`), and `git ls-files | grep yolox_preprocess` returns
    nothing. Failing command (zsh glob):
    `ls services/stream-engine/tests/*yolox_preprocess*` → `no matches found`. The comment's "spike 08"
    is actually `spikes/13-perf-cuda-nv12-preprocess/` (its README is titled "Spike 08"); `spikes/08-…` is
    an unrelated RTSP-output spike.
13. Read `services/stream-engine/src/pipeline/README.md` constraints #23, #25 (lines 557–716) and
    "Measured limits" (973–1010), and `docs/vision/stream-engine.md` lines 1–64 and 188–200.
    **Surprise:** the 32-camera ~406/s and 64-camera ~403/s limits were measured on 2026-04-13 with the
    **old** nvinfer + SCRFD + nvredact privacy topology on DS 9.0, i.e. before `gstyoloxinfer` existed.
    They say nothing about the current element's CPU decode/NMS cost.
14. Searched `docs/` and `ttmp/` for per-stage timing (`infer_forward|segment_timing|fill_busy|
    infer_decode`, `yoloxinfer|nsys|nsight|ms/frame`). Found the two redaction docs, one MPS spec that
    references `metric:segment_timing`, the 2026-09-28 file-embedding throughput investigation (which
    records stream-engine aggregate live fps, not stages), spike 14 (SCRFD batch wall clock), and the
    ML-PERF ticket workspaces.
15. Read the ML-PERF-001 `index.md` and intern-guide intro, the ML-PERF-002 intern-guide executive
    summary and outline, and listed ML-PERF-003.

## Findings

### Q1 — Redaction mask post-processing (`services/redaction/src/trt_engine.py`)

**Engine I/O (MEASURED-by-code, i.e. read from source).** Docstring `trt_engine.py:13-16`:

```text
input   (1, 3, 640, 640)  float32  BGR letterbox uint8 -> float32
dets    (1, N, 5)         float32  xyxy + score
labels  (1, N)            int64    COCO class id
masks   (1, N, 640, 640)  float32  sigmoid logits, binarized at runtime
```

- N is dynamic (-1) and bounded by mmdeploy `keep_top_k=100`; buffers are allocated at
  `_MAX_DETECTIONS = 100` (`trt_engine.py:88-92`, `430`). NMS is inside the engine: the onnxruntime deploy
  config emits the standard ONNX `NonMaxSuppression` op that TRT 10 runs natively
  (`scripts/export_trt.py:71-79`). Engine is FP16 (`--fp16`, `--builderOptimizationLevel=2`,
  `--memPoolSize=workspace:4096`, `NVIDIA_TF32_OVERRIDE=0`; `scripts/export_trt.py:168-188`;
  `src/engine_prebuild.py:177`).
- The canvas size is read off the engine (`trt_engine.py:391-401`); only 640×640 ships.
- **DERIVED buffer sizes:** masks buffer = 1×100×640×640×4 B = **163,840,000 B (≈164 MB)** per
  execution context — matches "160 MB" in `trt_engine.py:524,718` and "~164 MB of mask buffer per extra
  context" in `docs/vision/redaction-performance.md:1323`. Input fp32 = 3×640×640×4 = 4,915,200 B
  ("4.9 MB", `trt_engine.py:552`). Pinned uint8 HWC canvas = 640×640×3 = 1,228,800 B ("1.2 MB",
  `trt_engine.py:442`).

**Frame sizes on the 1080p path.**

- Decoded frame 1920×1080 BGR (= 6,220,800 B, DERIVED; the doc says "~6.2 MiB per 1080p BGR frame",
  `redaction-performance.md:534`).
- Pre-resize: `_infer_size_for` (`video_pipeline.py:509-516`) with `infer_target_w = INFER_WIDTH//32*32 =
  768` (`video_pipeline.py:242-249`, calibration `best_params.json:19`). **DERIVED:** scale 768/1920 = 0.4
  → `infer_w = 768`, `infer_h = int(432)//32*32 = 416` → **768×416** (`cv2.INTER_AREA` in the decode
  thread, `video_pipeline.py:801`). Same 768×416 for 720p (scale 0.6). 640×480 sources are not resized
  (`video_pipeline.py:511-512`). Confirmed by the doc (`redaction-performance.md:192-196`) and by the
  investigation ("resize to 768x416 for inference", `…investigations/2026-08-19-redaction-performance.md:702`).
- Letterbox (`trt_engine.py:103-136`): **DERIVED for 768×416:** scale = min(640/768, 640/416) = 0.8333;
  new_w = 640, new_h = round(346.67) = 347; pad_x = 0, pad_y = (640−347)//2 = 146; gray 114 bands. Content
  is 640×347, i.e. 1 − 347/640 = **45.8% of every forward is padding** (doc: "46%",
  `redaction-performance.md:1258-1260`).

**Preprocess / normalize (`trt_engine.py:545-576`).** CPU `cv2.resize` (INTER_LINEAR) writes straight into
the slot's pinned uint8 HWC canvas; then on the slot's CUDA stream:

```python
scale, pad_x, pad_y = _letterbox_into(frame_bgr, slot.pinned_canvas_np)
with torch.cuda.stream(slot.stream):
    slot.gpu_canvas.copy_(slot.pinned_canvas, non_blocking=True)   # 1.2 MB H2D
    chw_uint8 = slot.gpu_canvas.permute(2, 0, 1)                    # stride-only view
    input_buf = slot.buffers["input"][0]
    input_buf.copy_(chw_uint8)                                      # uint8 -> fp32 cast on copy
    input_buf.sub_(self._input_mean_gpu).div_(self._input_std_gpu)
```

Mean/std (BGR) = `[103.53, 116.28, 123.675]` / `[57.375, 57.12, 58.395]` (`trt_engine.py:99-100`), held as
`(3,1,1)` CUDA tensors (`trt_engine.py:365-366`). Three elementwise torch kernels (cast-copy, sub, div) on
a 3×640×640 tensor. Warm-up = `3 × pool_size` synthetic zero 640×640 frames through `infer_frame`
(`trt_engine.py:465-477`).

**Forward.** `context.execute_async_v3(slot.stream.cuda_stream)` on the slot's stream
(`trt_engine.py:578-595`); `submit_frame` returns without syncing (`trt_engine.py:627-673`). CUDA Graphs are
not used: capture fails because a dynamic output triggers a C++→Python `reallocate_output_async` callback
(`trt_engine.py:160-182`; doc item 4, `redaction-performance.md:1284-1289`).

**Collect: GPU filter, index-select, D2H, then the slot is released (`trt_engine.py:705-764`).**

```python
slot.stream.synchronize()                                   # 707: wait for forward
with torch.cuda.stream(slot.stream):                        # 730
    scores_gpu = dets_gpu[0, :, 4]
    keep_mask = (scores_gpu >= self._confidence) & (labels_gpu[0] == PERSON_CLASS_ID)
    idx_gpu = torch.nonzero(keep_mask, as_tuple=False).flatten()
    n_keep = int(idx_gpu.numel())                           # host sync
    ...
    kept_scores = scores_gpu[idx_gpu].cpu().numpy().astype(np.float32)
    kept_masks_lb = (
        (masks_gpu[0, idx_gpu] >= MASK_THRESHOLD).to(torch.uint8).cpu().numpy()
    )
t_decode = time.perf_counter()
self._release(inflight)                                     # 764: slot back to pool
```

- Confidence 0.3, `MASK_THRESHOLD` 0.35 (`best_params.json:20-21`), person class 0
  (`seg_engine.py:54`).
- Index-select is **on the GPU** (`masks_gpu[0, idx_gpu]`, advanced indexing), followed by threshold and
  uint8 cast on the GPU; only survivors are copied. **DERIVED per kept detection:** gather reads 640×640×4 =
  1,638,400 B fp32 and the D2H moves 640×640×1 = **409,600 B** uint8 (to pageable memory via `.cpu()`).
  The code comment "copying ~50 KB of valid masks vs 160 MB" (`trt_engine.py:716-718`) understates the
  survivor copy: one person is ~410 KB, the calibration mean of 5.4 kept detections
  (`best_params.json:34`) is ≈2.2 MB. (DERIVED; the "~50 KB" figure is not reproducible from the code.)
- The empty-scene branch (`n_keep == 0`, `trt_engine.py:740-748`) also releases immediately.
- Timers (`trt_engine.py:776-780`): `preprocess` = letterbox + H2D + normalize enqueue; `forward` =
  residual wait at `stream.synchronize()`; `decode` = GPU filter + `nonzero` sync + both D2H copies;
  `post` = the CPU loop below.

**CPU post-pass, per detection, after the GPU is released (`trt_engine.py:766-773`).**

```python
out_masks = np.empty((n_keep, height, width), dtype=np.uint8)
for i in range(n_keep):
    m_src = _unletterbox_mask(kept_masks_lb[i], scale, pad_x, pad_y, (height, width))
    m_src = _smooth_mask(m_src, self._smooth_px)
    out_masks[i] = _dilate_mask(m_src, self._dilate_kernel)
```

Here `(height, width)` is the **inference** frame (768×416 on 1080p), not the source frame.

- `_unletterbox_mask` (`trt_engine.py:139-157`): crop `[pad_y:pad_y+new_h, pad_x:pad_x+new_w]` from the
  640×640 uint8 mask (640×347 on 1080p) and `cv2.resize(..., (target_w, target_h), INTER_NEAREST)` back to
  768×416.
- `_smooth_mask` (`seg_engine.py:140-154`): `cv2.GaussianBlur((mask*255).astype(uint8), ksize=(0,0),
  sigmaX=sigma_px)` then `(blurred >= 128).astype(uint8)`. `sigma_px = MASK_SMOOTH_PX = 2.0`
  (`best_params.json:22`). Kernel size is **not set in the repo** (`ksize=(0,0)` → OpenCV derives it from
  sigma). DERIVED from OpenCV's documented auto-size rule for 8-bit input
  (`round(sigma·3·2+1) | 1`): 2·3·2+1 = 13 → a 13×13 separable kernel. (UNKNOWN-in-repo; verify against the
  pinned OpenCV 4.13 if it matters.) Docstring says "re-thresholds at 127"; code uses `>= 128`, which is the
  same cut on uint8.
- `_dilate_mask` (`seg_engine.py:125-137`): `cv2.dilate(mask, kernel, iterations=1)` with
  `cv2.getStructuringElement(MORPH_ELLIPSE, (2px+1, 2px+1))`. **In production `MASK_DILATE_PX = 0`
  (`best_params.json:23`), so `_make_dilate_kernel` returns `None` and the call is a no-op**
  (`seg_engine.py:127-128,135-136`; rationale `defaults.py:11-16`: the F2-optimal threshold already
  over-covers by ~10%, `mean_over_coverage 1.10`).

**Combination and black fill (other threads, all CPU).**

1. Union across detections at inference resolution: `np.logical_or.reduce(masks.astype(bool), axis=0)`
   (`seg_engine.py:508-516` via `_frame_union`, `video_pipeline.py:1206-1210`, called at 868).
2. Temporal smoothing: OR with the last `int(window_ms·fps/1000)` per-frame unions
   (`video_pipeline.py:274-287, 1216-1242`), window 100 ms (`video_pipeline.py:85`). DERIVED: 2 priors at
   24 fps, 3 at 30 fps, 1 at 12 fps, 0 at ≤9 fps.
3. Upscale the smoothed bool union to source resolution: `cv2.resize(view(uint8), (width, height),
   INTER_NEAREST).astype(bool)` (`video_pipeline.py:1012-1017`), timed as `mask_upscale_busy`.
4. Fill, bounded to the union's bounding box (`video_pipeline.py:1022-1053`), timed as `fill_busy`:

   ```python
   rows = np.any(fill_full, axis=1); cols = np.any(fill_full, axis=0)
   y0 = int(np.argmax(rows)); y1 = len(rows) - int(np.argmax(rows[::-1]))
   x0 = int(np.argmax(cols)); x1 = len(cols) - int(np.argmax(cols[::-1]))
   bgr[y0:y1, x0:x1][fill_full[y0:y1, x0:x1]] = 0
   ```

   The image path uses the unbounded `apply_black_fill` (`seg_engine.py:492-505`; called at
   `image_redact.py:327,442`).

Pipeline shape around this: three threads — decode+downscale, infer+smooth, upscale+fill+encode
(`video_pipeline.py:665-673`); queue depth `_PIPE_DEPTH = 2` (`video_pipeline.py:580-583`); a segment keeps
at most `min(pool, 2)` frames in flight and widens only when `free_slots + held >= pool`
(`video_pipeline.py:97-103, 233-239`).

### Q2 — GPU libraries in the redaction container; how TRT buffers are held

- Base image: `nvcr.io/nvidia/pytorch:26.05-py3` pinned by digest (`services/redaction/Dockerfile:30`),
  documented as Python 3.12, **PyTorch 2.12.0a0 (nv26.05), CUDA 13.2, TensorRT 10.16.1**, numpy 2.1.0
  (`Dockerfile:15-23`). Measured hosts record TRT **10.16.1.11** and torch `2.12.0a0+5aff3928d8.nv26.05`
  (`docs/vision/redaction-performance.md:119,745`).
- Added on top: `aiohttp 3.13.5`, `av 17.1.0`, `opencv-python(-headless) 4.13.0.92`, `mmengine 0.10.7`
  (`Dockerfile:153-160`); `mmcv 2.1.0` compiled with CUDA ops (`Dockerfile:35,173-182`); `mmdet 3.3.0`
  (`Dockerfile:178`); `mmdeploy v1.3.1` from git (`Dockerfile:197-203`). `pyproject.toml:6-11` lists only
  aiohttp, av, numpy, opencv-python-headless; torch/TRT/mmdet are image-only (`pyproject.toml:13-18`).
- **No cupy, no cuda-python, no pycuda** (grep over `services/redaction/{src,scripts,Dockerfile,
  pyproject.toml}` for `cupy|cuda-python|cuda\.bindings|pycuda|from cuda|import cuda` → no code hits).
- **TRT buffers are torch CUDA tensors.** Each slot allocates `torch.empty(shape, dtype, device="cuda")`
  per I/O tensor and binds its raw pointer with `context.set_tensor_address(name, buf.data_ptr())`
  (`trt_engine.py:427-439`); dynamic dims sized to 100. Stream = `torch.cuda.Stream()`; staging canvas =
  `torch.empty(..., pin_memory=True)` (`trt_engine.py:445-462`). Default pool size 4
  (`REDACTION_TRT_POOL_SIZE` → `REDACTION_SEMAPHORE_CAPACITY` → 4, `trt_engine.py:185-199`).
- Video: PyAV with its bundled libavcodec. Dockerfile comment says no NVENC/NVDEC (`Dockerfile:9-13,
  122-127`); that is true for arm64 only — the amd64 image links `h264_nvenc` (used) and `h264_cuvid`
  (unused, measured slower) (`docs/vision/redaction-performance.md:993-1013`). The comment is stale.

### Q3 — `docs/vision/redaction-performance.md`

**GB10 per-stage budget — MEASURED** (`redaction-performance.md:159-185`). Host `vision-spark`, GB10,
driver 580.95.05 / CUDA 13.2.1 / TRT 10.16.1.11, FP16, pool 4, libx264 (`:116-124`), 2026-08-19, **busy
host** (5 co-resident CUDA processes incl. a 61.8 GiB vLLM, SM pinned at 96%, thermal throttle 2457→2288
MHz; `:126-141`). 27 uncontended 1080p24 renders × 144 frames, medians, pre-optimisation (synchronous)
code:

| ms/frame (GB10)     | empty | ~1 person | line |
| ------------------- | ----: | --------: | ---- |
| `decode_busy`       | 3.40  | 3.14      | 169  |
| `infer_busy`        | 21.43 | 25.81     | 170  |
| `mask_upscale_busy` | 0.00  | 0.82      | 172  |
| `fill_busy`         | 0.00  | 5.15      | 173  |
| `encode_busy`       | 7.63  | 5.41      | 174  |
| wall                | 21.81 | 26.36     | 176  |
| `infer_preprocess`  | 3.20  | 1.44      | 182  |
| `infer_forward`     | 15.05 | 15.03     | 183  |
| `infer_decode`      | 2.94  | 8.88      | 184  |
| `infer_post`        | 0.00  | 0.54      | 185  |

The forward is "the single largest term and is insensitive to everything", 14.6–16.9 ms/frame across 51
renders and resolutions (`:187-190`); "+4 ms/frame per person", split mask decode +5.9, fill +5.2, upscale
+0.8 (`:198-200`). `fill_busy` was later cut 4.44 → 1.36 ms/frame by the bbox-bounded fill (`:646-648`).

**RTX PRO 6000 per-stage budget — MEASURED** (`redaction-performance.md:851-875`). Host
`playback-biotouch`, x86, RTX PRO 6000 Blackwell WS, compute 12.0, TRT 10.16.1.11, h264_nvenc
(`:739-749`), 2026-08-20; co-tenants present but **idle** (0% SM; `:751-757`); synthesized inputs from SAM3
fixtures with **5.54 detections/frame occupied** vs ~1 on GB10 (`:759-786`). Baseline (synchronous) arm,
medians of 8 renders:

| ms/frame (RTX)     | 1080p24 empty | 1080p24 occupied | 480p30 empty | 480p30 occupied |
| ------------------ | ------------: | ---------------: | -----------: | --------------: |
| `decode_busy`      | 3.12          | 2.34             | 1.09         | 0.79            |
| `infer_busy`       | 4.72          | 9.02             | 3.62         | 6.96            |
| `fill_busy`        | 0.06          | 3.55             | 0.02         | 0.55            |
| `encode_busy`      | 3.95          | 4.19             | 1.10         | 1.06            |
| wall               | 5.26          | 11.48            | 3.71         | 7.19            |
| `infer_preprocess` | 2.09          | 0.52             | 0.88         | 0.23            |
| `infer_forward`    | 2.41          | 4.62             | 2.63         | 5.87            |
| `infer_decode`     | 0.23          | 0.78             | 0.08         | 0.34            |
| `infer_post`       | 0.12          | 2.87             | 0.00         | 0.80            |

(Lines 860–874.) "The forward pass is no longer flat, and no longer dominant" (`:876-882`); on fast GPUs
the forward timer partly measures when the host asked (`:878-881`). On the pipelined code the sub-stages do
not nest (`infer_forward` reads 0.01 ms, i.e. fully hidden) (`:884-890`). DERIVED: on RTX 1080p occupied the
CPU per-detection `infer_post` (2.87) is 32% of `infer_busy` (2.87/9.02) and ≈0.52 ms per detection
(2.87/5.54); on GB10 it was 0.54 of 25.81 (2%).

**Throughput and fleet — MEASURED.**

- Fleet demand **82 f/s** = 30+24+24+2+2 (`:287-296`; headline `:29`). DERIVED check: 30+24+24+2+2 = 82 ✓.
- GB10 ceiling **46–49 f/s**, saturating at concurrency 4 (48.9 f/s at c=4, 49.4 at c=8, controller
  bypassed; `:28, 239-250`). 82/49 = 1.67 → "~1.7×" (`:297-301`).
- RTX ceiling **~114 f/s** (113.8 at c=4; `:842, 898-904`). DERIVED: 82/113.8 = 0.72 of capacity.
- Caveat on "GB10 is forward-bound": on the same GB10 the baseline arm measured 33.5 f/s busy vs 83.2 f/s
  after the machine quietened (`:652-668`); `trtexec` on a real input measured 57.6 and 125.9 qps minutes
  apart (`:724-727`), and the engine does ~126 qps on real input (`:1309-1312`). DERIVED: 1/125.9 qps ≈
  7.9 ms/forward on a quiet moment vs the 15 ms in the table. The 15 ms/60% figure is a contended-host
  number.

**Rejected levers and why — MEASURED** (doc + investigation).

| Lever                                   | Verdict / reason                                                                                            | Where                                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Batching (batch-4 engine)               | 93.4 vs 125.6 f/s, −26% per frame on GB10; **re-test on RTX not done**                                      | `redaction-performance.md:1247-1257`; inv. `:577,609`                                       |
| Smaller letterbox 640×576 / 640×480     | 576 passes noise floor but loses recall (0.9637) and a detection; 480 regresses 7/19                         | `:1258-1276`                                                                                |
| TRT build knobs (8 engines)             | 126.4–128.0 qps, ±0.6%                                                                                      | `:1277-1283`; inv. `:651`                                                                   |
| CUDA graphs                             | blocked: NMS dynamic output; mmdeploy 1.3.1 `TRTBatchedNMS` won't build on TRT 10                           | `:1284-1289`                                                                                |
| NVDEC hardware decode (amd64)           | 2.4× slower per frame (1.90 vs 0.80 ms), 0.20× aggregate; crossover ~78 Mbit/s                               | `:1290-1308`                                                                                |
| Context pool 8 / 12                     | no faster than 4, ~164 MB mask buffer per extra context                                                     | `:1321-1325`; inv. `:605`                                                                   |
| Host threads / separate processes       | device-bound, not GIL-bound                                                                                 | `:714-715`; inv. `:606`                                                                     |
| OpenCV thread cap (1)                   | moved nothing; 508 threads at c=8 are blocked                                                               | `:1321-1325`; inv. `:608`                                                                   |
| Pipeline depth                          | null                                                                                                        | `:714`                                                                                      |
| Builder optimisation level 5            | identical on real input                                                                                     | `:715`; inv. `:604`                                                                         |
| Submit/collect on separate threads      | worse, plus slot-leak mode                                                                                  | inv. `:607`                                                                                 |

Kept: pipelined submit/collect, collect on the slot stream (23.2 → 17.1 ms/frame at depth 4), bbox-bounded
fill (`:635-648`).

**Mask-head non-determinism and noise floor — MEASURED.** One fixed frame through one engine 12 times →
up to 10 distinct mask-logit hashes, detection scores identical (`:614-622`; inv. `:797-813` table: scores 1
distinct value on 11/12 frames, raw logits up to 10/12, binarized masks 1 on 10/12 frames; a flipped boundary
moves ~25 px of 75,000). Worst per-frame black-pixel delta across three same-code runs: **601 px on GB10**
(1080p, `:1262`) and **2856 px on RTX PRO 6000** (`:1080-1084`, "~5× larger"). Later RTX runs: 4138 px
worst-case (`:1134`), 2503 px lost / 3119 px gained (`:1195`). Verified.

**`infer_decode` still open — verified.** Item 7, `redaction-performance.md:1313-1315`: "`infer_decode`,
2.9 → 8.9 ms/frame with occupancy — the largest occupancy-driven term … It now runs on the slot stream, so it
overlaps; making it *cheaper* is still open."

**Adaptive fps controller (one paragraph).** The controller picks a target rung from the ladder
`(1, 2, 5, 10, 15, 30)` fps (`services/redaction/src/controller.py:87`), ticking every 5 s
(`controller.py:99`). It steps **down** when `realtime_factor_p95 / 0.7 > 1.0` for 3 consecutive ticks
(`controller.py:102,126`; doc `:316`) and steps **up** only when the rung above would still fit:
`controlled_fps × per-population achieved-rate ratio + uncontrolled_fps ≤ capacity_fps × 0.9` for 12 ticks
(`controller.py:122,172`; doc `:317, 381-386`). `capacity_fps` comes from `stats.frame_throughput()` and is
a demonstrated lower bound, raised by any higher reading and lowered only while behind (`:328-342`).
Factor samples are selected by admission rung and visit, the ladder waits for 3 fresh samples
(`controller.py:145`), and exports/whole-file/snapshot frames are added as load, never scaled (`:344-360`).
Decimation is an integer stride `round(source/target)` (`services/redaction/src/decimation.py:18-26`), so a
24 fps source emits 12 fps at rungs 10 and 15 (`:362-368`). Queue depth is deliberately not a control input
(`:388-392`), and realtime factor is the wrong step-up observable (four predictors failed; `:319-326`). Effect,
MEASURED: RTX 8 cameras 14.78 → 95.60 f/s (**6.47×**, `:1200-1207`); GB10 4 cameras 8.64/20.72 → 51.00 f/s
(**2.5–5.9×**, `:433-441`). "Larger than any per-stage optimisation in this document" (`:43-50, 305-308`).

### Q4 — Quality gates

| Script                                                       | What it checks                                                                                                                                                                                                                                                                                                                                                                                       | Inputs / how run                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/redaction/scripts/verify_redaction_identical.py`   | `emit`: per `.redacted.ts`, sha256 of every decoded frame (`pixels`), sha256 of `.redact.json` `frames` (`regions`), per-frame count of pure-black pixels (`black_per_frame`) (`:66-100`). `judge`: floor = max per-frame black delta over all pairs of ≥3 same-code runs (`:149-171`); tolerance `max(4 × floor_max, 64)` px/frame (`:195`); **coverage loss beyond tolerance fails, gain only reported** (`:226-247`). | Runs inside the container (needs PyAV). `emit <tag> <out.json>`, `compare <a> <b>`, `judge <cand.json> <floor1> <floor2> [floor3…]` (`:46-52`). Bench root `REDACTION_BENCH_ROOT`, default `/data/recordings/_bench` (`:54-55,63`).              |
| `services/redaction/scripts/score_against_ground_truth.py`   | Runs `TrtSegEngine.infer_frame` on the checked-in SAM3-annotated fixtures (5 production camera frames), unions masks, computes recall / precision / IoU / F2 / over-coverage via `calibrate.py`'s `_f2_metrics` (`:23-27, 72-93`). For anything that changes engine, geometry, precision or model (`:4-15`).                                                                                         | `python3 score_against_ground_truth.py <engine.plan> <label> [--fixtures DIR] [--json OUT]`, inside the container with tests/ and scripts/ mounted (`:29-30`); default fixtures `/app/tests/fixtures` (`:55`).                                      |
| `services/redaction/scripts/validate_on_host.sh`             | Stages 0–9: preflight, identity (arch/GPU/driver/TRT/engine sidecar), two resident arms (baseline ref vs working tree), backend=trt assertion, correctness gates a) baseline vs candidate serial, b) candidate at c=4 vs floor, c) soak c=8 + post-soak floor + `in_flight == 0`, ground truth for both arms (fails if recall drops > 0.0005 or detections decrease), controller stage, paired throughput A/B (`:9-58, 230-362`). | `validate_on_host.sh [--out DIR] [--baseline REF] [--conc 1,4,8] [--pairs 4] [--burst 12]` plus `--want --cameras --ctrl-dur --image --recordings` (`:7-8, 79-92`); baseline rendered 3× for the floor (`:259-262`); exit code = failure count (`:548`). |

Ground-truth figures **verified MEASURED**: recall 0.9681, precision 0.8680, IoU 0.8441, **F2 0.9457**, 30
detections on the RTX PRO 6000 (`redaction-performance.md:1079-1081`, repeated `:1136-1137`; recall 0.96812
at `:1193`), "the same figures the GB10 recorded". Note the different, older calibration-time numbers in
`best_params.json:24-28` (mean_f2 0.9430, mean_recall 0.9621), which come from `calibrate.py`'s sweep, not
this script. The investigation's oracle was itself checked for determinism before use
(`…investigations/2026-08-19-redaction-performance.md:34-50`).

### Q5 — Black fill only

Confirmed. Video: `bgr[y0:y1, x0:x1][fill_full[y0:y1, x0:x1]] = 0`
(`services/redaction/src/video_pipeline.py:1052`). Images: `frame_bgr[union] = 0` in `apply_black_fill`
(`services/redaction/src/seg_engine.py:504-505`), called at `services/redaction/src/image_redact.py:327,442`.
A grep for `blur|pixelat|mosaic|fill_mode|REDACTION_MODE` in `services/redaction/src` finds only the
mask-boundary `GaussianBlur` in `_smooth_mask` (`seg_engine.py:149`), which smooths the mask, not the image.
No alternative fill mode exists.

### Q6 — YOLOX GStreamer plugin (`services/stream-engine/src/pipeline/gstyoloxinfer.cpp`)

**Constants (`gstyoloxinfer.cpp:65-90`).** Input 640 (`YOLOX_INPUT_SIZE`, verified 640×640, also
`scripts/docker/export_yolox.py:18,25`); 80 classes; `YOLOX_NUM_COLS 85 /* 4 bbox + 1 obj + 80 classes */`;
`YOLOX_NUM_ANCHORS 8400 /* 80*80 + 40*40 + 20*20 */`; `YOLOX_CONF_THRESHOLD 0.05`; `YOLOX_NMS_IOU 0.45`;
`YOLOX_MAX_DETS 200`; `YOLOX_MIN_DETECTION_PX 20`; default batch 10. Grid built for strides `{8, 16, 32}`
(`:179-205`). DERIVED: 640/8 = 80, 640/16 = 40, 640/32 = 20 → 6400 + 1600 + 400 = 8400 ✓.

**Where the output buffer comes from.** Not nvinfer: this element replaces DeepStream's nvinfer PGIE because
nvinfer's NV12→BGR/resize chain is not OpenCV-equivalent and collapses person scores 2–3×
(`gstyoloxinfer.cpp:4-15`; README constraint #25, `services/stream-engine/src/pipeline/README.md:612-645`).
It deserializes a TensorRT engine itself (`:301-330`), `cudaMalloc`s `dev_input` (B×3×640×640 fp32) and
`dev_output` (B×8400×85 fp32), `cudaMallocHost`s a **pinned** `host_output` of the same size, creates one
stream (`:331-337`), and binds them with `setInputTensorAddress` / `setOutputTensorAddress` (`:353-360`).
The engine comes from `trtexec --onnx=yolox_nano.onnx --minShapes=opt=maxShapes=<B×3×640×640>
--memPoolSize=workspace:<MiB> --noTF32` (`services/stream-engine/src/health/engine_prebuild.py:631-641`):
**FP32, TF32 off, static batch** (filename `…_b{B}_trt{ver}_gpu0_fp32.notf32.engine`,
`engine_prebuild.py:245-264`). ONNX from upstream YOLOX at commit `6ddff48…` with
`model.head.decode_in_inference = False`, input `images`, output `output`, opset 11
(`scripts/docker/export_yolox.py:15-33`; `services/stream-engine/Dockerfile:75-100`). With decode off, the
85 columns are raw box regressions (dx, dy, log w, log h) + objectness + 80 class scores; the C++ applies the
grid/stride/exp decode but no sigmoid, so obj/class must already be sigmoid-activated in the graph (DERIVED
from the decode code; that the upstream YOLOX head applies sigmoid in this export mode is upstream
behaviour, not visible in PB).

**Device→host copy, every batch (`gstyoloxinfer.cpp:368-404`).**

```cpp
int B = self->batch_size;
...
bool ok = self->trt_context->enqueueV3(self->stream);
if (ok) {
    size_t out_sz = (size_t)B * YOLOX_NUM_ANCHORS * YOLOX_NUM_COLS * sizeof(float);
    ok = cudaMemcpyAsync(self->host_output, self->dev_output, out_sz,
                         cudaMemcpyDeviceToHost, self->stream) == cudaSuccess;
}
if (cudaStreamSynchronize(self->stream) != cudaSuccess) ok = false;
```

- The whole raw output is copied to host every batch, and `B` is the configured `batch-size` property, not
  `surface->numFilled`. `batch-size` = `settings.batch_size` (`analysis_graph.py:26-30`) = camera count at
  startup clamped to `DS_MAX_BATCH_SIZE` (default 16) (`builder.py:470-483`, `config.py:185`). The muxer
  pushes after `batched-push-timeout = 33333 µs` (`builder.py:535`), so a partial batch is possible; the
  element preprocesses only the frames present (`:579-623`) yet runs TRT and copies all B slots (unfilled
  slots carry stale input). DERIVED from code; not measured. The element's header says "batch = active"
  (`:22`) — that comment does not match `run_trt`.
- **DERIVED size:** 8400 × 85 × 4 B = **2,856,000 B = 2.856 MB (2.72 MiB) per frame slot**. At B = 10:
  28.56 MB per batch; the Dockerfile notes "22 fps/cam at batch=10" (`services/stream-engine/Dockerfile:94`)
  → 22 × 28.56 ≈ 628 MB/s D2H. At B = 32: 91.4 MB per batch. If the old-topology ~406 frames/s were reached
  with this element: 406 × 2.856 ≈ 1.16 GB/s (hypothetical; that limit was measured with nvinfer).

**Decode on CPU, per frame, single thread under `trt_mutex` (`gstyoloxinfer.cpp:242-295`, called at
`:669-671`).** For each of 8400 rows: skip if `objectness < 0.01`; argmax over 80 class scores; `score =
obj × best_prob`; skip if `< 0.05`; **skip unless the argmax class is person (0)** — a box where person is
second-best is dropped; decode `cx = (r0+gx)·st`, `cy = (r1+gy)·st`, `w = exp(r2)·st`, `h = exp(r3)·st`;
reject if `w` or `h < 20` px (network space, pre-clamp); clamp to [0, 640]; then NMS and truncate to 200.

**NMS (`gstyoloxinfer.cpp:219-238`).** `std::sort` by score descending, then greedy O(n²) suppression,
class-aware (`class_id` equality), IoU > 0.45 (`iou()` at `:207-217`, +1e-6 in the denominator). Since only
person survives decode, it is effectively single-class. Detections are mapped back to muxer space with
`inv_scale` and pad (`:673-683`), emitted as `NvDsObjectMeta` (`uid=1`, `class_id=0`), and
`frame_meta->bInferDone = TRUE` (`:667`). The 0.50 publish threshold is applied later in Python
(`services/stream-engine/src/pipeline/yolox.py:53-63`).

**Preprocess kernel (`gstyoloxinfer_preprocess.cu`).** One launch per frame (16×16 blocks over 640×640,
`:148-157`), writing a slot of `dev_input` (`gstyoloxinfer.cpp:602-606`). One thread per **output** pixel
(a gather; no thread writes anywhere but its own output index, so no atomics/scatter):

- Pad region → 114.0 in all three planes (`:85-90`).
- Content: OpenCV half-pixel mapping `src = (dst+0.5)/scale − 0.5`, clamped (`:92-99`); reads the 4
  bilinear neighbours (`:101-111`).
- Each neighbour is converted NV12→BGR first with **OpenCV's fixed-point BT.601 limited-range integer
  coefficients** (`CY 1220542, CUB 2116026, CUG −409993, CVG −852492, CVR 1673527, >>20`; `:33-40, 48-66`),
  chroma shared per 2×2 Y block, then bilinearly blended in float and rounded to int, clamped to [0,255]
  (`:113-123`). Output is BGR CHW float in [0,255], no mean/std (`:125-130`).
- Why: to be byte-equivalent to `cv::cvtColorTwoPlane(NV12)` + `cv::resize(INTER_LINEAR)` + 114 letterbox,
  because a 1-bit mismatch collapses YOLOX person scores 2–3× (`:1-16`; README constraint #23 lists the three
  causes — chroma siting, BT.601 range, half-pixel alignment — at `README.md:557-585`). So it is
  integer-exact in the colour conversion and in the final rounding, and order-exact (convert-then-resample,
  as OpenCV does); the bilinear weights themselves are float. Cost "~0.2 ms/frame on GB10, dwarfed by TRT
  inference" (`:18-21`, author's statement, no measurement record found). The cited test file does not exist
  (see Diary step 12); the provenance spike is `spikes/13-perf-cuda-nv12-preprocess/` (acceptance
  `max_abs_diff < 0.01`, `mean_abs_diff < 0.001`, `README.md:96-103`; constraint #23 records max_diff < 0.33,
  mean_diff < 0.004 on 25 crops for the SCRFD variant).

### Q7 — Measured stream-engine limits; was CPU decode/NMS measured?

- **MEASURED**, `services/stream-engine/src/pipeline/README.md:973-990`: GB10 Spark, DS 9.0, 2026-04-13,
  640×480 @ 30 fps sources, camera count = batch size, "captured with the older privacy pipeline (full
  pipeline: YOLOX + SCRFD, nvredact, per-camera encoders)". 9 cams ~215/s (~19 fps each); **32 cams ~406/s
  (~10 fps); 64 cams ~403/s (~4 fps, muxer saturated)** (`:985-986`); 128 starts but throughput not measured.
  "Detection-only throughput is strictly higher … re-measure before sizing production" (`:977-979, 992-994`).
- These predate `gstyoloxinfer` (which replaced nvinfer; constraint #25), so they do not describe the
  current element.
- **CPU decode/NMS cost: UNKNOWN — never measured.** No doc, investigation or ticket in PB records
  per-stage timing for `gstyoloxinfer` (searched `docs/` and `ttmp/` for `yoloxinfer`, `nsys`, `nsight`,
  `ms/frame`; Diary step 14). The element only logs counters every 500 batches (`gstyoloxinfer.cpp:443-453`),
  no timings. The one newer stream-engine number is aggregate: 168.2/164.5/165.3 fps live with 13 sources on
  an RTX PRO 6000 (`docs/superpowers/investigations/2026-09-28-file-embedding-throughput.md:11-13`), not a
  stage split.

`docs/vision/stream-engine.md`, key points:

1. One DeepStream 9.1 process per box, one pipeline for every camera (`:3, 10-11`).
2. Purpose: YOLOX-Nano detection + NvSORT tracking → NATS events for the vision service (`:9`).
3. Scale "stable up to 64 cameras on GB10; sweet spot 16–32 at 10–25 fps/cam" (`:11`), citing the old
   measured limits above.
4. Topology: nvmultiurisrcbin → gstyoloxinfer (FP32, uid=1) → nvtracker (NvSORT) → nvdsosd → tee →
   RGB thumbnail/detection branch with Detection/Thumbnail/Embedding probes (`:18-29`).
5. Custom element because nvinfer's preprocessing collapses YOLOX person confidence;
   `NVIDIA_TF32_OVERRIDE=0` needed on Blackwell (`:33`).
6. Two NATS subjects per camera: high-volume `.object` and `.object.summary` (~0.2 Hz heartbeat) (`:38-48`).
7. Stream-engine does **not** redact; it stamps `privacy_mode` advisory only; NVR calls `services/redaction`
   per segment (`:188-198`).
8. Event times are probe-observed wall clock, not camera capture time (`:51-63`).

### Q8 — Docs/tickets with redaction or stream-engine per-stage timing

| Path                                                                                                  | One line                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/vision/redaction-performance.md`                                                                | Canonical redaction perf doc: GB10 + RTX PRO 6000 per-stage tables, throughput, controller, rejected levers.                                                     |
| `docs/superpowers/investigations/2026-08-19-redaction-performance.md`                                 | Experiment log 1–20 behind it; Exp 2 stage decomposition by stream (`:162-171`), Exp 7 fill, Exp 12 decode split (`:697-703`), Exp 14 non-determinism, Exp 17 RTX. |
| `services/redaction/README.md:266-299`                                                                | Quick-reference figures (~22 ms/frame TRT FP16 on GB10, ~155 ms/frame mmdet fallback); defers to the perf doc.                                                   |
| `services/redaction/calibration/best_params.json:30-34`                                               | Calibration-time estimates: median per-frame 16.33 ms, median post 1.18 ms, mean 5.4 detections kept.                                                            |
| `docs/superpowers/specs/2026-06-08-vlm-gpu-isolation-mps-ops-design.md:95-110`                        | MPS ops plan; uses `metric:segment_timing` reappearance as a recovery signal; no stage numbers.                                                                  |
| `services/stream-engine/src/pipeline/README.md:973-1010`                                              | Old-topology aggregate limits (215/406/403 f/s); no stage split.                                                                                                 |
| `docs/superpowers/investigations/2026-09-28-file-embedding-throughput.md`                             | File-analysis throughput plus live aggregate ~165 fps with 13 sources on RTX PRO 6000; no stage split.                                                           |
| `spikes/14-perf-scrfd-batch-wallclock/README.md`                                                      | Historical SCRFD batch>1 wall-clock: 15.0 → 8.69 ms/image at batch 8 (pre-segmentation redaction).                                                               |
| `spikes/13-perf-cuda-nv12-preprocess/README.md`                                                       | NV12→CHW kernel correctness spike (byte-equivalence criteria); provenance of the YOLOX preprocess kernel.                                                         |
| `ttmp/2026/10/12/ML-PERF-001--…/`, `ML-PERF-002--…/`, `ML-PERF-003--…/`                              | Perf Lab and Grounding DINO work; **no redaction or stream-engine stage timing** (ML-PERF-001 index states no new DGX measurement, `index.md:37-39`).            |

### Q9 — ML-PERF-001 and ML-PERF-002

**ML-PERF-001 — "DINO and Embedding Kernel Profiling and Visualization"** (index:
`ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/index.md`). The origin of
the Perf Lab. It began as an intern research/design package for reproducible CPU/GPU profiling, memory
analysis and kernel investigation of two workloads — Grounding DINO acceleration (PR 1005) and the embedding
comparison/optimization (PR 1008) — linking execution evidence to algorithms and source (`index.md:19-21`;
`design/01-intern-guide-to-reproducible-profiling-and-execution-visualization.md`). It grew a `lab.js` lab
language (`design/02-lab-language-specification.md`), a workbench UI design and React/Redux prototype
(`design/03-workbench-ui-design.md`, `experiments/lab-workbench/`), and a backend with SQLite persistence,
runner, importer and a pi-driven assistant (`design/04-perf-lab-backend-end-to-end-design.md`), with diaries in
`reference/01..04`. Evidence boundary: no new DGX or hardware-counter run; the only measurements are
`local-sampler` runs on an Apple M1 Pro (`index.md:37-39`).

**ML-PERF-002 — "Studying Grounding DINO PR 1005 in the Perf Lab"** (index:
`ttmp/2026/10/12/ML-PERF-002--studying-grounding-dino-pr-1005-in-the-perf-lab-evidence-import-images-detections-and-datasets/index.md`;
substance in `design/01-intern-guide-studying-grounding-dino-acceleration-in-the-perf-lab.md` and
`reference/01-implementation-diary.md`). PR 1005 speeds up Grounding DINO without changing outputs (exact
normalization lookup table, bulk post-processing transfers, CUDA-graph capture/replay keyed by layout, an
audited fusion of two generated kernels that avoids a 200 MB intermediate); the PR reported 67.5% (RTX PRO
6000) and 56.5% (DGX Spark) lower median latency with identical detections, while an independent DGX
reproduction measured 30% and a warm-process memory increase above the PR's 20% limit (guide
`:34`). The ticket adds to the Perf Lab: evidence archives as content-addressed captures, public verified
datasets/media, `image`/`annotation`/`detection`/`check` entities with the PR's matching rules ported to
TypeScript, `detections()` and `gallery()` views, and a `dino` workload that runs the real backend at the PR's
two revisions locally (CPU exercises only two of the four changes); DGX execution deferred (guide `:38-46`;
changelog). ML-PERF-003 (`ttmp/2026/10/12/ML-PERF-003--running-perf-lab-experiments-on-the-dgx-an-ssh-executor-for-containerized-gpu-captures/`)
is the follow-on for running lab experiments on the DGX over SSH (untracked in git at session start).

### Checks against the prior beliefs

- **(a) "Redaction mask post-processing runs per detection on CPU after the GPU is released."** Confirmed,
  with precision: the score/class filter, `nonzero`, **index-select of survivors**, threshold and uint8 cast
  run on the GPU (slot stream), then both D2H copies, then `_release` at `trt_engine.py:764`; only then the
  per-detection unletterbox → smooth → (no-op) dilate loop runs on CPU (`:766-773`) at inference resolution
  (768×416 for 1080p). Union, temporal OR, upscale to source and the black fill are further CPU work on other
  threads. Dilation is disabled in production (`mask_dilate_px=0`).
- **(b) "On GB10 the forward pass, not post-processing, is the bottleneck."** Confirmed for the recorded
  GB10 baseline (forward 15.0 ms of ~26 ms; `infer_post` 0.54 ms). Two caveats: `infer_decode` (GPU filter +
  D2H, 8.88 ms occupied) is the second-largest term and is the doc's open item; and the GB10 numbers were
  taken on a contended host — the same engine measured ~126 qps (~7.9 ms) on real input in quiet moments, and
  the baseline arm went 33.5 → 83.2 f/s when the host quietened. On the RTX PRO 6000 the forward is not
  dominant and the CPU `infer_post` is ~32% of `infer_busy` at 5.5 detections/frame.
- **(c) "YOLOX copies the whole raw output to host every batch and decodes on CPU."** Confirmed, and
  slightly worse than stated: the copy size and the TRT batch are the **configured** batch size, not the
  number of filled frames (`gstyoloxinfer.cpp:371,397`), contradicting the element's own "batch = active"
  comment (`:22`). Host buffer is pinned. Decode + NMS are single-threaded per frame under a mutex. Their CPU
  cost has never been measured.
