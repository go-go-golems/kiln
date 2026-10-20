---
Title: Investigation diary
Ticket: KILN-002
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - compiler
    - evidence
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: 'Chronological diary for KILN-002: choosing real workloads for Kiln and Perf Lab, the research behind them, and the intern guide.'
LastUpdated: 2026-10-20T11:06:14.12733-04:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Goal

Record, in order, how KILN-002 was produced: which real workloads were considered for Kiln and Perf Lab, what was
read and run to judge them, what failed, and why each decision was taken. Research agents keep their own diaries at
the top of their notes under `sources/`, linked from the step that launched them.

## Step 1: Survey candidate workloads and open the ticket

KILN-001 ended with a unified workbench that reproduces Perf Lab's verdicts on imported data, but with no kernel that
Kiln generated and Perf Lab measured. The conversation that led here asked how PR 1005 (Grounding DINO acceleration)
could link the two systems, then asked for other concrete workloads. Two read-only surveys, one over Playback and
one over the factory-videos repository, produced a ranked list; this ticket turns that list into a guide.

### Prompt Context

**User prompt (verbatim), the question that started the survey:** "Ok, any other concrete real life examples you
could use from either playback or maybe more importantly from ~/code/tulip/experiments/2026-09-14--factory-videos we
could use to tie it all into something concretely usable?"

**User prompt (verbatim), this ticket:** "Ok, create a detailed new docmgr ticket for bringing kilm / perf-labinto
the real work with concrete examples and kernels. Create a detailed analysis / design / implementation guide that is
for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and
bullet points and pseudocode and diagrams and api references and file references. It should be very clear and
technical. Store in the ticket and upload to remarkable."

**Assistant interpretation:** Open KILN-002 in the Kiln repository, research the candidate workloads to file-and-line
precision, and write an intern-level analysis, design and implementation guide for the first real kernels; upload it.

**Inferred user intent:** Turn Kiln and Perf Lab from a workbench that re-reads old evidence into a tool that produces
a kernel someone uses, with a plan concrete enough to start implementing.

### What I did

- Read the factory runtime's kernel registration seam: `src/factory/kernels/motion.py:451-461` registers each CPU
  kernel through `_cpu(implementation_id, operation, factory)`, and `src/factory/kernels/hands.py:236-252` registers
  two implementations of one operation (`modelsvc.hands_classify`, `fake.hands_classify`) chosen by `accepts(params)`.
- Confirmed Kiln's targets: `packages/kiln/src/std/targets.js:5-14` lists five CUDA device specs and `WEBGPU_DEFAULT`;
  `apps/server/src/executors/cuda-runner.ts` is the CUDA execution path.
- Created the ticket: `docmgr ticket create --ticket KILN-002 ...`, then the design doc and this diary with
  `docmgr doc add`.
- Launched three read-only research agents, each writing one notes file with its own diary:
  `sources/01-factory-videos-research.md`, `sources/02-kiln-and-perf-lab-research.md`,
  `sources/03-playback-research.md`.

### Why

The survey's numbers came from summaries. A guide that tells an intern to edit `motion.py:185` has to be right about
line 185, so every claim is re-derived from the source by agents that only read.

### What worked

- The registry precedent in `hands.py` means a Kiln implementation needs no runtime change, only a registration and a
  parameter that selects it.

### What didn't work

- `grep -rn ... --include=*.py` failed under zsh with `(eval):1: no matches found: --include=*.py` because the glob
  was unquoted; quoting the path and dropping the flag worked.

### What I learned

- Kiln emits two languages, CUDA and WGSL. Only WGSL has run on real hardware (WebGPU in the browser); the CUDA runner
  has not run on an NVIDIA device. That ordering decides which example goes first.

### What was tricky to build

- Nothing built yet.

### What warrants a second pair of eyes

- The ranking puts the browser similarity matrix first because it can run without remote access, not because it is
  the most valuable kernel. Redaction post-processing is worth more but needs a Kiln feature first.

### What should be done in the future

- Merge the three research notes into the guide; verify each number against its source line.

### Code review instructions

- Start with `sources/*.md`; each fact there carries a `path:line`.

### Technical details

- Ticket path: `ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/`.

## Step 2: Research the three consumers and write the guide

Three read-only agents re-derived every claim of the survey from source, each writing a notes file with its own
diary. Their findings corrected two things I had told the user, changed the shape of two examples, and produced the
facts the guide is built on. The guide (30 sections, 1,354 lines) was then written, assembled from four drafts, and
uploaded to reMarkable.

### Prompt Context

