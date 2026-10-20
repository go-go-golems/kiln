## Diary

Scope: read-only study of the factory-videos repository for the KILN-002 intern guide. Abbreviations used below:

- **FV** = `/Users/manuel.odendahl/code/tulip/experiments/2026-09-14--factory-videos`, at `7623e4bcb7431fe47be6fecc79f825da4bbb2711` ("Merge pull request #81 from tulip/FACTORY-RUNDEBUG-001", 2026-10-19). `git status --porcelain` on `src/factory`, `web/live/views/similarity` and `web/live/stage/embedding` was empty (the studied code is the committed code). Every `path:line` below is FV-relative unless it starts with `/`.
- **W8C-DIARY** = `ttmp/2026/10/03/FACTORY-REBUILD-001--*/reference/16-diary-w8c-motion-points-plan.md`
- **AJ11-DIARY** = `ttmp/2026/09/25/ACTIVITY-JS-011--motion-point-tracking-and-hand-keypoints-in-the-js-graph/reference/01-diary.md`
- **PERF-RESULTS** = `ttmp/2026/09/30/FACTORY-LIVE-PERF-001--*/analysis/01-results-realtime-capacity-on-the-dgx-spark-and-the-mac.md`
- **LOWER-DIARY** = `ttmp/2026/10/01/FACTORY-LIVE-LOWERING-001--*/reference/01-diary.md`
- **EMB-DIARY** = `ttmp/2026/10/04/FACTORY-FINALDEMO-001--*/reference/07-diary-embedding-map.md`
- **DATA** = `/Volumes/SSD/data/factory-shots`

What I did, in order:

1. Listed FV and `src/factory/{kernels,core}`; read `src/factory/kernels/motion.py` whole (461 lines), then `kernels/catalog_w8c.py` and `core/values_w8c.py` (the op specs and value types the kernels use).
2. Read `compiler/motion.py` (how `video.motion`/`video.flow` expand into frames → gray → scan → windows), then `core/operations.py` and `core/plan.py` whole.
3. First dead end: `grep -rn ... --include=*.py` failed under zsh with `(eval):1: no matches found: --include=*.py` (unquoted glob). Re-ran with `--include='*.py'`. A broad `.resolve(` grep then drowned in `pathlib.Path.resolve()` hits; narrowed it to `src/factory`.
4. Found the resolver call site in `compiler/lower.py` (`resolve`, `default_available`, `lane_for`, the implementation step, `logical_hash`/`execution_fingerprint`), `compiler/graph.py` (`node_key`), and `runtime/session.py` (kernel instantiation by `implementation_id`, lanes, scan dispatch, synthetic marking). Read `kernels/hands.py:200-252`, `kernels/nvsort.py:405-413` and `kernels/bytetrack.py:582-589` for multi-implementation precedent.
5. Media path: `backends/media/gst.py` (whole), `backends/media/file.py` (header, `_pull`, `FileSource`), `runtime/grids.py` header, `runtime/session.py:443-479` (frame → sample → `ImageRef`).
6. Searched ttmp/docs for the "4K ≈ 2.2× real time" note: found it in PERF-RESULTS and the FACTORY-LIVE-LOWERING-001 guide/diary; read the L1 implementation and measurement entries.
7. Searched for "0.013": the only relevant hits are W8C-DIARY:181 and :320. Read W8C-DIARY Step 2 and the experiment script `ttmp/2026/10/03/FACTORY-REBUILD-001--*/scripts/w8c/01-gray-decode-experiment.py`. **Surprise:** the "budget" is an experiment result used to pick the gray conversion, not an assertion in any test.
8. Read `test/factory_tests/test_w8c_motion_points.py` (header, helpers, the motion/runtime/golden tests), `AGENTS.md` (test tiers), `pyproject.toml`, `test/conftest.py`.
9. Timings: grepped "102–110" → `docs/video-analysis/04-motion-flow-and-rhythm.md:69`; followed it to AJ11-DIARY:231-232 (53.2/58.2 s and 102.1/110.1 s) and AJ11-DIARY:55-68 + `scripts/01-flow-benchmark.py` (DIS 3.2/8.3 ms). Model costs from PERF-RESULTS:71-82. Read v1's `src/factory_shots/gt/media.py:692-835` to know what the 53 s v1 figure included.
10. Environment: `pyproject.toml`, `uv.lock` (torch/triton/nvidia-* entries and their `sys_platform == 'linux'` markers), `.python-version`, `docker/spark/Dockerfile`, `docker/spark/compose/docker-compose.yml`, `backends/models/modelsvc.py` header.
11. Web: `web/live/views/similarity/{model.ts,EmbeddingSimilarity.tsx}`, `views/resultValues.ts`, `store/runStore.ts` header, `feed/NatsRunFeed.ts` header, the envelopes route in `src/factory_shots/live_ui/app.py`, `web/package.json`, root `package.json`, `web/tsconfig.json`, `web/vite.live.config.ts`. Grepped `web/live`, `web/grammar`, `web/report-public`, and `vendor/playback-ui` for `navigator.gpu`, `GPUDevice`, `webgl`, `WebGL2`: no hits.
12. t-SNE: `web/live/stage/embedding/{project.ts,pump.ts,tsne.worker.ts}`, `web/live/viewgrammar/embeddingMap.ts` defaults, EMB-DIARY:255-302, design doc `ttmp/2026/10/04/FACTORY-FINALDEMO-001--*/design-doc/02-look-and-widgets-analysis.md:415-422`.
13. Data: listed `DATA/golden-clips/v1`, `DATA/sources`, ran `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,profile,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames,color_range,color_space,has_b_frames:format=duration,bit_rate` on every `.mp4` (metadata only, no decode). Read `DATA/golden-clips/v1/golden-clips-v1.json` head and the zone files `js-examples/guide/golden/zones/marker-short-{left,right}-zones.json` and `JS-DOCS-EXPERIMENT-003 .../sources/zones/{left,right}-zones.json`.
14. `cache/embeddings/*/matrix.npz`: system `python3 -I -c "import numpy"` failed with `ModuleNotFoundError: No module named 'numpy'`; switched to `FV/.venv/bin/python -I <scratch script>` (script in my session scratchpad, run from the scratchpad cwd, `np.load(..., allow_pickle=False)`). Read the five `manifest.json` files. **Surprise:** these are per-*shot* vectors (N×D) of the YouTube factory-video corpus, not N×N matrices and not section-table window embeddings.
15. Synthetic arithmetic checks (no video, no model, no network), with the FV venv (`numpy 2.4.6`, `cv2 5.0.0`, `PIL 12.3.0`, Python 3.11.16), scripts in my session scratchpad:
    - first guess for `cv2.COLOR_RGB2GRAY` (`(4899R+9617G+1868B+8192)>>14`) was **wrong** (0.26 % of pixels off by 1); a 15-bit form matched; then verified **exhaustively over all 2^24 RGB triples**;
    - Pillow `BICUBIC` downscale: one-shot equals "horizontal pass then vertical pass with a uint8 intermediate" bit for bit, and a 25-line re-implementation of Pillow's fixed-point resampler is bit-identical to Pillow for 12 size pairs (1920×1080, 3840×2160, 1280×720, 320×240 sources; 160/480/960 targets, including upscale);
    - `np.mean` of an int16 slice equals `exact integer sum / count`.
    The scratch scripts were deleted after the results were copied here; the load-bearing code is quoted in §1.

Nothing was run from the FV pipeline, no models, no ssh, no network. No files in FV were written.