**User prompt (verbatim):** see Step 1 (this ticket's request).

**Mid-step user message (verbatim):** "when done, implement, btw commit at appropriate intervals and keep a detailed
diary as you work
    (using the diary format from the skill).

When done, write a detailed report about each one, the results you got, the work done, in much much detail. Take
screenshots appropriately as well"

**Assistant interpretation:** After the guide is uploaded, implement its phases, commit at milestones, keep this
diary in the skill's investigation format, take screenshots, and finish with a detailed report per example.

**Inferred user intent:** The guide is a plan to execute, not an end in itself.

### What I did

- Read all three notes in full: `sources/01-factory-videos-research.md` (283 lines),
  `sources/02-kiln-and-perf-lab-research.md` (752 lines), `sources/03-playback-research.md` (555 lines).
- Verified two compiler facts myself: index maps floor-divide by constants (`packages/kiln/src/core/ix.js:78-87`),
  and the script-scope helper is lowercase `ix` with `ix.c`, `ix.min`, `ix.max` (`core/ix.js:112-118`), not `IX`.
- Read the WebGPU executor and WGSL emitter to fix the launcher contract: dispatch `gx = min(grid, 65535)`,
  `gy = ceil(grid / 65535)` (`std/devices.js:139`); the WGSL folds the block index the same way (`std/emit.js:62-63`).
- Wrote Part I directly into the design doc; drafted Parts II–IV, V–VI and VII–VIII in the scratchpad and assembled
  them with a Python script that also fixed cross-references (§24 → §23, §25 → §24, §29 → §28) and listed headings.
- Added 23 docmgr tasks (one per phase task), the index overview, related files and a changelog entry.
- Uploaded: `remarquee upload bundle design-doc/01-….md --name "KILN-002 Kiln and Perf Lab on Real Work - Intern Guide"
  --remote-dir "/ai/2026/10/20/KILN-002" --toc-depth 2 --non-interactive` → `OK: uploaded … -> /ai/2026/10/20/KILN-002`.

### Why

- Each example's design depends on facts only the consumer's source can give: the exact grey formula, whether a
  second implementation can be registered, where the redaction GPU slot is released.

### What worked

- The redaction notes confirmed the per-detection CPU loop after slot release (`trt_engine.py:764-773`) and the
  numbers in `docs/vision/redaction-performance.md`, including the RTX occupied `infer_post` of 2.87 ms out of 9.02 ms.
- The factory notes include an exhaustively verified grey formula, `(9798R + 19235G + 3735B + 16384) >> 15`, and a
  25-line Pillow resampler that is bit-identical to Pillow on twelve size pairs.

### What didn't work

- My survey answer had claimed redaction's nearest resize "needs floor-affine indexing, which Kiln lacks". Wrong:
  `ix` already floor-divides by constants. The guide says so (§18) and Example C needs no indexing feature.
- My survey answer had said a Kiln implementation "plugs in next to `cpu.motion_gray`" with no runtime change. Half
  wrong: the runtime needs none, but the compiler refuses two resolving implementations
  (`compiler/lower.py:477-506`, `AMBIGUOUS_IMPLEMENTATION`) and `cpu.motion_gray` accepts everything. The guide chooses
  an optional `backend` parameter (§15).
- The "mean |Δ| 0.013 parity budget" is not a test; it is the result of the experiment that chose the grey
  conversion (W8C diary :181). The guide's gate for B is written in the same terms so the numbers compare.
- The `cache/embeddings/*/matrix.npz` files are shot vectors (2297 × 256/768), not similarity matrices. They are still
  usable as test inputs for Example A.

### What I learned

- The similarity view rebuilds the full matrix on every arriving window (`EmbeddingSimilarity.tsx:140-141`). The
  live case is fixed by an O(n·d) incremental row in plain TypeScript; the Kiln kernel's real job is the full rebuild
  when a finished run opens. The guide's §8 states this, following the problem-restatement test.
- Kiln's export has no host wrapper and one output per kernel; consumers need a program-level export and launchers.
  That became P0.3–P0.5.
- The YOLOX element sizes its TensorRT batch and D2H copy by the configured batch size, not the filled frames
  (`gstyoloxinfer.cpp:371,397`) — a defect independent of Kiln, recorded in §22.

### What was tricky to build

- Pillow's window start for output column x at ratio 4 is `max(int(4x − 5.5), 0)`; `int()` truncates toward zero,
  so x = 0 and x = 1 both give 0, which `max(4x − 6, 0)` reproduces. For non-integer ratios the start is a floor of an
  affine rational expression, still an index map.

### What warrants a second pair of eyes

- The Pillow rounding estimate in §14 (a few dozen pixels per frame differing by one level) is DERIVED, not measured;
  B3 measures it.
- The claim that floor division matches OpenCV's double-precision nearest mapping for 640/768 and 347/416 is argued,
  not tested; C2 tests every pixel.

### What should be done in the future

- Implement P0, then A, B1, B2–B5 if B1 supports it, C1–C3; ask for permission before PN and C4.

### Code review instructions

- Read the guide's §4 (the loop), §6 (what Kiln can express), then one example part end to end.

### Technical details

- Guide: `design-doc/01-kiln-and-perf-lab-on-real-work-intern-guide-to-the-first-production-kernels.md`.
- Upload destination: `/ai/2026/10/20/KILN-002/KILN-002 Kiln and Perf Lab on Real Work - Intern Guide.pdf`.

## Step 3: P0 groundwork — floor, u8 inputs, the program export and two launchers

This step built the four pieces that every example depends on: a `floor` function, 8-bit kernel inputs, an export
format a consumer can load (`kiln-program/1`), and launchers for that format in TypeScript (WebGPU) and Python
(`wgpu` and CUDA). Both launchers pass five round-trip cases on the M1 Pro, including a u8 grey conversion that is
bit-exact against the integer formula factory-videos uses. The CUDA backend is written but has not run, because no
NVIDIA device is reachable without the user's permission.

Two commits: `f272c11` (P0.1–P0.2) and `aa0f0b4` (P0.3–P0.6), both in `/Volumes/SSD/code/kiln`.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the ticket request) and Step 2 (the mid-step "when done, implement" message).

**Mid-step user action:** I tried to run the whole workspace suite with `pnpm test`; the user rejected that tool call
and then wrote "continue". I took that as "not the workspace-wide run" and ran the compiler package's eleven test
files individually instead (all passed). The workspace run has not been repeated.

**Assistant interpretation:** Implement P0 of guide §26 in the Kiln repo, commit at milestones, record evidence here.

**Inferred user intent:** Get to the examples quickly; groundwork should be small and tested, not elaborate.

### What I did

- **P0.1 `floor`.** One entry in `KS/std/fns.js` (`Math.floor` / `floorf` / `floor`), `N.floor` in
  `KS/std/tensor.js`.
- **P0.2 u8 inputs.** The authoring call is the existing dtype argument, `k.tensor(shape, "u8")` (`KS/core/kiln.js:9`),
  not the `{dtype: "u8"}` object the guide shows. The dtype is carried as `inDtypes` on `tile.kernel`, `kernel.kernel`
  and `gpu.kernel` and in `programOf`'s record. Changes:
  - `KS/core/util.js`: `inKey(shape, dtype)` appends `:u8` only for non-f32, `dtypeBytes(dtype)`.
  - Identity in all four places (`tile.js`, `kernel.js`, `program.js` ×2) uses `inKey`.
  - `KS/std/emit.js`: CUDA declares `const unsigned char* __restrict__ srcN` and casts loads with `(float)`; WGSL binds
    `array<u32>` and reads through a generated `fn ldN(j: i32) -> f32` that extracts byte `j & 3` of word `j >> 2`.
  - `KS/std/devices.js`: the WebGPU executor uploads u8 inputs as one byte per element padded to words; `bundle()`
    carries each input's dtype.
  - `program.js`: seeded u8 inputs are whole numbers 0..255; `bytes` counts one byte per u8 element.
  - `runner/kiln_runner.py` refuses u8 inputs per kernel with a clear error (its C harness generates floats only).
- **P0.3 export.** `KS/std/export.js` (`exportProgram`, `exportedName`, `PROGRAM_FORMAT`) and the CLI
  `scripts/kiln-export.mjs` (`--preset | --script`, `--param`, `--target`, `--out`, `--no-check`), which runs the
  workbench's own `compileScript` and `endToEnd` so a CLI export is checked by the same rule as the page.
- **P0.4 TypeScript launcher.** `runtime/webgpu/launch.ts`: `KilnWebGpuProgram.create(device, program)` compiles
  every kernel and allocates every buffer; `write`, `encode`, `run`, `buffer`, `destroy`; `unsupportedReason` checks
  workgroup size, workgroup memory, dispatch size, storage-buffer count and binding size before anything runs.
- **P0.5 Python launcher.** `runtime/python/kiln_launch.py`: `open_program(path, backend="wgpu"|"cuda")`;
  `WgpuProgram` (wgpu 0.32); `CudaProgram` (NVRTC → CUBIN for `sm_XY`, PTX for `compute_XY` as fallback; driver API;
  `launch(stream, **pointers)` on caller-owned device pointers for PyTorch interop); `check <fixtures>` CLI.
- **P0.6 identity suffix.** Exported kernels are named `<emitted name>__<identity>` and the CUDA entry symbol is
  renamed to match; the workbench's emitters are untouched (see Why).
- **Tests.** `packages/kiln/test/u8.mjs` (16 checks) and `packages/kiln/test/export.mjs` (24 checks) in the regular
  suite; `runtime/test/fixtures.mjs` + `runtime/test/webgpu-roundtrip.mjs` + `kiln_launch.py check` for the GPUs.
- Python environment: `uv venv --python 3.11 /Volumes/SSD/venvs/kiln-launch`, then `uv pip install wgpu numpy`
  (wgpu 0.32.0, numpy 2.4.6), cache at `/Volumes/SSD/.uv-cache`.

### Why

- **Identity unchanged for fp32.** Identities are content addresses already stored in evidence records. Appending the
  dtype only when it is not f32 keeps every existing identity byte-identical while giving u8 kernels distinct ones.
- **Suffix in the export, not the emitters.** Renaming the symbol in `toCuda` would change every stored CUDA source
  and therefore its `sourceSha256`, invalidating KILN-001 records for no gain. The export is the only place a symbol
  leaves Kiln, so it is the only place the suffix is needed.
- **The full identity, not eight hex digits.** Kiln's `hash` is base 36 (`307lrilpsx`), not hex, and ten or eleven
  characters is short enough for a symbol. A prefix would add a collision case for no benefit.
- **Fixture inputs from a formula.** `h = (i·2654435761 + s·40503) mod 2³²` is integer-exact in JavaScript and NumPy,
  so the browser, Python and Node agree on 16.8 million inputs without shipping 67 MB files.

### What worked

- fp32 identities before and after, from a `git archive HEAD` copy at `/Volumes/SSD/tmp/kiln-head`: byte-identical
  (`cmp` of two JSON dumps). They are the golden values in `u8.mjs`:
  softmax `307lrilpsx`, blur `gtseq05iy8`, attention `160ckx28ec8 ylusrrd178 typboubdt0`, layernorm `1a6noxftb1k`.
- The grey program compiles to one fused kernel (`k_reshape_ew`, 64 threads); frontend and loop-level evaluation equal
  `(9798R+19235G+3735B+16384)>>15` on all 3,072 test pixels including (255,255,255) and (254,255,253).
- Compiler package tests, run file by file: core, evidence, hypotheses, paired, progs, protocol, stack1–3, tune, u8 —
  all exit 0, no `FAIL`/`MISMATCH` lines; then export.mjs, 24/24.
- WebGPU round trip, headless Chrome on the M1 Pro (`node runtime/test/webgpu-roundtrip.mjs --fixtures …`):

  | Case          | Kernels | Values compared | max abs error | First run | Second run |
  | ------------- | ------: | --------------: | ------------: | --------: | ---------: |
  | attention     | 3       | 1,024           | 8.94e-8       | 6.8 ms    | 1.4 ms     |
  | blur-2d-grid  | 1       | 4,096 sampled   | 0             | 87.7 ms   | 44.9 ms    |
  | blur-small    | 1       | 6,144           | 0             | 1.8 ms    | 0.6 ms     |
  | grey-u8       | 1       | 3,072           | 0             | 0.6 ms    | 0.3 ms     |
  | mlp           | 2       | 1,024           | 2.38e-7       | 2.0 ms    | 0.6 ms     |

  Plus: an export with a 1,048,576-thread workgroup is refused with "threads per workgroup exceeds the device's 256".
- Python `wgpu` backend on Metal (`kiln_launch.py check … --backend wgpu`): the same five cases, same error maxima;
  second runs 1.6–1.8 ms for the small cases, 54.4 ms for the 16.8M-element blur.