## Findings

### 1. Motion kernels (`src/factory/kernels/motion.py`)

#### 1.1 The five operations (specs in `src/factory/kernels/catalog_w8c.py`)

| Op constant | Name | Shape / domain / missing rule | Inputs → outputs (value kinds) | Params (JSON schema) | Ref |
|---|---|---|---|---|---|
| `GRAY` | `motion.gray` | MAP / PRESERVE / PROPAGATE | `images: Image` → `gray: GrayFrame` | `decodeWidth` (required) int 64–1920, multipleOf 2 | `catalog_w8c.py:66,72-78` |
| `CHANGE` | `motion.change` | SCAN / PRESERVE / GAP_TO_SCAN | `gray: GrayFrame`, `zones: Zones` → `samples: MotionSample` | `keys` (≤32 unique strings) | `catalog_w8c.py:80-86` |
| `PAIRS` | `flow.pairs` | SCAN / PRESERVE / GAP_TO_SCAN | `gray: GrayFrame`, `zones: Zones` → `samples: FlowSample` | `keys`, `everyMs` 40–5000, `method` ∈ {`dis-ultrafast`,`dis-medium`,`farneback`}, `movingThreshold` 0–10000 (all but keys required) | `catalog_w8c.py:46,88-96` |
| `ZONE_MOTION` | `video.zone_motion` (JS `Video.motion`) | REDUCE / PRESERVE / PARTIAL | `windows: Window`, `samples: MotionSample`, `zones: Zones` → `features: FeatureTable` | `everyMs` 40–5000, `windowMs` 250–600000 (both required), `keys`, `decodeWidth` (default 480); `windows`/`samples` are compiler-wired implicit inputs | `catalog_w8c.py:67-68,100-107` |
| `ZONE_FLOW` | `video.zone_flow` (JS `Video.flow`) | REDUCE / PRESERVE / PARTIAL | `windows: Window`, `samples: FlowSample`, `zones: Zones` → `features: FeatureTable` | MOTION_PARAMS + `method` (default `dis-medium`), `movingThreshold` (default 20), `cadence` (default true) | `catalog_w8c.py:109-120` |

`GRAY`, `CHANGE` and `PAIRS` have `js=None`: they are inserted by the compiler, never written by a script (`catalog_w8c.py:77,85,95`). The expansion is in `src/factory/compiler/motion.py:93-110`: for `video.motion(zones, {everyMs, windowMs, keys?, decodeWidth?})` it adds `video.frames({everyMs})` → `motion.gray({decodeWidth})` → `motion.change` (or `flow.pairs` with `everyMs`, `method`, `movingThreshold`) and `video.windows({durationMs: windowMs, strideMs: windowMs})`, and rewires the call into the window reduce. Equal frames/gray/window nodes merge, so motion and flow at one cadence and width decode and gray once (`compiler/motion.py:12`; the compiled ACTIVITY-JS-011 script has one `video.frames`, one `motion.gray`, one `video.windows`: asserted by `test/factory_tests/test_w8c_motion_points.py:337-341`). Defaults: `decodeWidth` 480 for motion and flow, 960 for point tracks (`compiler/motion.py:43`); flow `method` `dis-medium`, `movingThreshold` 20 (`compiler/motion.py:45`). `windowMs` must be a multiple of `everyMs` and the bound range must start on the window grid (`compiler/motion.py:21-24`; refusals tested at `test_w8c_motion_points.py:349-371`).

Value kinds (`src/factory/core/values_w8c.py`): `GrayFrame` (`image_id`, decode `width`/`height`, `source_width`/`source_height`, `requested_us`, `time_ms` float, `data` = run-time-only uint8 H×W array excluded from equality; `:19-31`); `MotionSample` (`time_ms`, `paired`, `values: tuple[(zone key, float)]`; `:34-42`); `FlowZoneSample` (10 per-pair stats; `:45-60`); `FlowSample` (`time_ms`, `paired`, `zones`, `gap_keys`; `:63-72`).

#### 1.2 `to_gray` exactly (`motion.py:146-151`)

```python
def to_gray(rgb: np.ndarray, width: int, height: int) -> np.ndarray:
    """An RGB ``uint8`` frame as a ``height`` x ``width`` gray ``uint8`` image (a new array)."""
    gray = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2GRAY)
    if gray.shape == (height, width):
        return gray
    return np.asarray(Image.fromarray(gray).resize((width, height), Image.BICUBIC))
```

- Input: H×W×3 uint8, RGB order, from the pixel store (`motion.py:168`, `np.asarray(self.pixels.get(image.buffer))`).
- Step 1, colour: `cv2.cvtColor(..., COLOR_RGB2GRAY)` on the **full decoded frame** (full source resolution unless `analysisMaxWidth` scaled it; §2). Output uint8. MEASURED (exhaustive over all 2^24 RGB triples, `cv2 5.0.0`, Mac arm64, my check in this session): `gray = (9798·R + 19235·G + 3735·B + 16384) >> 15`. The weights sum to 32768, so it is a 15-bit fixed-point BT.601 luma with round-half-up. The commonly quoted 14-bit form `(4899R+9617G+1868B+8192)>>14` does **not** match (0.257 % of random pixels differ by 1); float `round(0.299R+0.587G+0.114B)` differs on 0.13 %. Whether the Spark's aarch64 OpenCV wheel uses the same formula: UNKNOWN (not checked).
- Step 2, resample: skipped when the gray image already has the target shape (`motion.py:149-150`), else Pillow `Image.resize((width, height), Image.BICUBIC)` on mode `L` (8-bit). The target size is `decode_size(source_width, source_height, decodeWidth)` = `(dw, max(2, round(H·dw/W/2)·2))` (`motion.py:65-67`, used at `:165-168`), computed from the **source** size (`image.source_width or image.width`), not from the decoded frame's size. Default `dw` = 480; 1920×1080 → 480×270; 3840×2160 → 480×270 (DERIVED). Python `round` is round-half-to-even.
- Pillow's BICUBIC is an antialiased separable convolution (support scales with the downscale factor), with integer coefficients and a **uint8 clip/round between the horizontal and the vertical pass**. MEASURED in this session: `PIL one-shot == PIL(horizontal to 480×H) then PIL(vertical to 480×270)` bit for bit (1920×1080 and 3840×2160 sources); vertical-first differs by up to 1. The following re-implementation (Pillow 12.3.0 semantics; `PRECISION_BITS = 22`, cubic `a = -0.5`) was MEASURED bit-identical to Pillow on 12 size pairs:

```python
PRECISION_BITS = 32 - 8 - 2; A = -0.5
def bicubic(x):
    x = abs(x)
    if x < 1.0: return ((A + 2.0) * x - (A + 3.0)) * x * x + 1
    if x < 2.0: return (((x - 5) * x + 8) * x - 4) * A
    return 0.0
def coeffs(in_size, out_size):
    scale = in_size / out_size; filterscale = max(scale, 1.0); support = 2.0 * filterscale
    ksize = int(math.ceil(support)) * 2 + 1
    bounds, kk = [], np.zeros((out_size, ksize), np.int64)
    for xx in range(out_size):
        center = (xx + 0.5) * scale
        xmin = max(int(center - support + 0.5), 0)
        xmax = min(int(center + support + 0.5), in_size) - xmin
        w = [bicubic((x + xmin - center + 0.5) / filterscale) for x in range(xmax)]
        ww = sum(w); w = [v / ww if ww != 0 else v for v in w]
        for x, v in enumerate(w):   # round half away from zero to 22-bit fixed point
            kk[xx, x] = int(-0.5 + v * (1 << PRECISION_BITS)) if v < 0 else int(0.5 + v * (1 << PRECISION_BITS))
        bounds.append((xmin, xmax))
    return bounds, kk
def pass1d(img, out_size, axis):   # uint8 in, uint8 out; call axis=1 (horizontal) first, then axis=0
    img = np.moveaxis(img, axis, -1); bounds, kk = coeffs(img.shape[-1], out_size)
    out = np.empty(img.shape[:-1] + (out_size,), np.uint8); src = img.astype(np.int64)
    for xx, (xmin, n) in enumerate(bounds):
        ss = (1 << (PRECISION_BITS - 1)) + src[..., xmin:xmin + n] @ kk[xx, :n]
        out[..., xx] = np.clip(ss >> PRECISION_BITS, 0, 255)
    return np.moveaxis(out, -1, axis)
```

  Tap counts (DERIVED from `ksize = ceil(2·scale)·2+1`): 1920→480 (scale 4) and 1080→270: ≤17 taps; 3840→480 (scale 8) and 2160→270: ≤33 taps. The tests also exercise **upscaling** (320×240 synthetic frames at `decodeWidth` 480 → 480×360; `test_w8c_motion_points.py:41,80-82,122`), where `filterscale = 1` and the kernel has ≤5 taps.
- Output: a new uint8 H×W array stored in `GrayFrame.data` (`motion.py:169-171`); the RGB frame's pixel hold is released right after (`catalog_w8c.py:18-19`; W8C-DIARY:238-242).

#### 1.3 `MotionChange.step` exactly (`motion.py:176-202`)

```python
def step(self, value: GrayFrame, scope: Scope) -> list[Emit]:
    boxes, spans = self.zones.at(value)
    frame = value.data.astype(np.int16)
    if self.previous is None:
        sample = MotionSample(value.time_ms, False)
    else:
        diff = np.abs(frame - self.previous)
        sample = MotionSample(value.time_ms, True, tuple(
            (spans[name][0], float(diff[y0:y1, x0:x1].mean()))
            for name, (x0, y0, x1, y1) in boxes.items() if active(spans[name][1], value.time_ms)))
    self.previous = frame
    return [Emit("samples", Complete(sample))]
```

- State: the previous **selected** gray frame as int16 (`motion.py:183,195`). A missing sample (`gap`) emits the `Missing` and keeps the previous frame (`motion.py:198-199`), so the next pair spans the gap (v1 behaviour). First frame: `paired=False`, no values.
- Math: full-frame `|int16(cur) − int16(prev)|` (the whole 480×270 image, 129,600 px, DERIVED), then for every zone box active at the decoded time, `float(mean)` of the box slice. `np.mean` of int16 accumulates in float64; since every partial sum is an exact integer, it equals `exact_int_sum / count` (MEASURED equality in this session). Max per-box sum at 480×270 is 255 × 129,600 = 33,048,000 < 2^31 (DERIVED): an int32 accumulator suffices.
- Zone geometry (`motion.py:75-90`, cached per `(source_w, source_h, dw)` in `_ZoneGeometry.at`, `:120-141`): zones are authored in **source pixels**; the doc's `width`/`height` must equal the source size or the scan fails (`:133-135`). Scale `sx = dw/W`, `sy = dh/H`; box = `(int(x0·sx), int(y0·sy), max(int(x0·sx)+1, round(x1·sx)), max(int(y0·sy)+1, round(y1·sy)))` — floor-by-truncation for the near edge, Python round-half-even for the far edge. Boxes are named `key#position` (file order of the selected keys); several boxes can share a key (time-split zones with `validMs`); `active(span, t)` = `span is None or span[0] <= t < span[1]` on the decoded time in ms (`:116-117`). Boxes may overlap (golden zones: `bench` contains `endA`; §9).
- Cadence: not every frame. The compiler inserts `video.frames({everyMs})` (`compiler/motion.py:97`); the runtime's sample grid takes, for each `t_k = origin + k·everyMs`, the **first decoded frame with `t_k <= t < t_k + everyMs`** (`src/factory/runtime/grids.py:3-7`; same rule in `motion.py:8-9`). `everyMs` comes from the script (e.g. 250 in `js-examples/guide/02-activity-map.js` via `docs/video-analysis/04-motion-flow-and-rhythm.md:22`, and in the ACTIVITY-JS-011 whole-recording script `ttmp/2026/09/25/ACTIVITY-JS-011-*/scripts/02-measure-flow-and-motion.js`). At 30 fps and 250 ms that is one selected frame per 7.5 decoded frames (DERIVED).
- Execution: a scan node has one step in flight at a time (`runtime/session.py:925-937`, `state["busy"]`), submitted to its lane; `motion.gray` (a map) runs per scope on the `cpu` lane with credit 2 (`compiler/lower.py:509-514`, `runtime/session.py:645`).

#### 1.4 `ZoneMotion` features (`motion.py:350-373`)