- The export CLI on W-12 at 64×96: one kernel `k_slice_ew__1eofyogxcaz`, end-to-end check "ok at loop".

### What didn't work

- My first export test called `N.weight("w", [8, 4])` outside `k.trace`:
  `KilnError [ScopeError]: tensor.const(…) builds a node, so call it inside k.graph(…), k.trace(…) or a rule's rewrite`.
  Weights are graph nodes; moved the call inside the traced function.
- A broad `grep -n … apps/workbench/src/ui/wb.js` matched the generated preset bundle and returned 316 KB; generated
  files (`*.gen.js`) have single lines of tens of kilobytes and must be excluded from searches.
- On the Mac, `open_program(..., backend="cuda")` fails as intended:
  `OSError: none of libcuda.so.1, libcuda.so, nvcuda.dll could be loaded; set KILN_LIBCUDA to the library's path`.

### What I learned

- A WGSL u8 load costs an extra shift and mask per element, but halves nothing else: the grey kernel's traffic falls
  from 49,152 + 12,288 bytes (fp32 input) to 9,216 + 12,288 bytes for the 48×64 test, which is the point of P0.2.
- Kernel names come from the ops a kernel fuses (`k_reshape_ew`, `k_slice_ew`, `k_matmul_ew_softmax_reduce`), so
  two programs can share a name; the identity suffix is what makes a symbol unique.
- The index expressions Kiln emits are not simplified (`((e % 64) % 64)` in the grey kernel); the GPU compilers fold
  them, but they make the sources harder to read in a review.
- wgpu-py's `request_device_sync()` exposes the adapter's maximum limits (1,024 invocations, 4 GiB bindings on the
  M1 Pro), while Chrome's `requestDevice()` gives the WebGPU defaults (256 invocations) unless limits are requested.

### What was tricky to build

- **Dispatch past 65,535 workgroups.** The 4096×4096 blur needs 131,072 workgroups; `dispatch` is `[65535, 3, 1]`
  because 65,535 × 2 = 131,070 is two short. The WGSL already computes `bid = wid.x + wid.y·nwg.x` and returns for
  `bid ≥ grid`, so the 65,533 surplus workgroups exit at once. The fixture exists to prove that path.
- **Error scopes in `create`.** A pipeline compile failure rejects `Promise.all`, which would skip `popErrorScope` and
  leave scopes pushed on a device the caller keeps. `create` now catches, pops both scopes on every path, destroys
  the buffers it made, and reports whichever error came first.
- **CUDA context sharing.** In Playback the launcher runs inside a process where PyTorch already owns a context. The
  backend uses the current context when there is one and otherwise retains the primary context (the one the CUDA
  runtime uses), so `tensor.data_ptr()` values are valid for `launch()` either way.

### What warrants a second pair of eyes

- `CudaProgram` (`runtime/python/kiln_launch.py`) is untested: argument types of `cuLaunchKernel`, the NVRTC CUBIN/PTX
  fallback, and library discovery inside the Playback image (`libnvrtc.so.13` from CUDA 13.2) all need PN.
- `exportProgram` treats any `tensor.const` with data as an uploadable constant; a splat constant (no data) reaching a
  kernel argument would be reported as unsupported rather than folded. No preset produced one.

### What should be done in the future

- Run `kiln_launch.py check <fixtures> --backend cuda` on the Spark and an RTX host in PN.
- Teach `kiln_runner.py` to generate u8 inputs so a u8 kernel can be measured by the existing CUDA path.
- Update the guide: `k.tensor(shape, "u8")`, full-identity suffix, the export's extra fields (`target`, `source`,
  `dispatch`, `shape`, `inShapes`, `inDtypes`, buffer `bytes`).

### Code review instructions

- Start at `packages/kiln/src/std/export.js`, then `runtime/webgpu/launch.ts`, then `runtime/python/kiln_launch.py`.
- Validate: `node packages/kiln/test/u8.mjs && node packages/kiln/test/export.mjs`;
  `node runtime/test/fixtures.mjs /tmp/f && node runtime/test/webgpu-roundtrip.mjs --fixtures /tmp/f`;
  `/Volumes/SSD/venvs/kiln-launch/bin/python runtime/python/kiln_launch.py check /tmp/f --backend wgpu`.

### Technical details

Generated grey kernel (CUDA, before the export renames it):

```c
extern "C" __global__ void __launch_bounds__(64) k_reshape_ew(const unsigned char* __restrict__ src0, float* __restrict__ dst) {
    ...
        in0 = (float)src0[(((192 * ((((e % 64) + (64 * (e / 64))) / 64) % 48)) + (3 * ((e % 64) % 64))) + 2)];
        v0 = (19235.0f * in2);  v1 = fmaf(in1, 9798.0f, v0);  v2 = fmaf(in0, 3735.0f, v1);
        v3 = (16384.0f + v2);   v4 = (0.000030517578125f * v3); v5 = floorf(v4);
```

The same kernel's WGSL unpack function:

```wgsl
@group(0) @binding(0) var<storage, read> b0: array<u32>;
fn ld0(j: i32) -> f32 { let u = u32(j); return f32((b0[u >> 2u] >> ((u & 3u) * 8u)) & 0xffu); }
```

## Step 4: Example A — the similarity matrix on the GPU in factory-videos (A1–A4)

Example A is done on the Mac. Today's TypeScript builds the similarity matrix at a flat 1.0 G multiply-adds per
second, and its `fillRect` painter costs more than the build at every size. The W-26 kernel, launched from committed
Kiln programs through the vendored WebGPU launcher, takes 0.024–0.029 times as long at 1,385 windows × 768 dims;
with a new `ImageData` painter, a 2,297-window run is computed and painted in 76–79 ms. Both hypotheses of guide §11
are supported and the quality gate passes. The view now shows a whole 46-minute run on a WebGPU browser and falls
back to its old 400-window view without one.

Commits: Kiln `846282e` (W-26, program sets, harness, A1 data), `293884c` (launcher byte helpers return `Uint8Array<ArrayBuffer>`, see below);
factory-videos `3bc92785` on branch `FACTORY-KILN-001--gpu-kernels` in the worktree
`/Volumes/SSD/code/factory-videos-kiln` (symlinked as `~/code/tulip/experiments/2026-09-14--factory-videos-kiln`).

### Prompt Context

**User prompt (verbatim):** see Step 1 and Step 2.

**Assistant interpretation:** Execute Phase A of guide §26 (A1 baseline, A2 preset and exports, A3 integration,
A4 paired measurement, gate, record, screenshots) on the Mac.

**Inferred user intent:** A real consumer change with numbers that justify it, not a demo.

### What I did

- **Worktree.** `git worktree add -b FACTORY-KILN-001--gpu-kernels /Volumes/SSD/code/factory-videos-kiln main`
  (main at `7623e4bc`). The `vendor/playback-ui` submodule was uninitialised; my first `pnpm install` had created
  empty `node_modules` folders in its place (0 tracked files), which I removed before
  `git submodule update --init --reference <main checkout>/.git/modules/vendor/playback-ui`. Then
  `pnpm install --frozen-lockfile` and `pnpm build:ui` (the `@playback-ui/*` packages resolve to `dist/`).
- **Test vectors.** From `FV/cache/embeddings/*/matrix.npz` with FV's venv: 2,297 × 256 (Cosmos-Embed1 224p),
  2,297 × 768 (Cosmos-Embed1 448p) and 2,297 × 768 (SigLIP2), all unit length (norms 0.9999999–1.0000001), written as
  raw fp32 to `/Volumes/SSD/tmp/kiln-002/vectors/`.
- **A1 harness** `scripts/similarity-bench.mjs`: esbuild bundles FV's own `model.ts` (and, for later modes,
  `similarityGpu.ts` and `paint.ts`) from the checkout; a local HTTP server serves the page and the vectors; headless
  Chrome with WebGPU runs it. Modes: `baseline`, `paired`, `gate`, `shot`.
- **A2** `apps/workbench/presets/W-26-window-similarity.{js,md}`: `S = matmul(x, transpose(x, 0, 1))`, params
  `windows ∈ {256, 512, 1024, 1536, 2048, 2304}`, `dims ∈ {256, 768}`. `kiln-export.mjs` gained comma-separated
  `--param` values, which compile every combination into a `kiln-program-set/1`.
- **A3** in FV `web/live/views/similarity/`:
  - `kiln/window-similarity.json` (twelve programs, 422 KB) and `kiln/launch.ts` (vendored), `kiln/README.md`.
  - `similarityGpu.ts`: `bucketFor`, `packRows`, `readBlock`, `gpuAvailable`, `similarityMatrixGpu`.
  - `model.ts`: `similarityMatrix(all, cap, previous)` reuses cells of windows already present with equal vectors.
  - `paint.ts`: `matrixPixels` / `paintMatrix`, one `putImageData`, exact `sequentialColour` colours, one 32-bit store
    per pixel.
  - `useSimilarityMatrix.ts`: CPU matrix (incremental, cap 400) always; GPU matrix when available and n > 400.
  - `EmbeddingSimilarity.tsx`: uses the hook and painter; canvas drawn at one pixel per window, shown at most 560 px
    wide with hover mapped through the scale; `data-engine` attribute.
  - `@webgpu/types@0.1.74` (exact, published 2026-09-19) and `"@webgpu/types"` in `tsconfig.json`'s `types`.
  - `similarityGpu.test.ts`: 10 tests (buckets, the committed set's names and identities, packing, block read-back,
    jsdom has no GPU, incremental equality in three cases, painter colours and cell blocks).
- **A4**: `paired` run (9 pairs, 5 at n = 2,297, seeded coin order, seed 2), `gate` run with the exact painted colour,
  `scripts/kiln-paired.mjs` writing twelve `kiln-paired/1` records and `various/a4/records/verdicts.json`, and
  `scripts/similarity-view-shot.mjs`, which mounts the real `EmbeddingSimilarity` component on a 1,385-window store.

### Why

- **GPU only above 400 windows.** Below the old cap the CPU path is already incremental and synchronous; the GPU is
  needed exactly where the CPU would leave windows out, so the view does not flicker for small runs.
- **The CPU matrix is always computed.** It is available synchronously, so a large run shows its 400 most recent
  windows at once and the full GPU matrix replaces it when it resolves; a GPU failure leaves it in place.
- **A stale GPU result is shown only for the same run.** `belongsTo` checks that every window of the GPU result is
  still present: during live growth the previous result stays up until the new one arrives; a different run never
  shows another's matrix.
- **The painter changed in the same change** because A1 showed it was the larger cost: a fast matrix painted with
  1.9 million `fillRect` calls would still take 1.2 s.

### What worked

A1, `various/a1/baseline-m1pro.json` (headless Chrome 155 on the M1 Pro; medians):

| n     | d   | similarityMatrix | G mul-add/s | fillRect paint |
| ----: | --: | ---------------: | ----------: | -------------: |
| 400   | 256 | 20.3 ms          | 1.01        | 108.6 ms       |
| 691   | 256 | 58.0 ms          | 1.05        | 304.9 ms       |
| 1,385 | 256 | 240.8 ms         | 1.02        | 1,245.9 ms     |
| 2,297 | 256 | 648.5 ms         | 1.04        | 3,366.3 ms     |
| 400   | 768 | 59.7 ms          | 1.03        | 107.6 ms       |
| 691   | 768 | 180.2 ms         | 1.02        | 304.4 ms       |
| 1,385 | 768 | 723.7 ms         | 1.02        | 1,198.3 ms     |
| 2,297 | 768 | 2,010.2 ms       | 1.01        | 3,351.5 ms     |