Per selected key `k` (sorted): `k_mean` = `round(float(np.mean(values)), 4)` or null, `k_p90` = `round(float(np.percentile(values, 90)), 4)` or null (numpy's default linear interpolation), `k_samples` = count; columns typed `number|null`, `number|null`, `number` (`:355-356, 367-372`). Values are appended in member (time) order across all boxes of that key. A `Failed` member fails the window; `Missing` members are counted in `Quality` and skipped (`:330-343, 358-361`). One row per window, `per_scope=True`. `ZoneFlow` (`:422-446`) emits 10 columns per key (`FLOW_COLUMNS`, `:376-379`): speed mean/p90, moving fraction, coherence, dir x/y, cadence Hz/strength (autocorrelation, `:280-325`), samples, gaps. `FlowPairs.step` (`:245-269`) runs OpenCV DIS/Farnebäck on the **whole** gray image (`flow_function`, `:207-214`), scales to source px/s and computes per-zone stats including `np.percentile(speed, 90)` (`:217-229`).

### 2. How frames reach `GrayFrames`

- Decoder: **GStreamer via PyGObject**, not PyAV, not an ffmpeg subprocess, not OpenCV (`src/factory/backends/media/gst.py:1-16,64-87`). File pipeline: `filesrc ! qtdemux ! queue ! h264parse ! <decode chain> ! videoconvert ! video/x-raw,format=RGB ! appsink` (`backends/media/file.py:3,62-64`; `gst.py:46-47,127-141`).
- Decode chain per target (`gst.py:29-34,100-117`): Mac `vtdec` (VideoToolbox, hardware); Spark `nvv4l2decoder ! nvvideoconvert` (NVDEC, output NVMM carried back to system memory by `nvvideoconvert`); fallback `avdec_h264` (CPU). `FileSource.open` picks it from the target (`file.py:246-271`). No DeepStream elements on the frame path (the NvSORT tracker is a separate native backend: `kernels/nvsort.py:405-413`).
- Colour conversion: the RGB conversion before the appsink is `videoconvert`, i.e. **CPU**, on both targets when no `analysisMaxWidth` is set (`gst.py:136-137`). Format into Python: packed **RGB uint8, H×W×3** (row padding removed), one copy out of the GStreamer buffer (`gst.py:144-164`), then `pixels.put(array)` into the host pixel store (`file.py:200,214`; `runtime/resources.py:34-49`).
- Every decoded frame is converted and copied: "Every decoded frame in the range is yielded in order (the runtime selects frames for samples)" (`file.py:30`); the session offers each frame to the sample grids and releases the source's reference afterwards (`runtime/session.py:443-458`). `SourceSpec.sample_every_us` says "sources may decode sparsely" (`core/plan.py:109`) but no backend or runtime code reads it (grep of `backends/` and `runtime/` for `sample_every`: no hits) — so sparse decode is UNIMPLEMENTED.
- Resolution: full source resolution by default; downscaled only with the run-level `analysisMaxWidth` execution option (`compiler/lower.py:206-209`; `SourceSpec.analysis_max_width`, `core/plan.py:103`; default None). The per-node `video.frames` `maxWidth` param exists in the schema (`kernels/catalog.py:40`) and is filled from `analysisMaxWidth` by `compiler/graph.py:319-320`, but the decoder only reads `analysis_max_width` (`file.py:78`).
- **Existing GPU colour/scale path:** `analysis_tail` with a max width on the Spark builds `nvv4l2decoder ! nvvideoconvert ! video/x-raw,format=RGBA,width=[16,W],pixel-aspect-ratio=1/1 ! videoconvert ! video/x-raw,format=RGB` — scale and colour-convert on the GPU, then only an RGBA→RGB **repack** of the small frame on the CPU (`gst.py:127-141`, docstring `:130-133`). Implemented by FACTORY-LIVE-LOWERING-001 L1 (commit 70cf908a in v1's `execution/gst.py`, LOWER-DIARY:93,97) and carried into v2's `gst.py`. Making it the default is still an open task (`ttmp/2026/10/01/FACTORY-LIVE-LOWERING-001--*/tasks.md:9`).
- Interaction with `to_gray` (DERIVED from `motion.py:165-168` and `gst.py`): with `analysisMaxWidth` set, the RGB frame is already scaled by GStreamer (`videoscale` on the Mac, `nvvideoconvert` on the Spark) while `decode_size` still uses the source size; if the scaled width equals `decodeWidth` the Pillow resample is skipped entirely (`motion.py:149-150`), otherwise Pillow resamples the already-scaled frame. Either way the gray pixels differ from the default (full-res RGB → cv2 → Pillow) path. No measurement of that difference was found: UNKNOWN.
- Where the 4K bound is recorded: PERF-RESULTS:121-134 (table at :122-131; text at :134: "Every decoded frame is converted to packed RGB on the CPU at full resolution by `videoconvert` (`execution/gst.py:479-485`) … At 4K that is 25 MB per frame. The GPU is nearly idle in those runs (2–6 %)"). MEASURED processing RTF at 4K on the Spark: decode-only every frame 1.4×, decode-only 10 fps 2.2×, YOLO26n every 100 ms 2.2× (PERF-RESULTS:122-125). These were runtime **v1** runs on a 4K source called `dexory4k` (PERF diary `ttmp/2026/09/30/FACTORY-LIVE-PERF-001--*/reference/01-diary.md:165,205`), not on section-table. With GPU scaling (L1): 4K W0a every 100 ms 1.97× → 20.9× at width 1280; 4K W1 2.23× → 8.64× (MEASURED, LOWER-DIARY:172-173).

### 3. The operation / implementation registry

#### 3.1 `ImplementationSpec` (`src/factory/core/operations.py:118-128`) — all fields

| Field | Type | Default | Role |
|---|---|---|---|
| `implementation_id` | `str` | — | e.g. `"cpu.motion_gray"`; unique per operation (`:198-199`); prefix `fake`/`test`/`stub` marks results synthetic (`runtime/session.py:212`) |
| `operation` | `str` | — | must already be registered (`:195-196`) |
| `version` | `str` | — | **unused**: not read by the compiler, the plan, the fingerprints or the docs generator (grep: no `impl.version`/`implementation.version` anywhere in `src/factory`) |
| `resource` | `Callable[[Mapping[str, Any]], ResourceClass]` | — | params → lane name (`ResourceClass = str`, e.g. `"model:yolox_nano.onnx"`, `"cpu"`, `"inline"`, `"media:video"`; `:103`) |
| `make_kernel` | `Callable[[KernelServices, Mapping[str, Any]], Any]` | — | builds the Map/Scan/Reduce/Expand kernel |
| `requirements` | `tuple[Requirement, ...]` | `()` | must be ⊆ the environment's `available` |
| `accepts` | `Callable[[Mapping[str, Any]], bool]` | `lambda params: True` | parameter filter (e.g. model prefix) |
| `refusal` | `Callable[[Mapping[str, Any]], tuple[str, str] \| None] \| None` | `None` | (message, hint) for the NO_IMPLEMENTATION diagnostic |

`Requirement` (`operations.py:96-100`): `MODEL_SERVICE = "model_service"`, `GSTREAMER = "gstreamer"`, `TARGET_SPARK = "target_spark"`, `TARGET_MAC = "target_mac"`. `KernelServices` (`:106-115`): `pixels`, `models`, `target` ("mac"), `node_key`, `trackers`, `media`.

#### 3.2 `REGISTRY.implementation()` and resolution

- `Registry.implementation(spec)` (`operations.py:194-201`) only checks that the operation exists and the id is unique; it does not check disjointness.
- `Registry.resolve(op, params, available)` returns **all** candidates with `set(requirements) <= available and accepts(params)` (`:203-207`).
- The compiler's `resolve` (`compiler/lower.py:477-506`) demands **exactly one**: 1 → chosen; >1 → `AMBIGUOUS_IMPLEMENTATION` "`{op}: N implementations resolve (...); exactly one must`", hint "A registry defect: make the implementations' requirements or accepts disjoint." (`:483-488`); 0 → `NO_IMPLEMENTATION` naming each implementation's missing requirement or refusal (`:489-506`). There is **no preference order or priority**. Tested: `test/factory_tests/test_compiler.py:324-326` (ambiguity is a compile error) and `:307-321`.
- `available` = `default_available(target, config)` = `{TARGET_MAC}` or `{TARGET_SPARK}`, plus `MODEL_SERVICE` when the execution has a `modelService` block (`compiler/lower.py:73,463-469,668`). No caller in `src/` passes `available` explicitly (grep `available=`: none). `GSTREAMER` is never offered, so an implementation requiring it would never resolve.
- The runtime instantiates kernels purely by `implementation_id` (`runtime/session.py:243-247`) and builds one lane per distinct `resource` (`compiler/lower.py:854`; `runtime/session.py:251-256`: `InlineExecutor` for `"inline"`, else `ThreadExecutor(credit)`). `lane_for` (`compiler/lower.py:509-514`): `model:*` → credit 1, max_pending 2, `latest_pending` under realtime; `"cpu"` → credit 2, pending 32; **anything else (e.g. a new `"gpu"` lane) → credit 1, pending 32, `wait`**.
- Motion's own implementations: `_cpu(...)` registers each op with `version="1"`, `resource=lambda p: "cpu"`, no requirements, default `accepts` (always true) (`motion.py:451-461`: `cpu.motion_gray`, `cpu.motion_change`, `cpu.flow_pairs`, `cpu.zone_motion`, `cpu.zone_flow`).

#### 3.3 Fingerprints (`compiler/graph.py:326-334`, `compiler/lower.py:872-881`)

- `node_key` = `sha256("factory.node/1", canonical_json({op, version (the OperationSpec's), params (normalized), inputs: {port: [input node_key, port]}, source?}))`. It does **not** include `implementation_id`, the implementation's `version`, or the resource.
- `logical_hash` = hash of the node keys, outputs and source identities (`lower.py:872-876`).
- `execution_fingerprint` = hash of `logical` plus `[[node_key, implementation_id, resource] …]`, policy, target and lanes (`lower.py:877-881`). So swapping the implementation of a node changes the execution fingerprint but not the node key or logical hash; bumping `ImplementationSpec.version` changes neither.

#### 3.4 Multi-implementation precedent

- `hands.classify` (`kernels/hands.py:236-252`): `modelsvc.hands_classify` (`requirements=(MODEL_SERVICE,)`, `accepts` = model set and not `fake:`) and `fake.hands_classify` (no requirements, `accepts` = model starts with `fake:`). Disjoint by `accepts` on the `model` param; both use `resource = f"model:{p['model']}"` and the same kernel class with a different id.
- `detections.track`: `deepstream.nvsort` (`requirements=(TARGET_SPARK,)`, `accepts` `algorithm == "nvsort"`, resource `"inline"`; `kernels/nvsort.py:405-413`) vs `cpu.bytetrack` (`accepts` `algorithm == "bytetrack"`; `kernels/bytetrack.py:582-589`). Disjoint by the `algorithm` param, with the target as an extra gate.
- Consequence for a second `motion.gray` implementation (DERIVED from the above): because `cpu.motion_gray` has no requirements and accepts every parameter set, **any** second implementation that resolves on some target makes `motion.gray` ambiguous there and the compile fails. Registering one therefore needs either (a) an edit to the existing CPU registration (e.g. `requirements=(TARGET_MAC,)` or an `accepts` predicate), or (b) a parameter that selects it — and `motion.gray`'s params schema has `additionalProperties: False` (`catalog_w8c.py:49-51,76`), so a new param is an `OperationSpec` change (which also changes every motion `node_key`), or (c) a new `Requirement` member plus `default_available` plumbing (`operations.py:96-100`, `lower.py:463-469`). The runtime (session, lanes) needs no change. Also: adding an implementation of a JS-spelled op (`video.zone_motion`) changes the generated `docs/js-operations.md` ("Implementations: `cpu.zone_motion`", `docs/js-operations.md:722`; generator `src/factory/application/operations_doc.py:119-123`), which `test/factory_tests/test_operations_doc.py:7-9` checks for staleness; `motion.gray` has `js=None` and no section there.

### 4. The "mean |Δ| 0.013" figure and the motion tests

- Where: W8C-DIARY:179-184 (prose) and :319-325 (table). It is the outcome of the experiment `ttmp/2026/10/03/FACTORY-REBUILD-001--*/scripts/w8c/01-gray-decode-experiment.py`, used to **choose** `cv2 RGB2GRAY + PIL BICUBIC`. It is **not** a tolerance asserted by any test (grep of `src` and `test` for `0.013`: no hits).
- What it compares (script `:90-99`): on golden clip `marker-short-left.mp4`, 0–10 s, `everyMs` 250, `decodeWidth` 480 (`:24-27`), for consecutive selected frames, `m1[i]` = whole-frame `mean|gray_v1(t) − gray_v1(t−1)|` with v1 gray = ffmpeg `scale=480:270,format=gray` (`factory_shots/gt/media.py:692-790`), and `m2[i]` = the same with v2 gray = candidate conversion of the GStreamer/VideoToolbox RGB frame; metric = `mean_i |m1[i] − m2[i]|`. MEASURED: 0.0133 on a v1 mean change of 1.337, correlation 0.9998 (W8C-DIARY:181, :320). Other candidates: BT.709 full + PIL BICUBIC 0.0194, cv2 + INTER_AREA 0.0277, cv2 + INTER_LINEAR 0.1674 (W8C-DIARY:320-322). The absolute gray difference for the chosen conversion is 3.100 levels mean, a mean shift of −2.6 levels attributed to GStreamer's YUV→RGB vs ffmpeg's (W8C-DIARY:182-184, :320). Scale-only comparison (ffmpeg full-res gray resized vs ffmpeg 480-px gray): PIL BICUBIC 0.567 mean |Δ| with 65 % of pixels exact (W8C-DIARY:323-324).
- End-to-end parity recorded once: golden clip 0–20 s, v2 vs v1 motion `mean`/`p90` mean relative difference 1.2–2.1 %, flow speeds 0.3–0.9 % (W8C-DIARY:257-260). The frozen v1 parity data was later removed (FACTORY-V1FIXTURES-001; stated at `test_w8c_motion_points.py:12`).
- Tests covering motion now:
  - `test/factory_tests/test_w8c_motion_points.py` (615 lines): kernels on synthetic moving frames (`:118-127` motion sample counts with gaps; `:128-154` flow; `:156` cadence; `:230-248` failed member / wrong zone size); runtime path through `factory run` on a synthetic source (`:300-319`, `@pytest.mark.slow`); acceptance scripts compile with one shared `video.frames`/`motion.gray`/`video.windows` (`:337-347`); refusals (`:349-371`); golden clip run asserting completeness and `*_samples > 0` only (`:375-400`, slow, skipped without the SSD). None asserts pixel values or a gray tolerance.
  - `test/factory_tests/test_w8b_end_to_end.py:62-66,166-197` uses `video.motion` in joins.
  - `test/live_ui/test_agent_errors.py` mentions motion (not read in detail).
- Commands: `pytest` = fast tier, `pytest --run-slow` = everything, naming a file runs it including slow tests (`AGENTS.md:13-18`; `pyproject.toml:62-66`; `test/conftest.py:22-27`). The W8c diary's form: `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib PYTHONPATH=src .venv/bin/python -m pytest -q -p no:cacheprovider test/factory_tests/test_w8c_motion_points.py` → "26 passed in 5.40s" (W8C-DIARY:233-234; at that time). `DYLD_FALLBACK_LIBRARY_PATH` is needed on macOS for GStreamer (`gst.py:8-11`).

### 5. Measured timings

| Figure | Value | Status | Source | What it includes |
|---|---|---|---|---|
| v1 `video.zone_motion`, whole 09-21 recording, left | 53.2 s | MEASURED | AJ11-DIARY:231 | runtime **v1**: an ffmpeg subprocess decoding the whole 2,771.9 s 1080p file (software decode, `select` first frame per 250 ms bucket, `scale=480:270,format=gray`, rawvideo pipe) plus numpy int16 diffs on 3 zones (`src/factory_shots/gt/media.py:692-790, 805-835`); `everyMs` 250, `windowMs` 5000 (`ttmp/2026/09/25/ACTIVITY-JS-011-*/scripts/02-measure-flow-and-motion.js`); Mac |
| same, right | 58.2 s | MEASURED | AJ11-DIARY:232 | as above, 4 zones |
| v1 `video.zone_flow`, left / right | 102.1 / 110.1 s | MEASURED | AJ11-DIARY:231-232; summarized as "102–110 s per camera" in `docs/video-analysis/04-motion-flow-and-rhythm.md:69` | its own ffmpeg decode (`decode_calls 2` = one per operation) + DIS medium per pair |
| whole run wall, left / right | 156 / 169 s | MEASURED | AJ11-DIARY:231-232 | both operations |
| DIS ultrafast / medium / Farnebäck per pair | 3.2 / 8.3 / 12.4 ms (second run 3.0 / 8.1 / 12.5) | MEASURED | AJ11-DIARY:65-66; script `ttmp/2026/09/25/ACTIVITY-JS-011-*/scripts/01-flow-benchmark.py` | 39 pairs of 480×270 gray from `section-table-left_2026-09-21.mp4` at 2688 s; timer also includes `np.linalg.norm(f, axis=2).mean()` per pair (`01-flow-benchmark.py:18-21`); Apple silicon |
| ffmpeg decode of those 40 frames | 0.67 / 0.42 s | MEASURED | AJ11-DIARY:67 | with `-ss` seek |
| v1 zone motion, 30 s of 1080p at 250 ms | 0.8 s | MEASURED | `ttmp/2026/09/25/JS-DOCS-EXPERIMENT-003-*/reference/01-diary.md:363` | first v1 smoke test |
| v2 vs v1, golden clip 0–20 s, flow+motion | v2 3.5 s wall vs v1 2.1 s | MEASURED | W8C-DIARY:257-258 | v2 = `factory run` worker incl. start-up |
| samples per camera (46 min, 250 ms) | 11,088 | DERIVED | 2,771,933 ms / 250 ms = 11,087.7 | |
| v1 motion throughput | 52× / 47.6× real time; 4.8 / 5.2 ms per sample | DERIVED | 2,771.9/53.2, 2,771.9/58.2; 53.2 s/11,088, 58.2 s/11,088 | each sample also pays for ~7.5 decoded frames |
| CPU flow per camera | 35 s (ultrafast) – 92 s (medium) | DERIVED in source | AJ11-DIARY:68 (11,088 × 3.2 ms; × 8.3 ms) | |
| Decode vs gray vs diff breakdown | — | **UNKNOWN** | not recorded anywhere I found, for v1 or v2 | v2 records per-node lane service times (`runtime/resources.py:244`, `runtime/session.py:1230`, `status.service_ms`), which would give `motion.gray` vs `motion.change` cost without new instrumentation |
| YOLO26n per call, Spark 1080p | 14.4 / 17.9 ms (p50/p95) | MEASURED | PERF-RESULTS:75 | lane service time in v1 runtime, incl. per-job overhead (frame SHA-256) (PERF-RESULTS:71) |
| SAM 3 (1 prompt), Spark 1080p | 791 / 835 ms | MEASURED | PERF-RESULTS:80 | incl. PNG encode of the frame |
| Cosmos-Embed1 (8-frame clip), Spark 1080p | 283 / 304 ms | MEASURED | PERF-RESULTS:82 | |

### 6. Environment

- Python: `requires-python = ">=3.11"` (`pyproject.toml:9`), `.python-version` = `3.11`; the FV venv is Python 3.11.16 (MEASURED, this session). The Spark image is Python 3.12 (`docker/spark/Dockerfile:25-26`, torch copied into `/usr/local/lib/python3.12/dist-packages`).
- Dependencies (`pyproject.toml:10-17`): `opencv-python-headless>=5.0.0.93`, **`torch>=2.14.0`**, `pillow>=10.1`, `markdown-it-py`, `mcp`, `onnxruntime==1.26.0`. Locked: numpy 2.4.6 / 2.5.3 (two resolution markers, `uv.lock:1433-1436,1517-1520`), opencv 5.0.0.93 (`:1829-1830`), pillow 12.3.0 (`:1870-1871`), torch 2.14.0 (`:3087-3088`), and, as torch dependencies on `sys_platform == 'linux'` only, `triton` 3.8.0 (aarch64 and x86_64 wheels, `:3196-3199`) and the CUDA 13 `nvidia-*` wheels (`:1599-1751`, markers at `:3091-3103`). **No cupy, numba, pycuda, jax** in `pyproject.toml` or `uv.lock`, and none in the Spark Dockerfile's pip lines (`docker/spark/Dockerfile:61-80`: numpy, opencv, pillow, transformers, timm, ultralytics…, `tensorrt-cu13==10.16.1.11`, pyarrow, scikit-learn).
- Where torch is used: only `src/factory_shots/...` (model service, gt detectors, lab features; grep `import torch`), not `src/factory` (the v2 runtime). The v2 runtime's GPU work is (a) GStreamer NVIDIA elements on the Spark and (b) everything model-related through the model service.
- Model service: one per machine, reached over a **Unix-domain socket** named by `GT_MODEL_SERVICE_SOCKET` with a shared-memory arena for frames (`src/factory/backends/models/modelsvc.py:1-30,65,425-427,525`); "the only way runtime v2 runs a real model" (`:3`). Started on the Mac with `--device mps` (`README.md:10`) and on the Spark with `--device cuda` (`docker/spark/compose/docker-compose.yml:81-82`).
- Targets: `mac` and `spark` (`compiler/lower.py:73`; `gst.py:34`). The Spark image is built on the Playback stream-engine image (GStreamer 1.24.2 with `nvv4l2decoder`, `nvvideoconvert`) plus NVIDIA's aarch64 torch (`docker/spark/Dockerfile:9-14,23-26`); a review note says pip may have replaced that torch with a PyPI wheel (`:52-56`).

### 7. Window similarity (`web/live/views/similarity/model.ts`)

- `similarityMatrix(all, cap = MAX_MATRIX_WINDOWS)` (`model.ts:123-140`): keeps the **last** `cap` windows (`all.slice(max(0, len − cap))`, `:124`), allocates a row-major `Float64Array(n·n)` (`:126`), sets the diagonal to 1 without computing it (`:130`), computes the upper triangle with `cosine` = plain dot product of the unit vectors (`:73-77, 131-134`) and mirrors it, tracks min/max of the off-diagonal cosines (`:135-136`), and returns `{windows, values, omitted: all.length − n, min, max}` (`:139`). Work per rebuild: n(n−1)/2 dot products = 79,800 at n = 400; × 256 = 20.4 M multiply-adds for Cosmos-224p, × 768 = 61.3 M for 768-d models (DERIVED).
- `MAX_MATRIX_WINDOWS = 400` (`model.ts:110`). Above the cap the older windows are dropped and the UI shows a badge "the {n} most recent windows; {omitted} older not shown" (`EmbeddingSimilarity.tsx:120-125`).
- Inputs: `windowVectors(data)` (`model.ts:45-70`) walks the output's envelopes in time order, takes `values.vector` from complete `Embeddings` envelopes of `window` scope (`views/resultValues.ts:35-39`), computes `norm = Math.hypot(...vector)`, rejects zero/mismatched-dimension vectors, counts vectors whose norm differs from 1 by more than `UNIT_TOLERANCE = 1e-3` (`:18-19, 64`), and stores `unit = Float64Array.from(vector, x => x / norm)` (`:67`). Cosmos-Embed1 vectors are already L2-normalised (`:2-3`).
- Recompute triggers (DERIVED from `EmbeddingSimilarity.tsx:140-141`): `vectors` recomputes when the output's `version` changes (every arriving envelope), and `matrix` recomputes whenever `vectors` changes — so the O(n²·d) matrix is rebuilt per new window.
- Renderer: **Canvas 2D** (`EmbeddingSimilarity.tsx:49-81`): `cell = max(1, floor(320/n))`, canvas `cell·n` px square; the effect loops over all n² cells doing `ctx.fillStyle = sequentialColour(...)` (an `rgb(...)` string, `model.ts:146-152`) and `fillRect`, and reruns when the matrix, the reference window or the playhead window changes (deps at `:81`) — 160,000 string-colour `fillRect`s at n = 400 (DERIVED). For n ≥ 161, `cell` = 1 (DERIVED). Hover/click map pixels to (i, j) (`:82-92`).
- How windows are built: by the script, e.g. `video.windows({durationMs: 2000, strideMs: 2000})` → `windows.clips(zones, {key, frames: 8, everyMs: 250, inputPolicy: 'native-png'})` → `clips.embed({model: 'manuel-tulip/Cosmos-Embed1-224p'})` (`test/factory_tests/fixtures/w2/cycles-similarity-4-cycles.js:5-7`; op specs `kernels/catalog_w2.py:67-95`, 8 frames for Cosmos-224p at `:43`). The Lab's lattice is 8 s windows on a 4 s stride (`ttmp/2026/10/14/FACTORY-LAB-001--*/design-doc/02-how-the-classifier-lab-works-an-intern-s-guide-to-the-built-system.md:163-170`). Counts for the 46-min 09-21 recording (2,771,933 ms): 8 s/4 s lattice → **691** windows (MEASURED/stated in that doc at :169, :362; DERIVED `(2,771,933 − 8,000) // 4,000 + 1 = 691`); 2 s/2 s windows → **1,385** (DERIVED `2,771,933 // 2,000`; I found no recorded "1,385" in FV). Both exceed the 400 cap.
- Live UI store eviction: `window` scopes are among the evicted scope kinds of a bounded store (`web/live/store/runStore.ts:7-10`), so the matrix only ever sees retained windows.
- How embeddings reach the browser: as JSON `factory.result/1` envelopes (`web/live/api/types.ts:570-577`) with `values.kind === 'Embeddings'` and `values.vector` a JSON number array. History: `GET /api/runs/{runId}/outputs/{name}/envelopes?after=&limit=` (limit default 1000, max 5000; `src/factory_shots/live_ui/app.py:530-545,663`) → `EnvelopePage {envelopes, next, total, first?, complete}` (`types.ts:490-498`). Live: NATS over WebSocket (`@nats-io/nats-core` 3.4.0, `web/package.json`; `web/live/feed/NatsRunFeed.ts:1-30`, `natsHub.ts`), with HTTP polling when NATS is unavailable (`NatsRunFeed.ts:11-12`).
- Build tooling: Vite 8.2.1 and TypeScript 5.9.3 (root `package.json` devDependencies; `web/package.json`; installed versions confirmed in `web/node_modules/{typescript,vite}/package.json`), Vitest 4.1.11, React 19.2.8, `@vitejs/plugin-react` 6.1.1; `tsconfig` target/lib ES2022 + DOM (`web/tsconfig.json:3-4`); workers are ES modules (`web/vite.live.config.ts`, `worker: { format: 'es' }`). pnpm workspace includes `web` and `vendor/playback-ui/packages/*` (`pnpm-workspace.yaml`).
- WebGPU/WebGL: **none** in `web/live`, `web/grammar`, `web/report-public` or `vendor/playback-ui` (grep for `navigator.gpu`, `GPUDevice`, `requestAdapter`, `webgl`, `WebGL`). All canvases use `getContext('2d')` (`EmbeddingSimilarity.tsx:59`, `stage/embedding/EmbeddingMapPanel.tsx:177`, `views/frame/VideoBase.tsx:49`, `stage/media.ts:139`). Web Workers exist: the t-SNE worker (`stage/embedding/client.ts:28`) and the editor's TS worker via Comlink (`editor/ts/client.ts:30`).
- `cache/embeddings/*/matrix.npz` (MEASURED with `np.load`, this session): these hold **shot vectors (N×D, float32, unit rows), not N×N matrices**, for the YouTube factory-video corpus (15 source videos), written 2026-09-16…21 by the v1 shot-embedding pipeline. Next to each is `manifest.json` (model id, dimension, dtype, device, pooling, sample_count, ffmpeg version, source videos); some dirs also have `vectors/<video>_<shot>-shot.npz` and `frames/`.

| Directory | `vectors` | `subjects` | `count` | Model (manifest) |
|---|---|---|---|---|
| `cosmos-embed1-nvidia-cosmos-embed1-224p-68f93f451b47` | (2297, 256) float32 | (2297,) `<U6`, `'01:1'`…`'15:3'` | 2297 | nvidia/Cosmos-Embed1-224p, clip pooling, 8 samples, cuda |
| `cosmos-embed1-nvidia-cosmos-embed1-448p-88b54d681ea9` | (2297, 768) float32 | (2297,) | 2297 | nvidia/Cosmos-Embed1-448p |
| `siglip2-google-siglip2-base-patch16-224-13520b576466` | (2297, 768) float32 | (2297,) | 2297 | google/siglip2-base-patch16-224, frame pooling |
| `hash-deterministic-hash-v1-929a11970b68` | (21, 64) float32 | (21,) | 21 | deterministic hash (test) |
| `hash-deterministic-hash-v1-d62b5e889f2f` | (1, 64) float32 | (1,) | 1 | deterministic hash (test) |
| `dinov3-timm-vit-small-patch16-dinov3.lvd1689m-04229e0bf650` | no `matrix.npz` | — | — | 384-d, manifest + `vectors/` only |

All rows have L2 norm 1.0000 (MEASURED). A 2297×2297 cosine matrix from these would be 2297·2296/2 = 2.64 M dot products (DERIVED).

### 8. t-SNE (`web/live/stage/embedding/project.ts`)

- Algorithm: unit-normalise → PCA to ≤ `MAX_PCA_DIMS = 50` by seeded subspace iteration (40 iterations, Gram or covariance whichever is smaller; `:50, 105-189`) → squared distances in PCA space → `jointProbabilities` (per-row binary search on precision, 64 iterations max, tolerance 1e-5, symmetrised `(Pij + Pji)/(2n)` floored at 1e-12; `:219-262`) → **exact** O(n²) t-SNE (`tsneStep`, Student-t kernel, van der Maaten gains 0.8/+0.2 with floor 0.01, momentum, mean re-centring; `:294-343`). Not Barnes-Hut. Memory: `P` and `num` are n×n Float64Array (`:289`), 5.12 MB each at n = 800 (DERIVED).
- Schedules (`tsneRun`, `:285-292`; header `:10-19`): cold = 500 iterations, early exaggeration 12 for 100, learning rate 100, momentum 0.5 → 0.8 at 250, init = PCA scaled to sd 1e-4; warm (≥10 shared points and ≥ half of the set) = 250 iterations, no exaggeration, lr 50, momentum switch at 50, new points at the softmax-weighted mean of 5 nearest shared points (τ 0.02); shift (2D↔3D) = 400 iterations. Snapshot every 25 iterations (`:52`). Perplexity: requested (view default **20**, range 2–100: `web/live/viewgrammar/embeddingMap.ts:171,218`), capped at `floor((n−1)/3)`, min 2 (`project.ts:213-216`). Other view defaults: window 300,000 ms, 3 dims, `minPoints` 24 (`embeddingMap.ts:171`); below `minPoints` it shows PCA (`project.ts:428-434`).
- n cap: `MAX_OPTIMISED = 800` (`:51`). Above it, `optimisedSubset` optimises the newest 400 plus an even sample of 400 older points; the rest are placed at the weighted mean of their 5 nearest optimised points (`:365-374, 474-485`).
- Runs off the main thread in a module Worker (`tsne.worker.ts:1-12`, `client.ts:28`) through a pump that time-slices the generator in 12 ms slices, newest request wins (`pump.ts:1-3,12-40`).
- MEASURED cost (EMB-DIARY:273; "a temporary vitest file, deleted", i.e. Node under vitest, not a browser; 256-d inputs): cold/warm 84/60 ms at 75 points, **731/511 ms at 400**, **2442/1291 ms at 800**; 150 points at 768-d 245/150 ms. Typical live size: "5 minutes at a 4 s stride is 75 windows" (EMB-DIARY:277).
- Determinism promise: stated only in the code comment `project.ts:6-7` ("the random numbers come from mulberry32 seeded by the draw list's `seed` (the oldest point's scope id), so the same points give the same layout in every browser"); the design doc asks for "seeded RNG (mulberry32 seeded by the first scope id)" (`ttmp/2026/10/04/FACTORY-FINALDEMO-001--*/design-doc/02-look-and-widgets-analysis.md:416,420`). How: `mulberry32(hashString(`${seed}:${n}:${dims}`))` (FNV-1a 32-bit hash; `project.ts:56-73, 407`), Box–Muller `gauss` (`:75-79`), all arithmetic in `Float64Array`, PCA component signs fixed (largest coordinate positive, `:181-184`), output snapshots as `Float32Array`. Caveats (DERIVED from the code; not tested anywhere I found): warm and shift layouts depend on the previous layout held in the `Projector` (`:380-382, 449-469`), and the pump interrupts a running layout when a newer request arrives, keeping "where it got to" (`project.ts:504-509`, `pump.ts:24-28`), which depends on wall-clock time slicing; and `Math.exp`/`Math.log`/`Math.cos` are implementation-approximated in ECMAScript, so cross-engine bit identity is not guaranteed even for cold runs (external spec fact, not verified here).

### 9. Data

- Golden clips `DATA/golden-clips/v1/` (ffprobe, MEASURED): 12 clips, all H.264 High, 1920×1080, yuv420p, 30/1 fps, `has_b_frames=2`, ~2.1–3.2 Mb/s.

| Clip | Duration | Frames |
|---|---|---|
| `bench-empty-{left,right}.mp4` | 50.000 s | 1500 |
| `glue-apex-{left,right}.mp4` | 75.000 s | 2250 |
| `green-tag-{left,right}.mp4` | 46.933 s | 1408 |
| `marker-endcaps-{left,right}.mp4` | 75.000 s | 2250 |
| `marker-short-{left,right}.mp4` | 75.000 s | 2250 |
| `rotation-{left,right}.mp4` | 50.000 s | 1500 |

  Manifest `golden-clips-v1.json`: stream copies of whole closed 250-frame GOPs from `section-table-{left,right}_2026-09-21.mp4`, decoded frames verified bit-identical to the source range (framemd5); `source_ms = clip_ms + source_start_ms` (file head). `marker-short-left` = source 2,175,000–2,250,000 ms (`js-examples/guide/golden/zones/marker-short-left-zones.json:8`).
- Main sources `DATA/sources/` (ffprobe, MEASURED):

| File | Codec | Size | Duration | Frames | Size on disk |
|---|---|---|---|---|---|
| `section-table-{left,right}_2026-09-15_1050-1110BST.mp4` | H.264 Main, `has_b_frames=0` | **3840×2160** | 1201.21 / 1200.87 s | `nb_frames` N/A; avg fps 811710000/27027233 and 405742500/13509749 ≈ 30.033 → 36,076 / 36,066 (DERIVED) | 997 MB / 1,022 MB |
| `section-table-{left,right}_2026-09-21.mp4` (the "46-min main recording") | H.264 High, B-frames | 1920×1080 | 2771.933 s | 83,158 | 788 / 913 MB |
| `section-table-{left,right}_2026-09-23_1st.mp4` | H.264 High | 1920×1080 | 2006.03 s | 60,181 | 588 / 775 MB |
| `section-table-{left,right}_2026-09-23_2nd.mp4` | H.264 High | 1920×1080 | 3540.03 s | 106,201 | 994 / 1,315 MB |

  Also present (not probed): `sources/cycles-dataset/` (`joined/cycle_{0..5}.mp4`, `cycles_0-3.mp4`, `VideoDataset/Cycles/`), `sources/tec/demo-station-*.mp4` (3 files), `sources/screen-recordings/*.mov`. Per-frame RGB sizes: 6.2 MB at 1080p, 24.9 MB at 4K (DERIVED, W·H·3).
- Zones for section-table: Zones JSON (`kind: "Zones"`, `schemaVersion`, `sourceSha256`, `width`/`height` in source pixels, `zones[] {key, title, box {x0,y0,x1,y1}, validMs?}`). Whole-recording zones: `ttmp/2026/09/25/JS-DOCS-EXPERIMENT-003--*/sources/zones/{left,right}-zones.json`; golden-clip copies with the same boxes: `js-examples/guide/golden/zones/<clip>-{left,right}-zones.json` (12 files). **Left: 3 zones** — `bench` (380,100,1100,900), `endA` (430,300,1060,820), `endB` (620,90,1100,440) (`marker-short-left-zones.json:9-41`). **Right: 4 zones** — `bench` (60,380,1920,1080), `endA` (40,330,760,1000), `endB` (860,480,1920,1080), `trays` (600,780,1400,1080). No `validMs`. At `decodeWidth` 480 (×0.25) they become (DERIVED with `decode_geometry`): left bench (95,25,275,225) 36,000 px, endA (107,75,265,205) 20,540 px, endB (155,22,275,110) 10,560 px; right bench (15,95,480,270) 81,375 px, endA (10,82,190,250) 30,240 px, endB (215,120,480,270) 39,750 px, trays (150,195,350,270) 15,000 px. None hits a .5 in the far-edge rounding. `bench` contains `endA` on the left, so boxes overlap.

### 10. Against the three prior beliefs

- **(a) "gray + diff = pointwise ops, a resample, per-zone reductions."** Holds, with specifics a kernel must match: the colour op is an exact 15-bit fixed-point integer formula (§1.2); the resample is Pillow's antialiased bicubic run as **two 1-D passes with a uint8 round/clip between them** and 22-bit integer taps (≤17 taps at 4×, ≤33 at 8×), not a generic bicubic; the diff is a **scan** (state = previous selected int16 frame; gaps keep it), not a pure pointwise op over a frame pair; per-zone means are over possibly overlapping, time-gated boxes with truncate/round-half-even edges; and the window step needs `np.percentile(…, 90)` (an order statistic with linear interpolation), not only sums. Today's code also computes the abs-diff over the whole 480×270 frame before slicing.
- **(b) "A second implementation can be registered without runtime changes."** True for the runtime (session and lanes key on `implementation_id`/`resource`), but **not** without touching existing registrations or the compiler: `cpu.motion_gray` has no requirements and accepts everything, and the compiler refuses any node with two resolving implementations (`AMBIGUOUS_IMPLEMENTATION`, no preference order). Disjointness needs an edit to the CPU spec, a new op param (an `OperationSpec` change that alters node keys), or a new `Requirement` plus `default_available`. `ImplementationSpec.version` is unused, and `node_key`/`logical_hash` do not change when the implementation does (only `execution_fingerprint`).
- **(c) "The similarity matrix is a Float64 JS N×N cosine loop capped at 400."** Correct: `Float64Array(n·n)`, upper triangle of dot products of pre-normalised Float64 unit vectors, mirrored, diagonal set to 1, the most recent 400 windows kept. Two additions: it is recomputed on every arriving window envelope, and the Canvas-2D renderer repaints all n² cells with string colours whenever the playhead crosses a window. Separately, the `cache/embeddings/*/matrix.npz` files are N×D shot-vector tables, not similarity matrices.