A4, `various/a4/paired-m1pro-v2.json` (final painter), Cosmos vectors:

| n     | d   | CPU      | GPU      | GPU/CPU [95 % CI]          | ImageData paint | GPU + paint |
| ----: | --: | -------: | -------: | -------------------------- | --------------: | ----------: |
| 400   | 256 | 20.1 ms  | 2.6 ms   | 0.124 [0.027, 0.131]       | 2.2 ms          | 4.3 ms      |
| 691   | 256 | 59.7 ms  | 6.0 ms   | 0.101 [0.091, 0.110]       | 3.7 ms          | 9.2 ms      |
| 1,385 | 256 | 245.5 ms | 13.3 ms  | 0.054 [0.047, 0.055]       | 13.1 ms         | 26.3 ms     |
| 2,297 | 256 | 678.7 ms | 32.2 ms  | 0.047 [0.046, 0.048]       | 34.3 ms         | 66.9 ms     |
| 400   | 768 | 60.6 ms  | 3.8 ms   | 0.063 [0.060, 0.073]       | 1.5 ms          | 5.9 ms      |
| 691   | 768 | 181.7 ms | 10.0 ms  | 0.055 [0.049, 0.059]       | 3.9 ms          | 14.0 ms     |
| 1,385 | 768 | 734.0 ms | 20.7 ms  | 0.029 [0.024, 0.031]       | 12.9 ms         | 35.6 ms     |
| 2,297 | 768 | 2,025 ms | 42.9 ms  | 0.021 [0.017, 0.022]       | 34.8 ms         | 75.9 ms     |

SigLIP2 at 768: 0.065, 0.057, 0.024 [0.023, 0.028], 0.022 for the four sizes; GPU + paint 79.4 ms at 2,297.

Verdicts (`various/a4/records/verdicts.json`):

- `gpu-rebuild-1385` **supported**: upper CI ends 0.031 (Cosmos) and 0.028 (SigLIP2), both below 0.1.
- `cap-lift-interactive` **supported**: all ten samples at 2,297 × 768 below 100 ms (66.9–83.5 ms range in v2).
- Quality gate **pass**: max |Δ| between 8.2e-7 (256-d) and 2.2e-6 (SigLIP2 768-d), limit 1e-5; same colour step
  99.980–99.998 %; identical painted colour 99.960–99.997 % (`various/a4/gate-m1pro.json`). The two full 1,385 ×
  768 renders differ in 162 of 1,918,225 pixels, each by one level in one channel.

The view: with WebGPU `{"engine":"webgpu","n":1385,"canvas":"1385x1385","shown":"560px","badge":null}`; without an
adapter `{"engine":"cpu","n":400,"badge":"the 400 most recent windows; 985 older not shown"}`. FV web suite: 143
files, 1,123 tests pass; `tsc --noEmit` clean; the live build emits `window-similarity-*.js` as its own 407 KB
(38.6 KB gzip) chunk.

### What didn't work

- The first `paired` run (`paired-m1pro.json`, kept) used a painter with an inner per-pixel block loop: 53 ms at
  n = 2,297 and GPU + paint 94.4–98.8 ms, which met the 100 ms target by 1 %. Rewriting the store as one `Uint32Array`
  write per pixel (and no block loop for one-pixel cells) took the painter to 34.8 ms; v2 is the final measurement.
- FV typecheck after vendoring: `Cannot find name 'GPUDevice'` (no WebGPU types in TS 5.9's DOM lib), then
  `Argument of type 'Uint8Array<ArrayBufferLike>' is not assignable to parameter of type 'GPUAllowSharedBufferSource'`.
  Fixed in Kiln (helpers return `Uint8Array<ArrayBuffer>`) and re-vendored.
- `pnpm add -D @webgpu/types` in the fresh worktree failed first with `"@playback-ui/core@workspace:*" is in the
  dependencies but no package named "@playback-ui/core" is present in the workspace` (uninitialised submodule).
- The first view-screenshot bundle failed: `No loader is configured for ".jsonl" files: …/fixtures/results/cosmos/vectors.jsonl?raw`
  (Vite's `?raw` imports). The script now builds envelopes in the fixture's shape instead of importing the fixtures.

### What I learned

- The JavaScript dot-product loop is flat at 1.0 G multiply-adds per second from 20 M to 2 G operations, so its cost
  is exactly n(n−1)/2 · d / 10⁹ seconds on this machine.
- After the kernel, the next costs are host-side: reading back 21 MB at bucket 2,304, converting the n × n block to
  Float64, and painting 5.3 million pixels are together larger than the kernel (GPU 42.9 ms includes read-back; the
  painter adds 34.8 ms).
- The pnpm 12 lockfile rewrite on `pnpm add` collapsed two Storybook peer variants into one; it changes no package
  versions.

### What was tricky to build

- **Hover on a scaled canvas.** The canvas is drawn at one pixel per window and shown at up to 560 px, so the mouse
  position must be multiplied by `size / rect.width` before dividing by the cell size; otherwise hovering picks the
  wrong pair as soon as the matrix is scaled down.
- **Incremental update correctness.** Reuse is keyed on `scopeId` *and* equal vectors, because `windowVectors`
  rebuilds every `Float64Array` on each update (object identity never matches) and a re-delivered envelope could
  carry a different vector for the same scope. The test covers growth, a sliding cap and a changed vector.

### What warrants a second pair of eyes

- `useSimilarityMatrix` keeps the previous CPU matrix in a ref updated inside `useMemo`; under React StrictMode's
  double invocation the second call reuses the first's result, which is correct but unusual.
- The `cos to reference` lane renders axis labels but no visible line in both harness screenshots; the lane is
  unchanged by this work and the harness mounts the view outside the app shell, so I have not investigated it.

### What should be done in the future

- Read back only the n × n block (or compute min and max on the GPU) to cut the 21 MB read-back at bucket 2,304.
- PE: import `various/a4/records/*.json` into Perf Lab with `corresponds_to` edges to the W-26 identities.

### Code review instructions

- FV: `git -C /Volumes/SSD/code/factory-videos-kiln show 3bc92785 --stat`, then `similarityGpu.ts`,
  `useSimilarityMatrix.ts`, `paint.ts`, the `model.ts` diff, the `EmbeddingSimilarity.tsx` diff.
- Validate: `cd web && pnpm exec vitest run live/views/similarity && pnpm exec tsc --noEmit -p .`; then the harness
  commands in `scripts/similarity-bench.mjs --help` text with `--fv /Volumes/SSD/code/factory-videos-kiln`.

### Technical details

- W-26 kernels: buckets 256 and 512 use `MAP=tiled,BM=64,BN=32,BK=8,TM=2,TN=4` (3 KiB workgroup memory); 1,024 and up
  use `MAP=tiled,BM=128,BN=64,BK=8,TM=8,TN=4` (6 KiB). One input binding: the transpose is folded into the load's
  index map. Identities, e.g. 1,536 × 768 `1b608rph8j2`, 2,304 × 768 `1nbw2903hxh`.
- Screenshots: `various/screenshots/a3-view-1385-webgpu.png`, `a3-view-1385-cpu-fallback.png`,
  `a4-matrix-1385x768-cpu-vs-gpu.png` (left Float64 + fillRect, right GPU + ImageData). Full-size renders are in
  `/Volumes/SSD/tmp/kiln-002/screens/` and regenerate with `similarity-bench.mjs shot`.

## Step 5: Example B, B1 — where a zone-motion run spends its time on the Mac

B1 refutes `gray-is-worth-a-kernel`, so Example B stops here and B2–B5 are not built. In the configuration the
factory runtime ships, `motion.gray` adds up to 9.3 % of a motion run's session time on both golden clips, against the
20 % the guide set as the bar. It also runs on its own lane in parallel with a decoder that is busy for the whole
session: replacing `to_gray` with a function that costs nothing changes the session by −0.2 % and +0.7 %. The run's
time is the source's, and 90 % of the source's time is GStreamer's single-threaded `videoconvert` from NV12 to RGB,
not the hardware decode. Running that element on four threads makes the whole run 2.75× faster. That change belongs
to factory-videos, not to Kiln, and it alters 1.2 % of grey pixels by one level, so it needs its own qualification.

### Prompt Context

**User prompt (verbatim):** see Step 1 and Step 2.

**Assistant interpretation:** Execute guide §13 (B1) and apply its decision rule before writing any Example B kernel.

**Inferred user intent:** Kernels only where measurement says they pay; a refuted hypothesis is a result, not a gap.

### What I did

- A motion-only script, `output('motion', input('video').motion(input('zones'), {everyMs: 250, windowMs: 5000}))`, run
  through `factory.application.runs.offline_run` (one fresh `factory.worker` process per run, target `mac`, batch
  mode) on `marker-short-left.mp4` and `marker-short-right.mp4` (75 s, 1920×1080, 30 fps, 2,250 frames, 300 selected
  at 250 ms). The worktree's `src` on `PYTHONPATH` with the main checkout's venv (the worktree's Python is unchanged
  from main `7623e4bc`).
- Per run, from the run folder: `run/status.json` (`lane.perNode.<node>.serviceMs` n/p50/p95/max,
  `source.framesDecoded`, `source.fps`, the decode adapter), `run/phases.json` (session = `sessionEnded − anchored`),
  `run/run.json` (`executionPlan.tasks` maps node ids to operations), and the worker's CPU from
  `getrusage(RUSAGE_CHILDREN)`.
- `scripts/motion-split.py` with three modes:
  - `runs`: whole runs, seeded order of variants within each repetition. Variants: `default`; `gst480`
    (`analysisMaxWidth: 480`, GStreamer scales); `vc4` (videoconvert on 4 threads); a `+free` suffix makes `to_gray`
    return a preallocated zero image. The last two are applied in the worker by `scripts/b1-site/sitecustomize.py`,
    put on `PYTHONPATH` only for those runs; no factory source is edited.
  - `decode`: the file source alone (`FileSource(target="mac")`, every frame put into and released from a
    `HostPixelStore`), full size and at max width 480.
  - `gray`: the first frame of each 250 ms bucket (300 per clip) held as arrays, then `cv2.cvtColor`, the Pillow
    resize and `to_gray` timed separately per frame, five passes.
- `scripts/gst-split.sh`: `gst-launch-1.0` pipelines without Python, timing decode alone, decode + `videoconvert` to
  RGB on 1 and 4 threads, and to GRAY8.
- `scripts/videoconvert-threads-diff.py` and `checksumsink hash=sha1` over every frame: does threaded conversion give
  the same pixels?
- `scripts/b1-verdict.py`: `various/b1/verdict.json` and the figure `various/screenshots/b1-motion-split-m1pro.png`.

### Why

- **The oracle run** (`+free`) was added after the first numbers, because the guide's metric (lane service time as a
  share of session time) cannot tell a stage on the critical path from one that runs beside it. Making grey free is
  the direct question: how much shorter would the run be? It is an upper bound for any grey kernel, which would still
  upload a 6.2 MB frame and read back 130 KB.
- **The `vc4` runs** were added because the stage split showed where the time is. Without them the record would say
  "grey is cheap" without saying what is expensive, and the decision rule names "the existing GPU scale path" as the
  alternative, which on the Mac turned out to be slower (below).

### What worked

`to_gray` alone (`various/b1/gray-m1pro.json`, cv2 5.0.0, Pillow 12.3.0; p50 per selected frame, both clips within
0.01 ms): `cvtColor` 0.13 ms, Pillow resize 2.64 ms, `to_gray` 2.78 ms. The resample is 95 % of the grey stage.

The source without Python (`various/b1/gst-split-m1pro.jsonl`, 2,250 frames, median of 3):

| Pipeline after `h264parse`                    | Seconds | ms per frame |
| --------------------------------------------- | ------: | -----------: |
| `vtdec ! fakesink`                            | 1.11    | 0.49         |
| `vtdec ! videoconvert ! RGB`                  | 11.11   | 4.94         |
| `vtdec ! videoconvert n-threads=4 ! RGB`      | 3.29    | 1.46         |
| `vtdec ! videoconvert ! GRAY8`                | 24.88   | 11.06        |

`vtdec` outputs NV12. The factory's source through Python (`decode-m1pro.json`): 11.2 s full size (200 fps), 14.4 s
with `maxWidth` 480 (156 fps) — on the Mac `videoscale` runs on the CPU after a full-size `videoconvert`, so asking
GStreamer for small frames is slower, not faster.

Whole runs, medians of 4 per clip (`runs-m1pro.json`, `runs-vc4-m1pro.json`, `runs-oracle-m1pro.json`):

| Variant                    | left session | right session | `motion.gray` p50 | grey lane / session |
| -------------------------- | -----------: | ------------: | ----------------: | ------------------: |
| default                    | 11.09 s      | 11.04 s       | 3.42 ms           | 9.3 %               |
| gst480 (GStreamer scales)  | 14.27 s      | 14.20 s       | 0.055 ms          | 0.1 %               |
| vc4 (4 convert threads)    | 3.99 s       | 4.04 s        | 5.28 ms           | 39–40 %             |
| oracle: default, grey free | 11.05 s      | 11.23 s       | 0.009 ms          | —                   |
| oracle: vc4, grey free     | 3.70 s       | 4.15 s        | 0.013 ms          | —                   |

(The oracle file has its own default and vc4 arms: 11.07/11.15 s and 4.02/4.36 s.) Worker CPU per run: 17.1 s
default, 18.4 s vc4, 15.6 s gst480.

Verdict (`various/b1/verdict.json`): **`gray-is-worth-a-kernel` refuted** — 9.3 % and 9.4 % < 20 %. A free grey saves
nothing as shipped and at most 8.0 % / 4.7 % after the convert change.

### What didn't work

- Threaded `videoconvert` is not a drop-in: `checksumsink` gives different SHA-1s for **all 2,250 frames**. Over the
  first 60 frames, 4.7 % of RGB pixels differ (median 97,384 of 2,073,600 per frame), by up to 24 levels, mean |Δ|
  0.05; in frame 0 every row from 270 down differs and rows 0–269 are identical (the first of four 270-row slices).
  After `to_gray`, 1.2 % of grey pixels differ, by at most 1 (`various/b1/videoconvert-threads-diff.txt`). I have not
  found why the later slices differ; the factory would have to qualify the change against its motion budget (mean
  |Δ| 0.013 of the per-frame change signal) before adopting it.
- The first version of `videoconvert-threads-diff.py` looked up the decoder with `p.iterate_elements()` in a generator
  expression: `TypeError: 'Iterator' object is not iterable` (a `Gst.Iterator`); naming the element `dec` fixed it.
- The first figure placed the value labels on the wrong bars (string categories on a horizontal bar chart are ordered
  by first appearance, and the text loop assumed another order); it now plots numeric positions.

### What I learned

- In this runtime the cost of a stage on its own lane shows up in wall time only through CPU contention, so "share of
  wall time" measured from lane service times over-states it; the oracle run is the measurement to make.
- `motion.gray`'s own cost rises from 3.4 to 5.3 ms per frame when the conversion runs on four threads: the grey lane
  then competes with the conversion threads.
- GRAY8 straight out of `videoconvert` would avoid the RGB copy entirely but is 2.2× slower than RGB on this build.

### What was tricky to build

- Getting a patch into the worker without editing factory source: `offline_run` starts `python -m factory.worker` with
  this process's environment (`runs._worker_env`), so prepending a directory with a `sitecustomize.py` to
  `PYTHONPATH` patches `gst._RGB` and `motion.to_gray` before the session builds its pipeline. `GrayFrames.evaluate`
  looks `to_gray` up as a module global at call time, so the replacement takes effect.

### What warrants a second pair of eyes

- The grey share uses p50 × n as the lane's total; the status distribution has no sum. At n = 300 with p95/p50 ≈ 1.3
  the error is small, and the oracle does not depend on it.
- The Spark has the GPU colour/scale path (`nvvideoconvert`) and a different CPU; this verdict is for the Mac. The
  guide's rule reopens B2–B5 if the Spark shows a different picture, which needs SSH permission (PN).

### What should be done in the future

- factory-videos: decide on threaded `videoconvert` (2.75× on these runs) after a motion-signal comparison; or convert
  only the frames that are selected (the runtime selects 1 in 7.5 at 250 ms, but converts all of them).
- PN: the same `motion-split.py runs` on the Spark with `--variants default,default+free` (target `spark`).

### Code review instructions

- Start with `scripts/motion-split.py` (`one_run`, `cmd_runs`), then `scripts/b1-site/sitecustomize.py`.
- Reproduce: `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib PYTHONPATH=<fv>/src <fv venv>/bin/python
  scripts/motion-split.py runs --fv <fv> --out /tmp/r.json --reps 1 --variants default,default+free`.

### Technical details

- Node ids in a motion run: n0 `video.frames`, n1 `motion.gray` (`cpu.motion_gray`, params `{decodeWidth: 480}`),
  n2 `motion.change`, n3 `video.windows`, n4 `video.zone_motion`; one `cpu` lane.
- Worker phases of the probe run: runtime entered 0.21 s, compiled 0.43 s, anchored 1.11 s, session ended 12.15 s.
