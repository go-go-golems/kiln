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
RelatedFiles:
    - Path: abs:///Volumes/SSD/code/playback-kiln-002/services/redaction/src/mask_post.py
      Note: C3 Playback consumer, commit cdfb0d8c9 (Step 6)
    - Path: repo://ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/nvrtc-compile-check.py
      Note: C3 NVRTC compile check (Step 6)
    - Path: repo://ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/c3/nvrtc-13.2-arm64.json
      Note: C3 NVRTC evidence (Step 6)
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

| Case         | Kernels | Values compared | max abs error | First run | Second run |
| ------------ | ------: | --------------: | ------------: | --------: | ---------: |
| attention    | 3       | 1,024           | 8.94e-8       | 6.8 ms    | 1.4 ms     |
| blur-2d-grid | 1       | 4,096 sampled   | 0             | 87.7 ms   | 44.9 ms    |
| blur-small   | 1       | 6,144           | 0             | 1.8 ms    | 0.6 ms     |
| grey-u8      | 1       | 3,072           | 0             | 0.6 ms    | 0.3 ms     |
| mlp          | 2       | 1,024           | 2.38e-7       | 2.0 ms    | 0.6 ms     |

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

| n     | d   | CPU      | GPU     | GPU/CPU [95 % CI]    | ImageData paint | GPU + paint |
| ----: | --: | -------: | ------: | -------------------- | --------------: | ----------: |
| 400   | 256 | 20.1 ms  | 2.6 ms  | 0.124 [0.027, 0.131] | 2.2 ms          | 4.3 ms      |
| 691   | 256 | 59.7 ms  | 6.0 ms  | 0.101 [0.091, 0.110] | 3.7 ms          | 9.2 ms      |
| 1,385 | 256 | 245.5 ms | 13.3 ms | 0.054 [0.047, 0.055] | 13.1 ms         | 26.3 ms     |
| 2,297 | 256 | 678.7 ms | 32.2 ms | 0.047 [0.046, 0.048] | 34.3 ms         | 66.9 ms     |
| 400   | 768 | 60.6 ms  | 3.8 ms  | 0.063 [0.060, 0.073] | 1.5 ms          | 5.9 ms      |
| 691   | 768 | 181.7 ms | 10.0 ms | 0.055 [0.049, 0.059] | 3.9 ms          | 14.0 ms     |
| 1,385 | 768 | 734.0 ms | 20.7 ms | 0.029 [0.024, 0.031] | 12.9 ms         | 35.6 ms     |
| 2,297 | 768 | 2,025 ms | 42.9 ms | 0.021 [0.017, 0.022] | 34.8 ms         | 75.9 ms     |

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

| Pipeline after `h264parse`               | Seconds | ms per frame |
| ---------------------------------------- | ------: | -----------: |
| `vtdec ! fakesink`                       | 1.11    | 0.49         |
| `vtdec ! videoconvert ! RGB`             | 11.11   | 4.94         |
| `vtdec ! videoconvert n-threads=4 ! RGB` | 3.29    | 1.46         |
| `vtdec ! videoconvert ! GRAY8`           | 24.88   | 11.06        |

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

## Step 6: Example C, C1–C3 — redaction mask post-processing, bit-exact, wired into Playback behind a switch

Example C is built up to the point where only a GPU host can say more. The W-28 preset reproduces Playback's per-person
mask post-processing (`_unletterbox_mask` then `_smooth_mask`) exactly, not approximately: 0 differing pixels in
269,352,960 through the wgpu launcher on the M1 Pro, after an exact integer re-implementation had already matched
Playback's own functions on 0 of 67.3 M pixels on three platforms. The Playback branch `perf/kiln-002-redaction-mask-post`
puts the kernels behind `REDACTION_MASK_POST=kiln` (default `cpu`), with refusals for every configuration the
exactness argument does not cover and a load-time comparison of every compiled program against the CPU loop on the
host's own GPU. All 48 CUDA kernels compile with NVRTC 13.2 (the image's toolkit) for sm_120 and sm_121; none has
run on an NVIDIA GPU yet (C4, PN.1).

Three things in the guide turned out wrong and are corrected here: the program must return per-person masks, not a
union; the cut is `S >= 32768` exactly, with no boundary differences at all; and the threshold stays in torch while
Kiln takes `u8` masks.

### Prompt Context

**User prompt (verbatim):** see Step 1 and Step 2.

**Assistant interpretation:** Execute guide Part V (C1–C3): the Kiln program, its agreement with Playback on the Mac,
and the Playback branch, stopping before anything that needs a GPU host.

**Inferred user intent:** A kernel that real code can adopt, with evidence a reviewer can check, and nothing claimed
about speed that was not measured on the hardware it is for.

### What I did

- **C1, the program.** `apps/workbench/presets/W-28-redaction-mask-post.{js,md}`: parameters `detections`
  {1,2,4,8,16,32,64,100}, `geometry` {768x416, 640x480, 768x576}, `form` {separable, direct}. Input
  `masks: k.tensor([n, 640, 640], "u8")` holding 0/1; output `out = N.gt(S, 32767.5)` of shape (n, H, W). The
  unletterbox and the reflect-101 border are index maps through `T.view`, so no kernel copies a mask; reflection is
  applied only at non-zero offsets. Kiln commit `3aa8208`.
- **C1, the launcher.** `runtime/python/kiln_launch.py`: `CudaProgram(program, device, allocate=False)` allocates only
  constant buffers and lists the intermediates in `.scratch` (`{id, bytes}`); `launch(stream, scratch={id: ptr},
  **pointers)` raises `ValueError` for a missing pointer and `KeyError` for a non-intermediate id, and makes the
  program's context current when called from another thread. `write`/`read` raise on caller-owned buffers.
  `runtime/python/test_kiln_launch.py` tests this on a fake driver (4 tests).
- **C2, reference.** `scripts/mask-post-reference.py check`: recovers OpenCV's fixed-point weights from an impulse,
  checks the exact integer blur against `cv2.GaussianBlur` on random 8-bit images, checks the nearest-neighbour index
  map, and compares an exact re-implementation with Playback's own functions on fixture people (five calibration
  fixtures split into connected components) and stress masks (ellipses crossing the content border, lines, single
  pixels including the four corners, 30–90 % noise, a full mask), at three geometries. Run on the Mac (arm64) and in
  `python:3.11-slim` containers on linux/arm64 and linux/amd64 (OpenCV with Intel IPP 2022.2.0, under emulation).
- **C2, kernels.** `scripts/mask-post-kiln.py check|time` and `scripts/mask-post-figure.py` through
  `kiln_launch.WgpuProgram` (Metal). Every case at the bucket the engine would pick and at bucket 100.
- **Audit of the collect path** (`services/redaction/src/trt_engine.py:693-781` at main `d1faf0cf1`) before C3, which
  produced the corrections below.
- **C3, Playback branch** (`/Volumes/SSD/code/playback-kiln-002`, branch `perf/kiln-002-redaction-mask-post` from main
  `d1faf0cf1`):
  - `src/kiln/kiln_launch.py` vendored byte-identical below a three-line header (Kiln revision `3aa82089`, sha256);
    `src/kiln/mask_post.json` exported with
    `node scripts/kiln-export.mjs --preset W-28 --param detections=1,2,4,8,16,32,64,100 --param geometry=768x416,640x480,768x576 --param form=separable --target rtx5090 --no-check`
    (24 programs, 490 KB); `src/kiln/README.md` with both regeneration commands.
  - `src/mask_post.py`: `mask_post_mode()`; `read_program_set()` checks the shape contract of every program;
    `KilnMaskPost.load()` refuses sigma ≠ 2, dilation ≠ 0 and a canvas other than 640×640 before importing torch,
    compiles with `CudaProgram(..., allocate=False)`, then `_self_check()` runs every program on a full bucket of probe
    masks against the engine's own CPU loop; `supports()` keys on (height, width) and the engine's letterbox for that
    size; `run()` pads to the bucket, allocates output and scratch with torch on the current stream, launches, and
    returns `out[:n]` as uint8 without synchronising. `load_kiln_mask_post()` catches everything and logs.
  - `src/trt_engine.py`: the CPU loop moved into `_post_cpu()` (unchanged arithmetic); `load()` builds the Kiln path when
    the mode is `kiln`; `_collect_with_slot` keeps the thresholded masks on the GPU and, when `supports()` says yes,
    runs the kernels on the slot stream and copies the source-sized masks back; otherwise the old path. `mask_post`
    property; `/health` reports it.
  - `scripts/validate_on_host.sh`: `--candidate-env KEY=VALUE` (candidate arm only), an assertion that a candidate given
    `REDACTION_MASK_POST=kiln` reports `mask_post=kiln`, and the baseline arm materialised with `git archive` so
    subdirectories of `src/` exist.
  - `docker-compose.yml`: `REDACTION_MASK_POST: ${REDACTION_MASK_POST:-cpu}`. `pyproject.toml`: the vendored launcher
    excluded from ruff, `ignore_errors` for it in mypy.
  - Docs: a section in `docs/vision/redaction-performance.md` (why this stage, why exact, what is refused, how to read
    the timers, the two hypotheses and the acceptance run), the knob in the service README.
  - `tests/test_mask_post.py`: mode parsing; four refusals; a foreign program set; the load wrapper returning `None`
    on a refusal and on an unexpected exception; the set's 3 × 8 shape; largest bucket = `_MAX_DETECTIONS`; eight
    common camera sizes reaching a compiled geometry through `_infer_size_for`; kernel names ending in their identity;
    the launcher hash; and a `TestOnGpu` class (fixtures, two streams at once) that skips without CUDA.
- **NVRTC compile check.** `scripts/nvrtc-compile-check.py` compiles every kernel of a program set with NVRTC alone (no
  driver, no GPU) using the launcher's options. Run in `python:3.11-slim` on linux/arm64 with
  `nvidia-cuda-nvrtc==13.2.*` (13.2.86). Output: `various/c3/nvrtc-13.2-arm64.json`.

### Why

- **Per-person masks, not a union.** `video_pipeline._frame_record` reads `masks_small[i]` for each region's outline in
  `.redact.json`, `server.py` returns `len(masks)` as the person count, and `image_redact._write_redacted(masks,
  scores)` takes the stack. A union output would have broken all three.
- **`u8` input, threshold in torch.** `MASK_THRESHOLD` is calibrated and env-overridable
  (`REDACTION_MASK_THRESHOLD`); compiling it into the kernel would have frozen a runtime knob. The threshold is one
  fused torch op that already existed.
- **Separable, not direct.** At 768x416 on the M1 Pro the separable form costs 0.10–0.17 ms per mask from 16 masks
  up against 0.39–0.50 ms for the direct form, which is no faster than the CPU loop (0.43–0.48 ms). The price is a
  1.28 MB intermediate per mask, which is why `allocate=False` exists: with launcher-owned intermediates, two frames
  collected at once on different slot streams would write the same buffer.
- **The load-time self-check.** The exactness argument covers the arithmetic, not the CUDA build on a given host
  (NVRTC version, architecture, FMA contraction). Comparing every program with the CPU loop at load turns "it should
  be exact" into "it was exact on this GPU a few seconds ago", and a mismatch costs the speed-up, not correctness.
- **Catching everything in `load_kiln_mask_post`.** `server._load_trt_engine` treats a raising engine load as a broken
  TensorRT engine to quarantine and rebuild; an exception from the opt-in path must not reach it.
- **`--candidate-env`.** With the switch off, the candidate arm runs the baseline's path, and the A/B would measure the
  refactor and report "no change" for a change that never ran.

### What worked

C2 reference (`various/c2/reference-*.json`): weights `k = [1,2,7,16,31,45,52,45,31,16,7,2,1]`, sum 256; exact blur
equals `cv2.GaussianBlur` on 20 random 8-bit images (max |Δ| 0); nearest map equal at all three geometries; 0 of
67,272,192 pixels differ between Playback's functions and the exact re-implementation, on all three platforms.

| Geometry | letterbox (new_w, new_h, pad_x, pad_y) |
| -------- | -------------------------------------- |
| 768x416  | 640, 347, 0, 146                       |
| 640x480  | 640, 480, 0, 80                        |
| 768x576  | 640, 480, 0, 80                        |

C2 kernels (`various/c2/kiln-check-m1pro.json`): 0 of 269,352,960 pixels over 120 runs (3 geometries × 2 forms ×
10 cases × {fit bucket, 100}). Figure: `various/screenshots/c2-mask-post-768x416.png` (image.04, 5 people, redacted
output and silhouettes only).

C2 timings, 768x416, M1 Pro, wgpu/Metal, median of 15 dispatch-and-wait (`various/c2/kiln-time-m1pro.json`):

| masks | separable ms | direct ms | CPU loop ms |
| ----: | -----------: | --------: | ----------: |
| 1     | 1.39         | 2.64      | 0.64        |
| 8     | 1.40         | 4.02      | 3.58        |
| 16    | 2.70         | 7.75      | 6.97        |
| 32    | 4.02         | 13.02     | 14.49       |
| 100   | 10.34        | 39.24     | 43.25       |

The ~1.4 ms floor, flat from 1 to 8 masks, is fixed per-dispatch cost (wgpu's submit and wait on Metal), not kernel time; on CUDA the launch sits inside a
stream that the engine already synchronises for its copy. These numbers say the separable form is the one to ship;
they do not predict the hosts.

C3: `uv run --python 3.10 ruff check src/ tests/` and `ruff format --check` clean; `uv run --python 3.12 mypy src/ tests/`
"Success: no issues found in 56 source files"; `uv run --python 3.10 pytest -q tests/test_mask_post.py
tests/test_aiohttp_server.py tests/test_trt_engine_raw.py tests/test_smoothing.py tests/test_seg_engine.py
tests/test_server_engine_init.py` → 126 passed, 3 skipped (the CUDA classes). `docker compose config --quiet` exit 0.

NVRTC 13.2.86: 96 of 96 compiles (48 kernels × sm_120, sm_121), no log output, CUBINs 7–10 KB, 41.8 ms median and
2.08 s in total per architecture — that total is the compile cost the service adds to its load on an arm64 host,
before the self-check.

### What didn't work

- The guide (§18–§20) had the program return the union of all masks, the cut as "≥ 127.5 with a handful of boundary
  differences", and the threshold inside the kernel. The audit above replaced all three; the guide should be read with
  this step.
- wgpu's default 128 MiB storage-binding limit is too small for the largest buckets (at 768x576, 100 × 576 × 768 ×
  4 B = 169 MiB of fp32 output, and as much again for the intermediate); `mask-post-kiln.py` requests the adapter's
  own limits. CUDA has no such limit.
- A first `src/kiln/README.md` linked a GitHub URL for Kiln that I had not checked; Kiln has no remote. Removed. A
  first statement there that `--no-check` "takes minutes" was likewise unverified and replaced by what the flag does.
- `mypy` flagged the GPU test for `cv2.imread(...) > 127` (`ndarray | None`) and a union from `connectedComponents`;
  fixed with an assertion and `np.asarray`.
- `validate_on_host.sh` copied the baseline's `src/` with `ls-tree | basename | git show` per entry, which cannot
  materialise a subdirectory. Harmless at main today (flat `src/`), wrong for any baseline that contains `src/kiln/`.
- **Pre-commit in the fresh C3 worktree.** `uvx pre-commit run --files <C3 files>` first failed on two missing tools:
  `sh: oxfmt: command not found` (no `node_modules`; fixed by `pnpm install --frozen-lockfile`), and
  ``Executable `markdownlint` not found``. The markdownlint hook is `language: system` and nothing on this Mac provides
  it. I put a two-line wrapper on `PATH` (`/Volumes/SSD/tmp/kiln-002/tools/bin/markdownlint`, which runs
  `pnpm dlx markdownlint-cli@0.49.1`) for the commit. The three changed Markdown files were clean.
- **The stream-engine hook cannot pass on macOS.** `docker-compose.yml` triggers `stream-engine-pytest`, which runs
  the whole stream-engine suite.
  - `tests/test_file_ipc.py::test_expired_deadline_terminal_offer_never_waits_for_backpressure` blocks forever in
    `left.send(b"x" * 4096, socket.MSG_DONTWAIT)` (line 164; faulthandler dump at 0 % CPU). That was the "hang".
  - With that test deselected, the suite gives `98 failed, 1645 passed, 75 skipped, 1 deselected, 8 errors`. Every
    failure is a Linux-only facility:
    - `/proc/sys/kernel/random/boot_id` (26);
    - `dlsym(RTLD_DEFAULT, prctl): symbol not found` (44);
    - `/proc/<pid>/stat` and `/proc/self/fd`;
    - `os.pidfd_open`.
  - The same `test_file_ipc.py` passes 26/26 in `python:3.12-slim` (linux/arm64).
  - The 8 errors, in `test_file_deployment.py` (`unknown flag: --env-file`), come from the test running `docker` with a
    temporary `HOME`. Docker Desktop installs the compose plugin only under `~/.docker/cli-plugins`, so the CLI has no
    `compose`. With a `docker` wrapper that points `DOCKER_CONFIG` at a directory holding only the compose plugin,
    `test_file_deployment.py` passes 14/14 against the changed compose file.
  - Logs: `/Volumes/SSD/tmp/kiln-002/c3/stream-engine-pytest{,-2}.log`.
  - Consequence: I committed C3 without `docker-compose.yml`, since every hook that commit triggers passes. The
    one-line compose change is still uncommitted in the worktree. Committing it needs either the user's permission to
    skip `stream-engine-pytest` or a commit from a Linux machine. The A/B does not need it: `validate_on_host.sh` starts
    both arms with `docker run`.

### What I learned

- OpenCV's 8-bit Gaussian is fixed-point with integer weights summing to 256, and on binary masks the whole
  blur-then-threshold collapses to an integer inequality. That is the reason the GPU path can be exact; an
  "approximately equal" kernel would have needed a new quality gate and would have argued with the noise floor.
- On the pipelined collect path the CPU loop runs after the execution context is released, so it already overlaps the
  next frame's forward at depth 2. The GPU path holds the context through its post-pass. The saving on a host can
  therefore be smaller than the loop's 2.87 ms; the hypothesis is stated on `infer_busy` for that reason.
- In GPU mode the stage timers change meaning (`decode` loses the threshold and the mask copy, `post` gains them).
  Only `decode + post` or `infer_busy` compare across modes; the doc says so.

### What was tricky to build

- Buffer lifetime without synchronisation: `run()` frees its padded input, output and scratch tensors when it returns,
  while the kernels may still be queued. It is safe because every allocation and launch is on the slot's stream and
  PyTorch's caching allocator only reuses a freed block for later work on the same stream. The comment in `_launch`
  states this; a future change that launches on a different stream from the one it allocates on breaks it.
- `supports()` must agree with what the kernels hard-code (new_h 347, pad_y 146 for 768x416). Rather than restate
  `_letterbox_into`'s arithmetic in `mask_post.py`, the engine passes `_letterbox_of`, which runs `_letterbox_into` on a
  blank frame of each compiled size; the self-check then proves the kernels agree with that letterbox.

### What warrants a second pair of eyes

- Holding the slot through the GPU post-pass (until the masks are copied back): correct, but it changes how long a
  context is checked out per frame. C4 at concurrency 4 and 8 is where that shows.
- The broad `except Exception` in `load_kiln_mask_post` is deliberate (see Why), but it is the kind of handler
  `.claude/rules/fix-quality.md` names as a swallowed failure; it logs with a traceback and `/health` shows the result.
- NVRTC compile time at boot (~2.1 s per architecture measured off-host) plus the self-check's CPU reference (227 masks
  per geometry, ~0.5 ms each on the Mac). Measure both in C4.

### What should be done in the future

- C4 (needs permission): `validate_on_host.sh --candidate-env REDACTION_MASK_POST=kiln` on the RTX PRO 6000 and the
  GB10; `pytest tests/test_mask_post.py` inside the container (runs `TestOnGpu`); record `post-moves-to-gpu` and
  `gb10-unchanged-or-better`.
- PN.1 (needs permission): `kiln_launch.py check` with `--backend cuda` on the fixture directory.
- If C4 confirms: decide whether to flip the default, and whether the temporal OR, the upscale and the fill should follow
  (guide §21).

### Code review instructions

- Kiln: `apps/workbench/presets/W-28-redaction-mask-post.js`, then `runtime/python/kiln_launch.py` (`CudaProgram`,
  `launch`) and `runtime/python/test_kiln_launch.py`. Commits `3aa8208` (C1), `f17ed80` (C2).
- Playback: commit `cdfb0d8c9` on `perf/kiln-002-redaction-mask-post` (`/Volumes/SSD/code/playback-kiln-002`).
  Read `services/redaction/src/mask_post.py`, then the `_collect_with_slot` hunk in `src/trt_engine.py`, then
  `tests/test_mask_post.py`. The one-line `docker-compose.yml` change is not in that commit (see What didn't work).
- Reproduce C2: `/Volumes/SSD/venvs/kiln-c2/bin/python scripts/mask-post-reference.py check --playback <pb> --out r.json`
  and `.../python scripts/mask-post-kiln.py check --set <W-28 set> --playback <pb> --out k.json`.
- Reproduce the NVRTC check: `docker run --rm --platform linux/arm64 -v "$PWD:/w" -w /w python:3.11-slim sh -c 'pip
  install -q "nvidia-cuda-nvrtc==13.2.*" && python -I nvrtc-compile-check.py mask_post.json --arch 120,121'`.

### Technical details

- Kernel pair per program: `k_ew__<id>` (horizontal pass, reads the u8 canvas through crop, resize and reflection,
  writes fp32 (n, H, W)) and `k_ew_2__<id>` (vertical pass and the cut). Tiling chosen per program by the exporter for
  the `rtx5090` target (TPB 64–1024, COARSEN 1–4).
- Program buffers for 768x416, bucket 1: masks u8 409,600 B; intermediate f32 1,277,952 B; out f32 1,277,952 B.

## Step 7: Vault reports for Examples A, B and C

Each of the three examples has a project report in the vault, written as a standalone explanation. Each report covers
what the code does, what was measured, the verdicts, and what remains open. The reports reuse the ticket's figures,
which show no camera content and only redacted output or silhouettes.

### Prompt Context

**User prompt (verbatim):** see Step 2 ("When done, write a detailed report about each one, the results you got, the
work done, in much much detail. Take screenshots appropriately as well").

**Assistant interpretation:** One detailed vault report per example, with the figures, after the implementation steps.

**Inferred user intent:** A record a reader can follow without the ticket open.

### Evidence and commits

- Vault `594f801` (pushed to `main`), in `Projects/2026/10/20/`:
  - `PROJECT REPORT - Kiln - Real Work Example A - The Window Similarity Matrix on the GPU in Factory Videos.md`
  - `PROJECT REPORT - Kiln - Real Work Example B - Zone Motion Grey Conversion Is Not Worth a Kernel.md`
  - `PROJECT REPORT - Kiln - Real Work Example C - Redaction Mask Post-Processing on the GPU, Bit-Exact.md`
  - six figures under `_assets/kiln-real-work/`.

### Noteworthy decisions or failures

- Checking the reports against the evidence files turned up two errors in Report B, both corrected before the commit:
  - A draft said every row from 270 down differs in frame 0. `videoconvert-threads-diff.txt` says 809 rows differ.
  - A draft called "mean |Δ| 0.013" the size of the motion signal. It is the parity budget from the experiment that
    chose the grey conversion (Step 1).
- Report C's draft called a kernel identity a content hash; I had not verified that. It now shows the literal names
  instead.

### Remaining requirements and next action

- C4, PN and PN.1 need SSH permission to the GPU hosts.
- PE is blocked by the constraint on `lab-workbench`.
- The Playback `docker-compose.yml` line needs a commit decision (Step 6).

## Step 8: Two GB10 hosts — setup, the kernels' first NVIDIA run, and a launcher context bug (PN.1)

The user gave access to two GB10 machines, so the NVIDIA steps that Steps 6 and 7 left open could start. On `dgx` the
W-28 kernels ran on NVIDIA hardware for the first time. That was Playback's own test file inside the production
redaction image, and it passed 25 of 25 with the GPU class included. The first timing script then failed in a way that
exposed a real defect in Kiln's CUDA launcher. Only the first program on a thread took a reference to the device's
primary context, so closing that program destroyed the context under every other program. Kiln's own fixture check
(PN.1) fails on its second fixture because of this. The fix is Kiln `7bcfc06`. On the fresh machine `bling`, the old
launcher fails at fixture 2 and the fixed one passes all five.

### Prompt Context

**User prompts (verbatim, in order):**

- "use playback@dgx"
- "also try manuel@bing.local but that's a completely fresh install dgx spark so that might need some work."
- "there's a root tmux open "admin" which you can use to install additional software. btw commit at appropriate
  intervals and keep a detailed diary as you work (using the diary format from the skill). So that I can trace all you
  did. Then also Write a detailed project report for the obsidian vault in ~/code/tulip/playback-vault (instead of
  go-go-parc) as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill).
  Commit and push the playback-vault when done. once you are done"
- "or actually amend the report you just wrote"
- "can I view this in a browser btw?"
- "alright, don't forget the diary, i'm going out to get lunch, so you have time to be thorough. I want a great report!"

**Assistant interpretation:**
- SSH permission is granted for `playback@dgx` and for the fresh Spark. Its mDNS name is `bling.local`: `bing.local` did
  not resolve, and `dns-sd -B _ssh._tcp` advertises "bling".
- Run the open NVIDIA steps: C4, PN.1, and what PN can do without the motion-grey kernels that B never built.
- Install what the fresh host needs through the root tmux session.
- Fold the results into the existing vault reports rather than writing a new one.

**Inferred user intent:** Evidence from real NVIDIA hardware for the claims the reports could only predict, with a
trail detailed enough to audit every host-side action.

### What I did

- **Probed both hosts** (read-only):
  - `dgx` (`gx10-b2d2`): GB10, capability 12.1, driver 580.159.03, Ubuntu 24.04.4, 20 cores, 121 GB. `playback` is in
    `docker`. It is not idle: the `factory-live` stack's model servers hold about 8.4 GB of GPU memory across seven
    Python processes at 8–10 % utilisation, and Playback's observability stack runs beside it. It has no Playback
    redaction service and no recordings (`/data/playback/nvr-recordings` is 88 KB with zero `.ts` files). It does have
    `playback-redaction:pb-obs-001-59c13eed4` (24.5 GB), built from the same NGC 26.05 base the branch pins: CUDA
    13.2.1, TensorRT 10.16.1.11, torch 2.12.0a0, OpenCV 4.13.0, `/usr/local/cuda/lib64/libnvrtc.so.13.2.78`.
  - `bling`: GB10, capability 12.1, driver 580.178.04, Ubuntu 24.04.5, 20 cores, 121 GB, 3.5 TB free, GPU idle with no
    compute processes. It has CUDA 13.0.88 at `/usr/local/cuda`, docker-ce 29.6.2 and nvidia-container-toolkit
    1.20.1, but no `/etc/docker/daemon.json`, `manuel` not in `docker`, no numpy and no uv.
- **Set up `bling` through the root tmux session `admin`.** The pane runs `sudo`, and `id` there prints `uid=0(root)`.
  - A helper script, `/Volumes/SSD/tmp/kiln-002/hosts/bling-root.sh`, sends one command into the pane, redirects its
    output to `/tmp/KILN002_<epoch>_<pid>.log`, and polls a `.done` file.
  - Commands run as root, all at 14:17 EDT:
    - `nvidia-ctk runtime configure --runtime=docker`, which wrote `/etc/docker/daemon.json` with the `nvidia` runtime;
    - `systemctl restart docker`;
    - `usermod -aG docker manuel`.
  - Check: `docker run --rm --gpus all ubuntu:24.04 nvidia-smi -L` prints
    `GPU 0: NVIDIA GB10 (UUID: GPU-c6e7f17e-…)`.
  - As `manuel`, in user space: uv 0.13.4 via the official installer, into `~/.local/bin`.
- **Put the C3 branch on `dgx` without touching its checkout.** I pushed `perf/kiln-002-redaction-mask-post` to
  `playback@dgx:code/playback` and ran `git worktree add ~/code/worktrees/kiln-002 …` (HEAD `cdfb0d8c9`).
  `~/code/playback` stays on its own `main` (`502d965cc`), and its working tree is untouched.
- **Ran the kernels on NVIDIA for the first time** (`dgx`). The command was
  `docker run --rm --gpus all -v ~/code/worktrees/kiln-002/services/redaction:/w:ro -w /w -e PYTHONPATH=/w --entrypoint sh playback-redaction:pb-obs-001-59c13eed4 -c "pip install -q pytest; python3 -m pytest -p no:cacheprovider -q -rs tests/test_mask_post.py"`.
  Result: `25 passed`, no skips. `TestOnGpu` therefore ran:
  - `load()` compiled all 48 kernels with NVRTC 13.2.78 and self-checked every program against the CPU loop;
  - the fixture people matched `_post_cpu` exactly at 768x416, 640x480 and 768x576;
  - two frames on two streams matched.
  The `nvidia-smi` co-tenant list was identical before and after (`various/c4/dgx-test-mask-post.txt`).
- **Wrote `scripts/mask-post-cuda-time.py`** to time the engine's entry points (`run()` plus the host copy, the
  kernels alone through CUDA events, and the CPU loop) on a CUDA host. Its first run on `dgx` failed:
  `KilnUnavailable: RuntimeError: cuModuleLoadData k_ew__l7ufynazfl: CUDA_ERROR_CONTEXT_IS_DESTROYED (709): context is destroyed`.
- **Diagnosed and fixed the launcher** (Kiln `7bcfc06`); the mechanism is under What didn't work.
  - Tests first: the fake driver now models the primary context's reference count, and `cuModuleLoadData` and
    `cuLaunchKernel` return 709 in a destroyed context. Three new tests were added; the two about reference counts
    failed before the fix (`AssertionError: 1 != 2`).
  - The fix: every `CudaProgram` retains the primary context and releases its own reference in `close()`. A live
    non-primary context current on the thread is still used as found, checked with the newly bound
    `cuCtxGetApiVersion`.
  - Result: `python runtime/python/test_kiln_launch.py` reports 7 tests OK.
- **PN.1 on `bling`.** `node runtime/test/fixtures.mjs` produced the five fixtures, and I copied them to `bling` with
  both launchers. Command:
  `uv run --python 3.12 --with numpy python kiln_launch_{old,new}.py check fixtures --backend cuda`.
  - The old launcher passes `attention`, then fails with
    `RuntimeError: cuMemAlloc (67174416 bytes): CUDA_ERROR_CONTEXT_IS_DESTROYED (709): context is destroyed`.
  - The new launcher passes all five, each via a cubin for sm_121 compiled by NVRTC 13.0 from the host toolkit.
    `various/pn1/bling-gb10-fixture-check.txt` has the output.

| Fixture      | values | max \    | Δ\       |         | build   | first run | second run |
| ------------ | -----: | -------: | -------: | ------: | ------: | --------- | ---------- |
| attention    | 1024   | 8.94e-08 | 259.9 ms | 0.1 ms  | 0.0 ms  |           |            |
| blur-2d-grid | 4096   | 0        | 181.0 ms | 46.5 ms | 47.0 ms |           |            |
| blur-small   | 6144   | 0        | 170.3 ms | 0.3 ms  | 0.0 ms  |           |            |
| grey-u8      | 3072   | 0        | 184.4 ms | 0.1 ms  | 0.0 ms  |           |            |
| mlp          | 1024   | 2.12e-07 | 219.6 ms | 0.1 ms  | 0.0 ms  |           |            |

### Why

- **Test inside the production image, not on the host.** The service compiles with the image's NVRTC (13.2.78) and
  loads `libcuda` from the host driver. That pairing is the one to qualify, and the fixtures check on `bling` covers
  the other one: the host toolkit's NVRTC 13.0.
- **Fix the launcher rather than reorder the script.** Calling a CUDA op from torch first would have made the script
  work and left the defect for the next caller. `check --backend cuda` is one such caller: it opens and closes one
  program per fixture.
- **Keep the original checkout on `dgx` untouched.** It belongs to other work (five worktrees hang off it); a separate
  worktree adds one branch and one directory.

### What worked

- Docker GPU access on `bling` after one `nvidia-ctk` configure and a restart.
- The production image's NVRTC compiled every W-28 kernel for sm_121 on the first try, and the load-time self-check
  passed.

### What didn't work

- `ssh manuel@bing.local`: `Could not resolve hostname bing.local`. Browsing mDNS found `bling SSH`, and
  `manuel@bling.local` connected.
- `docker info` on `bling` as `manuel`: `permission denied while trying to connect to the docker API at
  unix:///var/run/docker.sock`, and `sudo -n true` reported `a password is required`. Both were fixed through the root
  pane.
- **The context bug, mechanism.**
  - Before the fix, `CudaProgram.__init__` retained the primary context only when `cuCtxGetCurrent` returned null, and
    then made it current.
  - Every later program on that thread found it current, took no reference, and stored the same handle.
  - `close()` released the reference only in the program that had taken it. Closing the first program therefore took
    the count to 0, which destroys the primary context, while the thread still named it.
  - The next program found a non-null current context, took no reference, and failed on its first driver call.
  - In my timing script, the compile-only pass (open 24, close 24) did exactly this before torch had touched CUDA.
- **Why Playback's engine never saw it.** The TensorRT engine and torch initialise the CUDA runtime before
  `KilnMaskPost.load`, and the runtime holds its own reference to the primary context until the process exits. The
  count never reached 0.

### What I learned

- "Use the current context, else retain" is only correct if every user of the retained context holds its own
  reference. The primary context is reference-counted per retain, not per thread.

### What was tricky to build

- Driving a root shell I cannot see. The helper wraps each command in `{ …; } > log 2>&1; echo rc=$? >> log; touch done`
  and polls over a second SSH connection, so every root action leaves a log file with its exit code.

### What warrants a second pair of eyes

- The live-non-primary branch in the fixed launcher retains the primary context and releases it at once, which can
  initialise the primary context on a device where nothing else uses it. No current consumer reaches that branch.
- `dgx` is shared: every number from it must carry its co-tenant list.

### What should be done in the future

- Re-vendor the fixed launcher into the Playback branch (next step), so that the vendored header names `7bcfc06`.

### Code review instructions

- Kiln `7bcfc06`: `runtime/python/kiln_launch.py` (`CudaProgram.__init__`, the signature table) and
  `runtime/python/test_kiln_launch.py` (`FakeDriver`, `CudaProgramContexts`).
- Reproduce on a CUDA host:
  `node runtime/test/fixtures.mjs F && python runtime/python/kiln_launch.py check F --backend cuda`.

### Technical details

- Host setup commands on `bling` (root, via tmux `admin`):
  `nvidia-ctk runtime configure --runtime=docker && systemctl restart docker && usermod -aG docker manuel`.
- `/etc/docker/daemon.json` on `bling` afterwards:
  `{"runtimes": {"nvidia": {"args": [], "path": "nvidia-container-runtime"}}}`.

## Step 9: The W-28 path timed on a GB10, the launcher re-vendored, the executor's first probe, and bench inputs for C4

With the launcher fixed, the timing script from Step 8 ran to completion on `dgx`. It ran inside the production
redaction image with the re-vendored launcher. Every timed GPU output equalled the CPU loop: 0 differing pixels over
24 rows × 15 repetitions. At 100 masks the GPU path is 5–7 times faster than the CPU loop on the same machine. At one
mask it is about 4 times faster. The fixed costs are paid once per process: 0.26 s to initialise CUDA and 1.69 s for
`load()`. The Kiln executor's device probe also reached `bling` over SSH, which is the first time Kiln's server-side
CUDA executor has talked to a real GPU host. Finally, the GB10 hosts hold no recordings, so I built a recorder-shaped
tree of real factory footage for `validate_on_host.sh`.

### Prompt Context

**User prompt (verbatim):** see Step 8. No new instruction arrived during this step apart from "yeah, having a
kiln/perf only image would be interesting, if possible", which is Step 10's subject.

**Assistant interpretation:** Finish the measurements Step 8 started, before moving to the host-level C4 comparison.

**Inferred user intent:** GB10 numbers for the claim that the GPU mask path is cheaper than the CPU loop, and inputs for
the whole-service comparison.

### What I did

- **Re-vendored the launcher into Playback** (`ac835daa9`, on top of C3 `cdfb0d8c9`). The vendored header now names
  Kiln `7bcfc06655af751a4625768ba55d94e77bd4c548`. The commit message records why the engine itself was not exposed.
  Torch's runtime holds the primary context before `KilnMaskPost.load` runs. I fast-forwarded the `dgx` worktree to it
  through a side ref (`kiln-002-incoming`), because pushing to a checked-out branch is refused.
- **Timed the path on `dgx`.** I ran `scripts/mask-post-cuda-time.py` in
  `playback-redaction:pb-obs-001-59c13eed4`, with the worktree's `services/redaction` mounted at `/w` and on
  `PYTHONPATH`. Each cell is a median of 15 repetitions after 3 warm-up repetitions.
  - Evidence: `various/c4/mask-post-cuda-time-dgx.json`, plus the co-tenant snapshots `various/c4/dgx-time-before.txt`
    and `dgx-time-after.txt`.
  - The seven `factory-live` processes, about 8.4 GB in all, were identical before (14:25:59) and after (14:26:11).
    GPU utilisation was 11 % and 10 %, the SM clock 2431 MHz of 3003 MHz, power 23–27 W.
  - Fixed costs: `cuda_init_s` 0.257, `compile_s` 1.621 (24 programs, NVRTC 13.2.78, no self-check), `load_s` 1.687
    (compile plus the self-check against the CPU loop).

| 768x416, masks       | 1     | 2     | 4     | 8     | 16    | 32    | 64     | 100    |
| -------------------- | ----: | ----: | ----: | ----: | ----: | ----: | -----: | -----: |
| gpu: run + copy (ms) | 0.052 | 0.075 | 0.128 | 0.257 | 0.633 | 1.179 | 2.381  | 3.340  |
| kernels only (ms)    | 0.035 | 0.051 | 0.088 | 0.164 | 0.398 | 0.833 | 1.812  | 2.516  |
| CPU loop (ms)        | 0.224 | 0.429 | 0.840 | 1.750 | 3.725 | 6.731 | 14.261 | 22.626 |

| 100 masks | gpu (ms) | kernels (ms) | CPU (ms) | CPU / gpu |
| --------- | -------: | -----------: | -------: | --------: |
| 768x416   | 3.340    | 2.516        | 22.626   | 6.8x      |
| 640x480   | 3.914    | 3.120        | 18.581   | 4.7x      |
| 768x576   | 4.585    | 3.812        | 28.889   | 6.3x      |

- **Probed `bling` through Kiln's executor.** Command:
  `node scripts/cuda-runner-smoke.mjs --kiln /Volumes/SSD/code/kiln --host manuel@bling.local --device-only --out …/pn/bling-device.json`.
  The script drives `apps/server/src/executors/cuda-runner.ts`, so the run exercised the real install step: the runner
  was copied as `~/.cache/kiln-runner/kiln_runner-2ca2cf1a04be49ea.py`, then `device` ran. The probe took 2365 ms,
  most of it the `nvcc` build of the device query. The report is in `various/pn/bling-device.json`:
  `NVIDIA GB10, cc 12.1, 48 SMs, 48 KiB shared memory per block, 100 KiB per SM, 65536 registers per SM,
  1536 threads per SM, clockMHz 2418, memClockMHz 8533, busBits 256, 121.7 GB, L2 24 MB, runtime and driver 13.0`,
  `maxSmClockMHz 3003`.
- **Built bench inputs** with `scripts/make-bench-recordings.sh /Volumes/SSD/data/factory-shots/sources
  /Volumes/SSD/tmp/kiln-002/bench-recordings`. It took 54 s of wall time, and the tree is 214 MB.
  - Layout: 4 synthetic cameras (`4b1e0c52-0000-4000-8000-00000000000a…d`, the left and right section tables on
    2026-09-21 and 2026-09-23), hours 2026-10-19 08–10 UTC, 12 segments of 6 s per hour, 144 segments in all.
  - `ffprobe` of one segment: `h264 1920x1080 24/1, 144 frames, duration 6.000000`. That is one keyframe per segment,
    the recorder's 1080p24 shape.
  - The footage shows people at work. It stays on the measurement hosts and in `/Volumes/SSD/tmp`, and never appears
    in a report.

### Why

- **Time the engine's entry points, not the kernels in isolation.** `gpu_ms` includes the pad, both kernels and the
  copy of the source-sized masks back to the host. That is what `_collect_with_slot` pays per frame. `kernel_ms` is
  reported separately so that the copy's share is visible: at 100 masks it is about 0.8 ms of 3.3 ms.
- **Synthetic camera ids, real footage.** `stage_bench_inputs.py` keeps only segments in which the service finds
  people, so synthetic video would stage nothing. The ids are made up so that nothing in the tree can be mistaken for
  a real Playback camera.

### What worked

- Bit-exactness held at all 24 timed points (0 differing pixels), on a different NVRTC (13.2.78) and a different CPU
  (Grace) from the Mac runs.
- The executor's install step behaved as designed: the runner is content-addressed on the host, and a second probe
  reuses the file.

### What didn't work

- Nothing failed in this step. One row is noisy: 640x480 with 1 mask reports `gpu_ms` 0.130 but `kernel_ms` 0.169,
  more than the wall-clock figure that contains it. It is the first row of a new geometry on a shared GPU. I report it
  as measured and use only the 100-mask rows for ratios.

### What I learned

- The GB10's CPU loop costs about 0.22 ms per mask at 768x416. The M1 Pro's cost 0.43–0.48 ms (Step 6). A Grace core
  is about twice as fast at this OpenCV loop, which shrinks the absolute saving on this host but does not reverse it.
- The GPU path's per-mask cost is about 0.033 ms at 768x416, including the copy: (3.340 − 0.052) / 99.

### What was tricky to build

- Getting the `dgx` worktree to a new commit without touching the main checkout. The sequence was a push to a side
  ref, then `git -C ~/code/worktrees/kiln-002 merge --ff-only kiln-002-incoming`.

### What warrants a second pair of eyes

- `dgx` numbers were taken beside a 10 % co-tenant load. They are an upper bound for an idle GB10, and they are
  comparable with each other because the co-tenants did not change during the run.

### What should be done in the future

- Repeat the timing on `bling` (idle GPU) once the redaction image is there, so the co-tenant effect has a number.
- C4: run `validate_on_host.sh` on the bench tree.

### Code review instructions

- `scripts/mask-post-cuda-time.py`: the CPU side must be the engine's own functions (`_unletterbox_mask`,
  `_smooth_mask`), and every timed GPU output is compared with the CPU output.
- `scripts/make-bench-recordings.sh`: the output layout must match what `stage_bench_inputs.py` walks.

### Technical details

- Timing command (on `dgx`):
  `docker run --rm --gpus all -v ~/code/worktrees/kiln-002/services/redaction:/w:ro -v ~/kiln-002:/k -w /w -e PYTHONPATH=/w -e PYTHONDONTWRITEBYTECODE=1 --entrypoint python3 playback-redaction:pb-obs-001-59c13eed4 /k/scripts/mask-post-cuda-time.py --out /k/out/mask-post-cuda-time-dgx.json`,
  bracketed by `{ date -Is; $Q; $G; } > ~/kiln-002/out/dgx-time-{before,after}.txt` with the two queries below.
- Co-tenant snapshot: `nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader` and
  `nvidia-smi --query-gpu=utilization.gpu,clocks.sm,clocks.max.sm,temperature.gpu,power.draw --format=csv,noheader`.

## Step 10: The kiln-perf image — the CUDA runner, launcher, a device probe and the fixtures in one container

The user asked for a Kiln/perf-only image. I built `kiln-perf` in Kiln `runner/docker/`. It contains what Kiln's CUDA
side needs on a GPU host and nothing else:

- `nvcc`, NVRTC and the CUDA runtime from NVIDIA's apt repository;
- Python with NumPy;
- the runner and the launcher;
- the launcher's five round-trip fixtures;
- a new device probe, `kiln-probe`, which measures the figures a Kiln target spec states.

The image is 1.05 GB unpacked and 356 MB compressed. Its default command runs the five fixtures and then the runner's
device report. On both GB10 hosts that passes 5 of 5, in 3.0 s on `bling`. A wrapper script lets an executor profile
use the image as its interpreter. Kernel times through the image equal the host's to within 1.7 %, and the device
report, host name included, is identical. Three things went wrong on the way, and each is recorded below.

### Prompt Context

**User prompt (verbatim):** "yeah, having a kiln/perf only image would be interesting, if possible"

**Assistant interpretation:** A small, reproducible container image for Kiln's GPU work. A fresh GPU host should then
need only a driver and Docker, which `bling` did not have when Step 8 started.

**Inferred user intent:** Make GPU hosts interchangeable for Kiln. The toolchain should travel with Kiln instead of
being installed by hand on each machine.

### What I did

- **Files** (`runner/docker/`, Kiln `3c71c0d`):
  - `Dockerfile`: `ubuntu:24.04`, NVIDIA's `cuda-keyring` for `sbsa` (arm64) or `x86_64` (amd64), then
    `cuda-nvcc-13-0 cuda-cudart-dev-13-0 cuda-nvrtc-dev-13-0 g++ python3 python3-numpy`. Optionally
    `cuda-nsight-compute-13-0` (`--ncu`). `/usr/local/cuda` is a symlink to the versioned toolkit. Labels record the
    Kiln revision and the runner's and launcher's SHA-256.
  - `build.sh`: stages a context (the runner, the launcher, the probe, the scripts, and fixtures generated fresh by
    `runtime/test/fixtures.mjs`) and builds it, locally or on a GPU host over SSH (`--host`). The default tag is
    `kiln-perf:<revision>[-dirty]-cuda<version>`, plus `kiln-perf:latest`.
  - `kiln-probe.cu` and the `kiln-probe` wrapper (below), `kiln-selftest` (the default command), `kiln-docker-python`
    (the executor wrapper), and `README.md`.
- **The probe.** `kiln-probe.cu` measures over 1 GiB buffers, so DRAM rather than L2 is measured. Every figure is a
  median and a best of 20 runs after one warm-up:
  - device-to-device `cudaMemcpy`, counted as read plus written bytes;
  - a 16-byte-load read kernel and a 16-byte-store write kernel;
  - an FP32 FMA kernel with 8 independent chains per thread;
  - pinned host-to-device and device-to-host copies;
  - empty-kernel launches in three forms: one launch between two CUDA events (`eventUs`, which is how
    `kiln_runner.py` times a kernel and therefore what a target's `launchUs` should predict), 1000 launches back to
    back, and launch plus synchronise.

  The `kiln-probe` wrapper compiles the probe with `-arch=native` into the runner's cache. It adds the toolkit version
  and `nvidia-smi` snapshots before and after, and emits `spec`, a `SPECS`-shaped object holding the measured figures.
- **Checked the probe natively on `bling`** before packaging it (`nvcc -O3 -arch=native`, `--quick`): read 255 GB/s,
  FMA 28.9 TFLOP/s, 1.9 µs per launch back to back.
- **Built on both hosts** with `runner/docker/build.sh --host manuel@bling.local` (76 s cold) and
  `--host playback@dgx` (37 s). The final images are `kiln-perf:3c71c0d-cuda13.0` on both. `nvcc` reports
  `release 13.0, V13.0.88`; NumPy is 1.26.4.
- **Self-test** (`docker run --rm --gpus all kiln-perf:latest`) passes on both hosts:

| Fixture      | max \    | Δ\       |          | `bling` build | `dgx` build | `dgx` first run |
| ------------ | -------: | -------: | -------: | ------------: | ----------- | --------------- |
| attention    | 8.94e-08 | 406.9 ms | 346.9 ms | 0.2 ms        |             |                 |
| blur-2d-grid | 0        | 184.4 ms | 228.2 ms | 93.1 ms       |             |                 |
| blur-small   | 0        | 177.3 ms | 214.5 ms | 1.0 ms        |             |                 |
| grey-u8      | 0        | 184.3 ms | 215.5 ms | 2.4 ms        |             |                 |
| mlp          | 2.12e-07 | 213.8 ms | 323.5 ms | 0.1 ms        |             |                 |

  `blur-2d-grid` runs in 48.9 ms on `bling` and 93.1 ms on `dgx`. It is a 4096 x 4096 bandwidth-bound blur, and the
  difference is the co-tenant load on `dgx`.
- **Probed both hosts**, three runs each, with
  `docker run --rm --gpus all --pid host --hostname "$(hostname)" kiln-perf:latest kiln-probe --id gb10 --name "DGX Spark (GB10)"`.
  Evidence: `various/perf-image/probe-{bling,dgx}-{1,2,3}.json`.

| Figure (range of 3 medians)   | `bling`, idle      | `dgx`, 7 co-tenants (8399 MiB, 17–26 %) |
| ----------------------------- | -----------------: | --------------------------------------: |
| read, median (GB/s)           | 258.0–258.2        | 205.6–209.4                             |
| read, best (GB/s)             | 258.6–259.2        | 235.8–237.4                             |
| device-to-device copy (GB/s)  | 240.9–243.1        | 187.5–207.1                             |
| write (GB/s)                  | 195.8              | 173.1–177.4                             |
| FMA, median (TFLOP/s)         | 28.92              | 27.83–28.77                             |
| FMA, best (TFLOP/s)           | 28.92–28.93        | 30.00–30.17                             |
| host to device, back (GB/s)   | 59.0, 58.9         | 56.2–59.1, 56.5–59.9                    |
| empty kernel, events (µs)     | 2.37–2.40          | 2.30–2.37                               |
| 1000 back to back, per launch | 2.0 µs (host 1.77) | 2.05 µs (host 1.76–1.80)                |
| launch + synchronise (µs)     | 4.91–4.93          | 4.82–4.85                               |
| SM clock after the run (MHz)  | 2411               | 2431–2515                               |

- **Used the image as the runner's interpreter.** I installed `kiln-docker-python` as
  `/home/manuel/.local/bin/kiln-docker-python` on `bling`, ran the runner's `device` subcommand through it, and then
  ran the whole smoke test of Step 11 through it (`--python /home/manuel/.local/bin/kiln-docker-python`).
  - All 18 kernels agree with the reference.
  - Kernel medians match the native run within 1.7 % (largest: W-28 direct, 8 masks, 2704.9 vs 2658.3 µs).
  - Register counts are identical; the host has the same `nvcc` 13.0.88.
  - The device report is identical, `hostname` included.
  - Each invocation costs 0.1–0.5 s more wall time, for `docker run` start-up.

### Why

- **Ubuntu plus four NVIDIA packages, not `nvidia/cuda:*-devel`.** The devel images carry the whole toolkit
  (several GB). The runner needs `nvcc` and the runtime, and the launcher needs NVRTC. 1.05 GB is mostly `nvcc`'s
  back end.
- **Generate the fixtures at build time, outside Docker.** They come from Kiln's compiler and need the pnpm
  workspace. Staging them in `build.sh` keeps the Dockerfile to copies and lets the context build on a host that has
  no Node.
- **`eventUs` is the launch figure for `launchUs`.** The cost model adds `launchUs` to each kernel's time and is
  compared with what the runner measures, which is one launch between two events. Back-to-back figures measure
  something else: how fast the host can submit.
- **The wrapper keeps the executor's runner, not the image's.** The executor content-addresses the runner it copies,
  so a server and its runner stay paired. The image supplies only the toolchain.

### What worked

- One Dockerfile for both architectures: BuildKit's `TARGETARCH` picks NVIDIA's `sbsa` or `x86_64` repository. Only
  arm64 was built today.
- The probe's figures repeat to within 0.1 % on an idle GB10 (FMA 28.92 three times; read 258.0–258.2).

### What didn't work

- **AppleDouble files in the context.** The first self-test failed with
  `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xa3 in position 45: invalid start byte`, raised from
  `check_fixtures` reading `/opt/kiln/fixtures/._attention.expect.json`. macOS `tar` adds a `._<name>` file for every
  file with extended attributes, and the launcher's `glob("*.program.json")` matches dot files.
- **The fix exposed a second macOS tar behaviour.** With `COPYFILE_DISABLE=1`, tar writes the extended attributes as a
  pax header in front of the first entry, and the build failed with
  `ERROR: failed to build: failed to solve: dockerfile line greater than max allowed size of 65535`.
  `docker build -` had read the stream as a Dockerfile instead of a tar context. The stream's first bytes showed
  `PaxHeader/curren…` with `COPYFILE_DISABLE=1` alone, `._.` without it, and `./` with `--no-xattrs` as well.
  - Final form: `COPYFILE_DISABLE=1 tar --no-xattrs`, unpacked into a `mktemp -d` directory on the host. `docker
    build` then runs on that directory, so nothing depends on how Docker sniffs stdin.
  - Files in the image were also owned by uid 502, from the tar; `COPY --chown=0:0` fixes that.
- **Co-tenants are invisible in a container.** On `dgx` the probe reported `computeApps: []` while seven processes
  held 8.4 GB. `nvidia-smi` in a container lists only its own PID namespace, so an empty list claimed an idle GPU.
  With `--pid host` it lists all seven. The probe now reports `null` (unknown) when PID 1 is not the machine's init,
  and the README says to pass `--pid host`.
- **The image size differs between the two hosts.** `docker images` reports 1.41 GB on `bling` and 1.05 GB on `dgx`
  for the same image. `bling` runs Docker 29.6 with the containerd image store, which counts the compressed blobs
  (356 MB, from `docker image inspect --format {{.Size}}`) as well as the unpacked layers. `dgx` runs Docker 29.2
  with `overlay2`, which counts the unpacked layers only.

### What I learned

- On a shared GPU, read bandwidth is the figure that moves. Medians fall 19 %, while the FMA rate and launch costs
  barely change. `dgx`'s best FMA rate is 4 % higher than `bling`'s because its SM clock ran higher (2.43–2.52 GHz
  against 2.41 GHz). The two machines are different products: `/sys/class/dmi/id` names `bling` an NVIDIA
  `NVIDIA_DGX_Spark` and `dgx` an ASUSTeK `GX10`, and both report the same 3003 MHz maximum SM clock.
- A container's host name is part of the runner's device identity. Without `--hostname`, the device report from
  `docker run` carried `1c1f810cc051`.

### What was tricky to build

- The executor shell-quotes `python` (`shq`), so `~/.local/bin/kiln-docker-python` would never expand. The profile
  needs an absolute path, and the wrapper's comment and the README both say so.

### What warrants a second pair of eyes

- `kiln-docker-python` mounts `~/.cache/kiln-runner` read-write into a container that runs code sent by the Kiln
  server. That code already runs on the host without the image; the container adds `--network none` and the caller's
  uid, so it is strictly narrower, but it is not a sandbox.
- Only the arm64 image was built. The amd64 path is the same Dockerfile with NVIDIA's `x86_64` repository and is
  untested.

### What should be done in the future

- Build and self-test on the RTX PRO 6000 host (amd64) once access is given.
- Publish the image somewhere both hosts can pull, so that `build.sh` is not run per host.

### Code review instructions

- `runner/docker/build.sh`: the remote branch (tar flags, temporary directory, exit code).
- `runner/docker/kiln-probe`: `host_pid_namespace()`, and that `computeApps` stays `null` rather than `[]`.
- `runner/docker/kiln-probe.cu`: the read kernel's guard store, which keeps the loads from being removed.
- Reproduce: `runner/docker/build.sh --host <gpu host>`, then `docker run --rm --gpus all kiln-perf:latest`.

### Technical details

- Images: `kiln-perf:3c71c0d-cuda13.0` (`bling` and `dgx`), labels `kiln.runner.sha256 94e24ca5…`,
  `kiln.launcher.sha256 94a0f717…`.
- Logs: `/Volumes/SSD/tmp/kiln-002/perf-image/build-*.log`; evidence in `various/perf-image/`.

## Step 11: PN steps 1–2 — a measured gb10 target, u8 inputs in the runner, and the runner's first smoke test on a GB10

This step ran guide §24's PN steps 1 and 2 on `bling`. Step 2 first: Kiln had no spec for a GB10. `cudaTarget()`, which
turns a runner's device report into the target the compiler optimises for, therefore gave a GB10 the RTX 5090's
spec, at 1792 GB/s, seven times the measured bandwidth. I added `gb10` to `SPECS` from Step 10's probe, with a test
that pins the lookup. Then step 1, the smoke test. W-26 passed at all 12 sizes. W-28's first kernel was refused by the
runner itself: its harness generated only float inputs, and that kernel takes the u8 mask. I added u8 inputs to the
runner, after which all 18 kernels agree with the reference, and the four u8 kernels bit for bit. Running the same
programs compiled for the old fallback shows what the spec changes: four W-28 kernels get different schedules, and
`gb10`'s run in 4674 µs against the fallback's 9816 µs. The comparison also shows a gap in Kiln's model. For W-28 it
predicts times 7–115 times too long, because it charges a resampling gather as uncoalesced DRAM traffic.

### Prompt Context

**User prompt (verbatim):** see Step 8; this is PN from the guide's §24 plan, which the user asked to implement.

**Assistant interpretation:** Run Kiln's CUDA executor end to end against a GB10, and give Kiln a target for it, with
evidence that the target improves the compiler's choices.

**Inferred user intent:** Know whether Kiln's predictions and schedules can be trusted on the hardware Playback ships
on.

### What I did

- **The `gb10` spec** (`packages/kiln/src/std/targets.js`, Kiln `3c71c0d`):
  `sm: 121, sms: 48, clockGHz: 2.418, peakTflops: 28.9, bwGBs: 259, l2MB: 24, smemPerSM: 100 KiB, smemPerBlock:
  48 KiB, maxThreadsPerBlock: 1024, maxThreadsPerSM: 1536, maxBlocksPerSM: 24, regsPerSM: 65536, launchUs: 2.4`.
  A comment marks the entry as measured rather than public, and names the probe and the date.
  - `packages/kiln/test/targets.mjs` (new) checks four things: a cc 12.1 report gets `gb10`; cc 12.0 gets `rtx5090`;
    an unknown capability falls back with the report's SM count; and no two specs share a capability (`cudaTarget`
    takes the first match). Before the change, its first check fails on `SPECS.gb10` being undefined.
  - The agent's device list now names `sim:gb10`, because `devices.js` makes one simulated device per spec.
  - Tests: `pnpm --filter @kiln/kiln test`, all 13 passed; `pnpm --filter @kiln/workbench test`, all 6 passed (7
    skipped by the package's own script).
- **Smoke test, first run** (native Python and `nvcc` on `bling`):
  `node scripts/cuda-runner-smoke.mjs --kiln /Volumes/SSD/code/kiln --host manuel@bling.local --target gb10 --out …/smoke-bling-native.json`.
  Result: `18 kernels, 14 agree with the reference`. Every W-26 kernel passed. Each W-28 `k_ew` failed with
  `ERROR 8-bit (u8) inputs are not supported by this runner yet`, which `run_kernel` raises before compiling.
- **u8 inputs in the runner** (`runner/kiln_runner.py`, Kiln `3c71c0d`).
  - The workbench's reference (`kernelInputs`) draws a u8 input as `Math.floor(r() * 256)`, where `r()` is the
    mulberry32 value divided by 2^32. That is exactly the value's top byte.
  - The harness's generator now takes a per-input `u8` flag and stores `(uint8_t)(r >> 24)`. It keeps the inputs as
    `void*` and casts each at the launch to the kernel's parameter type (`const unsigned char*` or `float*`).
  - Dtypes other than `f32` and `u8` are refused by name.
  - The runner's content hash changed (`kiln_runner-94e24ca53607da15.py`), so the executor installed the new file on
    the next run without being told to.
- **Smoke test, second run:** `18 kernels, 18 agree with the reference`. The W-28 `k_ew` kernels report
  `max |d| 0.00e+0, 0/384 bad`. The probe took 973 ms. The run used no other GPU processes: the before and after
  snapshots list none, with utilisation 0 %.
- **The same smoke test through the image** (`--python /home/manuel/.local/bin/kiln-docker-python`): 18 of 18, with
  the medians within 1.7 % of the native run (Step 10).
- **Compared with the old fallback.**
  - I added `--target fallback` to the smoke script: `{ ...SPECS.rtx5090, sms: device.sms, smemPerBlock:
    device.smemPerBlock }`, which is exactly what `cudaTarget` returned for a GB10 before `gb10` existed.
  - I ran the smoke test with it (18 of 18 agree) and wrote `scripts/gb10-spec-check.mjs`. The script recompiles every
    case under both specs, checks that the results' schedules are the ones the specs choose, and puts each spec's model
    estimate (`tile.js` `estimate`) beside the runner's median.
  - Output: `various/pn/gb10-spec-check.md` and `.json`. Per-kernel times (µs) below are runner medians of 20
    repetitions.

| Case                         | Kernel          | gb10 schedule            | gb10 model | measured | fallback schedule   | fallback model | measured |
| ---------------------------- | --------------- | ------------------------ | ---------: | -------: | ------------------- | -------------: | -------: |
| W-26 256 × 256               | k_matmul_reduce | tiled 32×16, TN=2        | 11.9       | 16.5     | same                | 11.1           | 16.6     |
| W-26 1024 × 768              | k_matmul_reduce | tiled 128×64, TM=8 TN=4  | 204        | 265      | same                | 205            | 265      |
| W-26 2304 × 768              | k_matmul_reduce | tiled 128×128, TM=8 TN=2 | 936        | 930      | same                | 939            | 931      |
| W-28 768x416, 8, separable   | k_ew            | TPB=1024                 | 1384       | 60.4     | same                | 202            | 59.6     |
| W-28 768x416, 8, separable   | k_ew_2          | TPB=128                  | 1292       | 62.5     | TPB=1024            | 189            | 77.8     |
| W-28 768x416, 100, separable | k_ew            | TPB=128, COARSEN=2       | 31088      | 696      | TPB=1024, COARSEN=2 | 4495           | 862      |
| W-28 768x416, 100, separable | k_ew_2          | TPB=1024                 | 29015      | 1210     | TPB=1024, COARSEN=2 | 4196           | 1047     |
| W-28 768x416, 8, direct      | k_ew            | TPB=1024, COARSEN=2      | 17805      | 2705     | TPB=1024            | 2576           | 7828     |
| W-28 768x416, 100, direct    | k_ew            | TPB=64                   | 400559     | 3482     | same                | 57895          | 3479     |

  (`various/pn/gb10-spec-check.md` has all 18 rows. The 12 W-26 kernels get the same schedule under both specs.)

- **Results of the comparison:**
  - **Schedules.** 4 of 18 kernels, all W-28, get different schedules. Measured over those four, `gb10`'s take
    4674 µs and the fallback's 9816 µs. `gb10`'s is faster in three; the fallback's is faster in one (100 masks,
    `k_ew_2`, 1047 vs 1210 µs). The largest difference is W-28 direct at 8 masks: 2705 against 7828 µs.
  - **Ranking.** For each of the four, I asked whether a spec's model ranks the two schedules the way the GPU does.
    `gb10`'s model agrees in 3 of 4; the fallback's model agrees in 1 of 4.
  - **Absolute accuracy, W-26.** Measured/modelled ranges from 0.98 to 1.43 under both specs (geometric mean 1.20).
    The model is within 30 % of the GPU and pessimistic nowhere.
  - **Absolute accuracy, W-28.** Under `gb10` the model predicts 6.6–115 times the measured time; under the fallback,
    0.3–16.6 times.
- **Why the model is wrong about W-28.** I printed `estimate()`'s parts for W-28 separable at 8 masks under `gb10`:
  - `k_ew`: `{"dram":497.4,"l2":1381.6,"compute":2.2,"issue":4.5}`, bound by L2.
  - `497.4 µs` of DRAM time at 259 GB/s is 129 MB of traffic. The kernel's essential traffic is the 3.28 MB u8 input
    (8 × 640 × 640) plus the 10.2 MB f32 output (8 × 416 × 768 × 4): 13.5 MB, or 52 µs at 259 GB/s. The GPU takes
    60.4 µs, close to that bound.
  - `estimate()` charges each input access by `sectorsFor(stride)` of the flattened index with respect to the last
    loop variable. The resampling index goes through an integer division (`(e / 768) % 416` and the scale), so its
    stride is not a constant, and every tap is charged as one 32-byte sector per thread. Neighbouring threads in fact
    read neighbouring input pixels, and the 3.28 MB input stays in the 24 MB L2.

### Why

- **Measure the fallback rather than argue about it.** "Seven times the bandwidth" says the model's numbers are
  wrong. It does not say whether the chosen schedules are worse, which is the only part that reaches the GPU. Running
  both sets of schedules answers that.
- **Fix u8 in the runner, not in the smoke script.** W-28 is a u8 program, and Playback's mask post-processing is the
  reason Kiln has u8 inputs at all. The launcher already handled them (`grey-u8`), so the runner was the one component
  that could not measure the program the ticket is about.

### What worked

- The executor's content-addressed install: a changed runner reached the host without any manual step.
- The u8 generator matched the reference exactly at the first attempt. The proof is W-28's zero difference, since that
  kernel's output is a pure function of the u8 input.

### What didn't work

- The first smoke run (W-28 u8 refused); quoted above.
- Kiln's model on W-28 (above). It is not fixed in this ticket: `sectorsFor` and the stride analysis are shared by
  every kernel, and a change there needs its own evidence across the presets.

### What I learned

- Two specs with the same SM count and shared memory choose the same tiled matmul schedules. For W-26 the bandwidth
  term never changes the decision, so a wrong spec costs nothing there.
- For elementwise and gather kernels the bandwidth term decides the block size. That is where the spec matters, and
  also where the model's gather accounting is weakest.
- `launchUs` dominates the model at small sizes: W-26 256 × 256 is modelled at 11.9 µs, of which 2.4 µs is launch,
  and measures 16.5 µs.

### What was tricky to build

- Making sure the comparison compared what was measured. `gb10-spec-check.mjs` recompiles every case and refuses to
  continue if a schedule differs from the one recorded in the smoke result (`the results were compiled differently`).
  Without that check, a change to the compiler between the measurement and the analysis would silently pair the wrong
  numbers.

### What warrants a second pair of eyes

- `bwGBs: 259` is the best read rate, not a public figure. The theoretical 273 GB/s would be the convention of the
  other entries. I chose the measured value because Kiln compares its model with measurements, and the comment says
  so.
- The fallback ranking result rests on four kernels from one program. It is evidence that the spec matters, not a
  general accuracy figure.

### What should be done in the future

- Model a gather whose index is a monotone function of the thread index as coalesced, and count the reuse of an input
  that fits in L2. Validate it on W-28 and on the presets without gathers.
- Run the same smoke test on the RTX PRO 6000 host with an `rtxpro6000` spec, measured with `kiln-probe`.

### Code review instructions

- `runner/kiln_runner.py`: `gen()` (the `r >> 24` byte) and the `args` cast list.
- `packages/kiln/src/std/targets.js` `gb10`, and `packages/kiln/test/targets.mjs`.
- `scripts/gb10-spec-check.mjs`: the schedule-identity check before any number is used.
- Reproduce: `node scripts/cuda-runner-smoke.mjs --kiln … --host <gb10 host> --target gb10 --out a.json`, the same
  with `--target fallback --out b.json`, then `node scripts/gb10-spec-check.mjs --kiln … a.json b.json`.

### Technical details

- Evidence: `various/pn/smoke-bling-{native,docker,fallback}.{json,log}`, `various/pn/smoke-bling-native-{before,after}.txt`,
  `various/pn/gb10-spec-check.{md,json}`.
- Runner on `bling`: `~/.cache/kiln-runner/kiln_runner-94e24ca53607da15.py`; build cache for the image runs in
  `~/.cache/kiln-runner/build`.

## Step 12: C4 on the DGX Spark — correct but 3 % slower; the branch's own image, the stage timed on an idle GB10, and a correction to Step 11's spec result

This step ran C4: the C3 branch as a whole service on a GB10, against its own baseline. It ran on `bling`, the idle
DGX Spark, so that no co-tenant shares the GPU with either arm. `bling` had no Playback image, and the shared host
`dgx` could not send one quickly: its uplink measured 0.23 MB/s. So the image was built on `bling` from a git bundle
of the branch. In that image the mask-post tests pass 25 of 25. The timing script reproduces `dgx`'s numbers with 0
differing pixels, and it is 5–32 % faster from 16 masks up, which is the bandwidth gap between the two hosts.
`validate_on_host.sh` then ran with `REDACTION_MASK_POST=kiln` on the candidate arm only. Every correctness gate
passed. Throughput did not: the candidate is 2.6–3.2 % slower at concurrency 1, 4 and 8, with all 12 paired ratios
below 1, so `gb10-unchanged-or-better` is refuted. A second, shorter run that kept each arm's stage timers shows why
in outline. The post-pass gets 1 ms per frame cheaper, as designed, but the preprocess step, which sets the pace and
which the switch does not touch, takes 3 ms per frame longer.

The same step also corrects Step 11. Step 11 compared the measured `gb10` spec with the fallback a GB10 used to
receive, the RTX 5090's figures with 48 SMs, and found `gb10`'s schedules faster. The shipped program set, however,
was exported for the full RTX 5090 spec with 170 SMs. Running those schedules too shows that they are faster than
`gb10`'s on the GB10: 2,190 against 4,734 µs over the five W-28 kernels that differ. The measured spec makes the
model's numbers right for W-26 without making its choices better. The shipped set stays as exported.

### Prompt Context

**User prompts (verbatim):** see Step 8 for the prompts that asked for the host work, the report amendment and the
thorough report; no new prompt arrived during this step.

**Assistant interpretation:** Finish C4 on a GB10, measure what Step 11 left implicit (the schedules the shipped set
actually uses), and fold both into the diary and the amended reports.

**Inferred user intent:** A report whose claims survive a reviewer who checks them against the hardware, including
the claims that turned out less favourable than first written.

### What I did

- **Moving the image.** The C3 image is the production redaction image (`nvcr.io/nvidia/pytorch:26.05-py3`, 90
  layers, 24.5 GB on `dgx`) with the branch's source on top.
  - On `bling` I pulled the NGC base by digest and started a local registry (`registry:2`, `127.0.0.1:5000`, data in
    `~/kiln-002/registry`). I pushed the base into it as `localhost:5000/playback-redaction:base-26.05`: 77 layers,
    10.9 GB compressed. The registry's manifest lists the base's largest layers at 3.0 and 2.3 GB.
  - Two SSH tunnels joined the hosts through the Mac: `ssh -N -L 15000:localhost:5000 manuel@bling.local` and
    `ssh -N -R 5000:localhost:15000 playback@dgx`. `dgx` then saw `bling`'s registry at `localhost:5000`
    (`{"repositories":["playback-redaction"]}`).
  - `docker push localhost:5000/playback-redaction:pb-obs-001-59c13eed4` on `dgx` found 61 layers already present
    and pushed 13. It still took **16 min 39 s**, because the link from `dgx` measured 0.23 MB/s (20 MB of
    `/dev/urandom` over SSH), against 10.9 MB/s from the Mac to `bling`. The upload into the registry ran at
    557 KiB/s.
- **Building on `bling` instead.** While the push crawled, I built the branch where the GPU is.
  - `git bundle create playback-c3.bundle perf/kiln-002-redaction-mask-post` (45.7 MB, 1.7 s), copied to `bling`,
    cloned to `~/code/playback-kiln-002` at `ac835daa`. The bundle carries `d1faf0cf1`, the baseline.
  - `docker build -t playback-redaction:kiln-002-ac835daa --build-arg GIT_SHA=ac835daa … services/redaction`.
    The base came from the local pull. Two stages dominated: there is no vendored mmcv wheel for aarch64, so mmcv
    2.1.0 compiled from source (117.7 s, a 41 MB wheel), and the RTMDet-Ins-M checkpoint downloaded from
    openmmlab.com at about 300 KB/s (344.6 s for 105 MB). The image is 11.3 GB.
  - The `dgx` push finished afterwards (rc 0). It is not used; the tag stays in `bling`'s registry.
- **Bench inputs.** `bling` has no recordings either. `scripts/make-bench-recordings.sh` (Step 9) had cut the
  section-table videos into the recorder's layout, 144 segments, 215 MB. I copied them with
  `COPYFILE_DISABLE=1 tar --no-xattrs -cf - bench-recordings | ssh manuel@bling.local 'tar -C ~/kiln-002 -xf -'`
  (18 s). They contain real factory footage and stay on the hosts and in `/Volumes/SSD/tmp`.
- **The tests in the branch's image.** The image has no pytest, so the run installs it first:
  `docker run --rm --gpus all -v $S:/w:ro -w /w -e PYTHONPATH=/w --entrypoint sh playback-redaction:kiln-002-ac835daa -c "pip install -q pytest; python3 -m pytest -p no:cacheprovider -q -rs tests/test_mask_post.py"`.
  Result: `25 passed, 1 warning in 5.74s` (the warning is pytest's unknown `asyncio_mode` option). No other process
  used the GPU before or after.
- **The stage timed on `bling`.** Same script and mounts as on `dgx` (Step 9), in the new image:
  `… --entrypoint python3 playback-redaction:kiln-002-ac835daa /k/scripts/mask-post-cuda-time.py --out /k/out/mask-post-cuda-time-bling.json`.
  0 differing pixels over 24 rows × 15 repetitions. CUDA init 0.36 s, NVRTC compile of 24 programs 1.50 s,
  `load()` 1.52 s.

| Geometry | Masks | `dgx` kiln + copy (ms) | `bling` kiln + copy (ms) | `dgx` / `bling` | `bling` CPU loop (ms) | `bling` CPU / kiln |
| -------- | ----: | ---------------------: | -----------------------: | --------------: | --------------------: | -----------------: |
| 768x416  | 1     | 0.052                  | 0.055                    | 0.95            | 0.219                 | 4.0                |
| 768x416  | 16    | 0.633                  | 0.481                    | 1.32            | 3.203                 | 6.7                |
| 768x416  | 100   | 3.340                  | 3.098                    | 1.08            | 19.147                | 6.2                |
| 640x480  | 100   | 3.914                  | 2.985                    | 1.31            | 16.364                | 5.5                |
| 768x576  | 100   | 4.585                  | 4.285                    | 1.07            | 27.996                | 6.5                |

- **The service A/B.** From the clone on `bling`:
  `services/redaction/scripts/validate_on_host.sh --image playback-redaction:kiln-002-ac835daa --recordings ~/kiln-002/bench-recordings --baseline d1faf0cf1 --candidate-env REDACTION_MASK_POST=kiln --out ~/kiln-002/c4-validate`
  (defaults: concurrency 1,4,8; 4 pairs; burst 12). It ran 19:11–19:37 UTC (26 min), with nothing else on the GPU.
  - Preflight and identity: aarch64, 20 CPUs, kernel `7.0.0-1019-nvidia`, GB10 driver 580.178.04, TensorRT
    10.16.1.11, torch `2.12.0a0+5aff3928d8.nv26.05`. Both arms `backend=trt`; arm B `mask_post=kiln`.
  - Staging: 36 segments probed, 8 with people (3–6 persons, 1920x1080, 144 frames), 0 empty.
  - Gate a (serial): baseline rendered 3 times for the noise floor (3 of 3 segments differ run to run, worst frame
    2,272 px, tolerance 9,088 px). Candidate: 3 of 3 inside, worst loss 2,072 px. `NO REGRESSION`.
  - Gate b (concurrency 4 against serial): 3 of 3 inside, worst loss 2,272 px.
  - Gate c (soak): two bursts of 24 at concurrency 8, `ok=24 errors=0 shed=0`, 126.5 and 127.4 frames/s; post-soak
    inside the floor; `in_flight` back to 0.
  - Ground truth: both arms recall 0.9636, F2 0.9424, 29 detections. **This gate does not exercise the GPU path:**
    `score_against_ground_truth.py` calls `infer_frame` on the five fixtures at native size (1152×768, 1536×1024,
    1448×1086, 1536×1024, 1402×1122), none of which is a compiled geometry, so `supports()` is false and arm B uses the
    CPU loop.
  - Controller: both arms at rung 30; 4 cameras 95.20 / 95.20 frames/s, 8 cameras 191.20 / 192.00.
  - Throughput (median of 4 paired ratios): concurrency 1 76.47 → 74.34 frames/s, 0.974 (0.952–0.984);
    concurrency 4 129.25 → 125.48, 0.971 (0.959–0.974); concurrency 8 129.77 → 125.19, 0.968 (0.957–0.983).
  - The script printed `VALIDATION PASSED`: it gates correctness and the controller, and only prints throughput.
- **Why it is slower: a second run with the stage timers.** The arms log a `metric:segment_timing` line per render,
  and the validation script removes the containers at the end. `scripts/c4-diag.sh` (new, run on `bling`) starts both
  arms with `start_arm`'s exact mounts and environment, runs `bench_ab.py --conc 1,4 --pairs 2`, and saves both logs.
  It reproduced the result (0.963 at concurrency 1, 0.956 at 4). Medians per frame over 38 renders per arm,
  concurrency 1 and 4 mixed:

| ms per frame                  | Baseline | Candidate | Change |
| ----------------------------- | -------: | --------: | -----: |
| `infer_preprocess`            | 20.10    | 23.18     | +3.08  |
| `infer_forward`               | 2.84     | 2.66      | −0.18  |
| `infer_decode` + `infer_post` | 4.00     | 2.97      | −1.03  |
| `infer_busy`                  | 7.05     | 5.58      | −1.47  |
| wall                          | 28.18    | 30.04     | +1.86  |

  - `infer_preprocess` + `infer_busy` is 97 % of the wall in both arms: the inference worker sets the pace.
  - `preprocess_s` is measured in `submit_frame` after the slot is acquired (`t0` follows `self._pool.get()`): the CPU
    letterbox into pinned memory and the enqueue of the upload, normalisation and forward on the slot's stream. That
    code is the same in both arms, so its extra 3 ms is waiting on something shared within the process.
  - Start-up, from arm B's log: `kiln mask post ready: 24 programs compiled in 1.5s, checked against the CPU loop in
    1.3s`; `TRT engine ready in 3.5s` against arm A's 0.7 s.
- **The shipped set's schedules, measured.** `mask_post.json` was exported with `--target rtx5090` (Step 6), and its
  768x416 kernels at 8 and 100 masks are `TPB=64` in both passes. Step 11 had not timed those. I ran
  `cuda-runner-smoke.mjs --target rtx5090` on `bling` (18 of 18 agree) and generalised `gb10-spec-check.mjs` with
  `--other <spec>` so it can compare `gb10` with any spec, not just the fallback.

| W-28 kernel (768x416)        | `gb10`              | µs   | fallback (48 SMs)   | µs   | `rtx5090` (170 SMs) | µs   |
| ---------------------------- | ------------------- | ---: | ------------------- | ---: | ------------------- | ---: |
| 8 masks, separable, pass 1   | TPB=1024            | 60.4 | TPB=1024            | 59.6 | TPB=64              | 50.3 |
| 8 masks, separable, pass 2   | TPB=128             | 62.5 | TPB=1024            | 77.8 | TPB=64              | 59.4 |
| 100 masks, separable, pass 1 | TPB=128, COARSEN=2  | 696  | TPB=1024, COARSEN=2 | 862  | TPB=64              | 738  |
| 100 masks, separable, pass 2 | TPB=1024            | 1210 | TPB=1024, COARSEN=2 | 1047 | TPB=64              | 1064 |
| 8 masks, direct              | TPB=1024, COARSEN=2 | 2705 | TPB=1024            | 7828 | TPB=64              | 279  |
| 100 masks, direct            | TPB=64              | 3482 | same                | 3479 | same                | 3483 |

- **What the `rtx5090` comparison says** (`various/pn/gb10-spec-check-rtx5090.md`):
  - 11 of 18 kernels get different schedules (6 W-26, 5 W-28). Over those, `gb10`'s take 6,308 µs and `rtx5090`'s
    3,705 µs. Without the direct form at 8 masks (2,705 against 279 µs), 3,603 against 3,426 µs.
  - Ranking: `rtx5090`'s model orders the two schedules as the GPU does in 8 of 11; `gb10`'s in 3 of 11.
  - W-26: `rtx5090`'s tiles take 2.5–7 % less time at 1,024 and 2,048 windows and 38–48 % more at 256 windows.
  - Absolute accuracy, measured / modelled: W-26 `gb10` 0.98–1.43 (geometric mean 1.20), `rtx5090` 2.53–4.03 (3.10);
    W-28 `gb10` 0.01–0.15 (0.04), `rtx5090` 0.06–0.31 (0.17).
  - The fallback and `rtx5090` specs differ only in `sms` (48 against 170): both have `smemPerBlock` 48 KiB. So every
    schedule that differs between those two columns differs because of the SM count.
- **Figures** (`scripts/gb10-figures.py`, new): `timing` draws ms per frame against masks per frame for one or more
  hosts; `spec` draws modelled against measured per spec; `schedules` draws each spec's measured time relative to the
  fastest of them. Output: `various/figures/c4-timing-gb10.png`, `pn-spec-check-gb10.png`, `pn-schedules-gb10.png`.

### Why

- **Build where the GPU is.** The image's unique layers above the NGC base are small (the source, a 111 MB model layer,
  the wheels), but a push from `dgx` still has to move them at 0.23 MB/s and verify the rest. The build needed only the
  base, which `bling` pulls from NGC directly, and the branch, which is 46 MB as a bundle.
- **C4 on `bling`, not `dgx`.** `dgx` runs seven production model processes. `validate_on_host.sh` starts two arms that
  each build a TensorRT engine and then load the GPU for minutes; on `dgx` that would disturb the factory-live stack
  and the stack would disturb the measurement.
- **Time the shipped schedules.** Step 11's question was "does the measured spec help?". The question that matters for
  Playback is "would re-exporting the set for `gb10` help?", and that needs the schedules the set already has.

### What worked

- The bundle-and-build route: 1.7 s to bundle, seconds to copy and clone, and build steps totalling about 13.5 minutes,
  more than half of it the checkpoint download (344.6 s) and the mmcv compile (117.7 s).
- Every correctness check on the second host: 25 of 25 tests, 0 differing pixels in the timing run, and gates a–c of
  `validate_on_host.sh`.
- Paired measurement: the two runs, 20 minutes apart, agree on the direction and roughly on the size (−2.6 to −3.2 %
  and −3.7 to −4.4 %).

### What didn't work

- `docker run … --entrypoint python3 playback-redaction:kiln-002-ac835daa -m pytest …` failed with
  `/usr/bin/python3: No module named pytest`. On `dgx` the same mistake had been avoided by installing pytest in the
  container (Step 8); the production image does not ship test dependencies.
- `scp manuel@bling.local:'kiln-002/out/{a,b,c}'` failed with `No such file or directory`: the brace list was not
  expanded on the remote side. `ssh … tar cf - … | tar xf -` worked.
- Waiting with `sleep 45; ssh …` was blocked by the harness, which asks for a background command instead; the waits
  in this step are `while kill -0 <pid>; do sleep 15; done` loops run in the background.
- The hypothesis `gb10-unchanged-or-better`: refuted (above).
- `python3 scripts/parse_segment_timing.py --help` does not print usage; it opens `--help` as a log file
  (`FileNotFoundError: [Errno 2] No such file or directory: '--help'`). The module docstring documents the usage.

### What I learned

- Step 11's conclusion was true but incomplete. The measured spec beats the fallback that a GB10 used to receive; it
  does not beat the spec the shipped set was exported for. A cost model can be calibrated in its absolute numbers and
  still rank schedules worse, because ranking depends on terms that calibration does not touch: here the SM count and
  the gather accounting.
- With 170 SMs the model prefers 64-thread blocks for W-28, and those are also the fastest on a 48-SM GB10. That is
  agreement by coincidence, not by design: the model's W-28 estimates are 3–17 times too high under `rtx5090` and
  7–115 times under `gb10`.
- The two GB10 hosts differ by 5–32 % on the rows with 16 or more masks, which matches the read-bandwidth gap the probe
  measured between the idle host and the shared one (258 against about 207 GB/s). The launch-bound rows of 1–2 masks
  do not move.

### What was tricky to build

- Keeping real footage out of the repository. `validate_on_host.sh` writes rendered segments under its output
  directory. Only its text and JSON reports are copied into the ticket; the `bench/` directory stays on `bling`.

### What warrants a second pair of eyes

- The `rtx5090` comparison covers two mask counts at one geometry. The shipped set has 24 programs with schedules
  ranging from `TPB=64` to `TPB=1024`; the claim "the shipped schedules beat `gb10`'s" is measured for four of its 48
  kernels.
- The diagnosis rests on stage timers, which say where time is spent and not what it waits for. The three candidate
  causes (the interpreter lock, the longer context hold, GPU sharing) are untested; each has a named measurement in the
  report (`py-spy dump`, sampling `in_flight`, `nsys`).
- The ground-truth row of the validation looks like evidence for the GPU path and is not (above). The script's
  docstring presents it as the gate for "anything touching the engine, the input geometry or the precision"; it may be
  worth scoring the fixtures at the pipeline's inference size as well.

### What should be done in the future

- Choose W-28's schedules by measurement on the target (Kiln's tuner over the runner), not by the model, until the
  gather accounting is fixed. Then re-export the set from those measurements.
- Run C4 on the RTX PRO 6000 host, which decides `post-moves-to-gpu`. It needs SSH access to
  `playback@playback-rtx-dev`.
- Profile arm B's inference thread under load on `bling` before any further GPU stages (§21 of the guide).
- Report the GB10 result in Playback's performance doc beside the hypotheses C3 recorded there, on the branch.

### Code review instructions

- `scripts/gb10-spec-check.mjs`: `--other`, and the fallback construction it shares with `cuda-runner-smoke.mjs`.
- `scripts/gb10-figures.py`: `load_checks` (the gb10 rows are taken from the first check; every check must come from
  the same `gb10` smoke result).
- Reproduce the comparison: `node scripts/cuda-runner-smoke.mjs --kiln <kiln> --host <gb10> --target rtx5090 --out c.json`,
  then `node scripts/gb10-spec-check.mjs --kiln <kiln> a.json c.json --other rtx5090`.

### Technical details

- Evidence: `various/c4/bling-test-mask-post.txt`, `various/c4/mask-post-cuda-time-bling.json`,
  `various/c4/bling-time-{before,after}.txt`, `various/c4/bling-time.log`, `various/c4/validate-bling/` (the script's text and JSON reports, the controller records, `bench/staged.json` and
  the log; no rendered segments), `various/c4/diag-bling/` (both arms' logs, `throughput.{json,txt}`,
  `timing-{a,b}.txt`), `scripts/c4-diag.sh`,
  `various/pn/smoke-bling-rtx5090.{json,log}`, `various/pn/gb10-spec-check-rtx5090.{md,json}`,
  `various/pn/gb10-spec-check.json` (re-written with an `other` field).
- On `bling`: `~/code/playback-kiln-002` (clone of the bundle), image `playback-redaction:kiln-002-ac835daa`,
  registry container `kiln002-registry` with `base-26.05` and `pb-obs-001-59c13eed4`, logs in `~/kiln-002/logs/`.

## Step 13: One script for every GPU stage, run from the Mac and on `bling` itself; Node and Kiln on `bling`; three defects it found

The GPU work of Steps 9–12 had been a sequence of hand-typed commands. This step turns it into one script,
`scripts/run-on-gpu-host.sh`. The script runs either from the Mac, driving the host over SSH, or on the host itself
with `--local`. Every stage writes its log, its evidence and a verdict into one directory, along with a
`summary.md`. For the second mode, `bling` needed Node 26, pnpm and a Kiln clone. I installed Node and pnpm as root
through the `admin` tmux session and cloned Kiln from a git bundle. Run from the Mac, the Kiln and Playback stages
passed in 3 minutes. Run on `bling` with the A/B and the diagnosis, the whole sequence took 32 minutes. It repeats
Step 12's result: every correctness gate passes, and the candidate is slower at every concurrency (paired medians
0.987, 0.958 and 0.964). On the final commit, `9d409d1`, every Kiln and Playback stage passes on `bling` in 3 min 11 s.

Running everything on a fresh host found three defects that a single developer machine had hidden. First, Kiln's
`pnpm test` ran `lab-e2e.mjs`, which KILN-001 documented as outside the suite. It passed on the Mac only because the
Mac has a built page and Perf Lab's data. Second, the script's own `pb-test` verdict lost its result in a pipeline
subshell, so it would have reported a real regression as KNOWN-FLAKY. A new test now covers that verdict. Third,
Playback's `test_trt_engine_raw.py` fails about half the time, at the baseline as often as on the branch, because it
assumes TensorRT returns the same masks twice. The first two are fixed. The third belongs to Playback and is
recorded, not changed.

### Prompt Context

**User prompts (verbatim):**

- "what's left / when can I rty it out myself / can we run all thetests from the browser?"
- "can you make a script or so to run everythin on bling.local? why do we need playback?"
- "what's the tensor rt engine and how / why do rwe need the redaction service?"
- "you can install all the needed stuff on bling.local, btw."
- "there's a root shell in the "admin" tmux"
- "justkeep track of it in the diary."
- "try again" (sent while my test harness for the pb-test verdict was failing on its own stub; see What didn't work)

**Assistant interpretation:** Write one entry point that runs all of KILN-002's GPU work on `bling` and gathers its
evidence, usable both from the Mac and on `bling` itself. Install whatever the second mode needs through the root
tmux session, and record each installation here. Answer the two questions in the conversation.

**Inferred user intent:** To rerun the whole measurement without the agent, and to understand which parts need
Playback at all.

### What I did

- **The two questions, answered in the conversation.**
  - Playback is needed only for Example C. The redaction service is the consumer of the mask kernels: its tests, the
    bit-exact comparison against its CPU loop and the service A/B all need it. Kiln's own GPU checks (self-test,
    probe, compile check, smoke, spec comparison) need only the `kiln-perf` image and SSH.
  - The TensorRT engine is RTMDet-Ins-m. The service exports it to ONNX on its first start, and `trtexec` compiles
    that to an FP16 plan specific to the GPU and the TensorRT version: 36 s to build, about 0.3 s to load from the
    cache volume. `TrtSegEngine` (`services/redaction/src/trt_engine.py`) is the Python class around it. Kiln's
    kernels run in that class after the network, not inside the network.
- **The vault reports, committed and pushed** (playback-vault `d5058c9`, `main`): Reports A, B and C as amended in
  Step 12, with three new figures.
- **A private browser page of the three reports** (`https://claude.ai/artifact/1U2SDSRNnksA6yBgnTzLTA`). A scratch
  script renders it from the vault Markdown with the images inlined. The page leaves out `c2-mask-post-768x416.png`,
  which is `tests/fixtures/image.04.png`, a production camera frame, shown with its people redacted. Its place on the
  page says so. Before publishing I opened the two `a3-view-1385-*` screenshots: both show the similarity-matrix
  view (matrix, slider, top-5 list) and no frame.
- **The two SSH tunnels of Step 12 stopped**, since the registry push they carried had finished. The
  `localhost:5000` tag the push could have left on `dgx` was already gone; `dgx` lists only its own
  `pb-obs-001-59c13eed4` tags.
- **The whole redaction suite in the branch's image.** Step 12 ran only `tests/test_mask_post.py`. Running all of
  `tests/` took three attempts:
  - With `services/redaction` mounted as before: two collection errors. `tests/test_build_contract.py` and
    `tests/test_layout_vectors.py` compute `Path(__file__).parents[3]`, the repository root, which the mount does
    not contain (`IndexError: 3`).
  - With the whole clone mounted read-only at `/repo`: `6 failed, 668 passed, 1 skipped`. Each failure was
    `OSError: [Errno 30] Read-only file system: '/repo/services/redaction/.pytest_defaults_…'`, because
    `tests/test_defaults.py` creates directories in its working directory.
  - With the tree copied to `/tmp/r` inside the container: `674 passed, 1 skipped in 13.28s`. The skip was
    `tests/test_trt_engine_raw.py:60: requires CUDA + the rtmdet-ins_m TRT engine (container-only)`. The test looks
    for `/opt/models/rtmdet-ins_m.engine`, while the service keeps its engine in the `playback_ds-engine-cache`
    volume (`rtmdet-ins_m.engine`, 61 MB, built at 19:12 UTC by Step 12's validate run).
- **The TensorRT raw-path test is flaky, at the baseline as well.** With the volume mounted and the engine linked to
  `/opt/models`, the test failed with
  `AssertionError: 28 not less than or equal to 2 : raw vs production mask union disagree on 28 px (limit=2)`. I ran
  it ten times per revision, each revision's tree streamed in with `git archive`, in the same image with the same
  engine (table 13.1). The test runs inference twice on one frame, through `infer_frame` and through
  `infer_frame_raw`, and requires the two mask unions to agree to within 2 px. The redaction performance doc has
  measured that TensorRT does not return the same masks twice (one engine, one frame, 12 repeats: up to 10 distinct
  mask-logit hashes). The defect is in the test, and it predates C3. I did not change the test, which is Playback's.
- **Node and pnpm on `bling`, as root through tmux `admin`**, using the Step 8 helper
  `/Volumes/SSD/tmp/kiln-002/hosts/bling-root.sh`:
  - 20:10:32 UTC: Node 26.8.1. The official `node-v26.8.1-linux-arm64.tar.xz` was checked against nodejs.org's
    `SHASUMS256.txt` (`23c1b4d19e2f12a7d06fe8aa3d6e0e4923cf77a47e13c5ccdf32fadaa33960f2`; `sha256sum -c` printed
    `OK`), unpacked to `/usr/local/lib/nodejs/node-v26.8.1-linux-arm64`, and `node`, `npm` and `npx` were linked
    into `/usr/local/bin`. npm is 11.19.0.
  - 20:10:38 UTC: `npm install -g --no-fund --no-audit pnpm@12.4.1` (Kiln's `packageManager`), linked to
    `/usr/local/bin/pnpm`. npm warned that it had not run pnpm's `preinstall` and `postinstall` scripts
    (`allowScripts`). `pnpm --version` prints 12.4.1 as `manuel` regardless.
- **Kiln on `bling`.** Kiln has no remote, so `git bundle create … main` (22.5 MB) went over SSH and was cloned to
  `~/code/kiln` at `c800080`. `pnpm install --frozen-lockfile` added 51 packages in 2 s. `lab-workbench/` is not in
  the pnpm workspace (`pnpm-workspace.yaml` says so), so nothing ran in it. Each later commit arrived as an
  incremental bundle followed by `git pull --ff-only`, after a check that the clone had no uncommitted changes.
- **`scripts/run-on-gpu-host.sh`** (Kiln `450fbd0`, then `33196b5`, `4828ea5`, `e4e03c2` and `9d409d1`), with the
  stages in table 13.2. Its rules:
  - Each stage writes `logs/<stage>.log`. `summary.md` lists each stage's verdict, duration and a one-line note.
    The verdicts are PASS, FAIL, DONE (a measurement with no gate), KNOWN-FLAKY and SKIP. The exit status is 1 if
    any stage fails.
  - `pb-test` passes if the revision's run has no failure. Otherwise every test that failed at either revision is
    rerun `--reps` times (default 5) at both. The verdict is FAIL if one of the revision's failures never fails at
    the baseline, and KNOWN-FLAKY if each one also fails there.
  - `pb-ab` and `pb-diag` refuse a GPU that `nvidia-smi --query-compute-apps` shows in use, unless
    `--allow-busy-gpu` is given. On `dgx`, two more service instances would compete with factory-live, and the
    comparison would mean nothing.
  - Only text, JSON and charts reach the evidence directory. The host's run directory (`~/kiln-002/runs/<stamp>`)
    keeps `validate_on_host.sh`'s bench renders; the script copies only the top-level `*.json` and `*.txt` files
    and `bench/staged.json`, the set Step 12 copied by hand.
- **Supporting changes**, in `450fbd0`:
  - `pb-pytest.sh` (new) streams one revision's tree into the image with `git archive`, unpacks it under `/tmp`,
    links the cached engine to `/opt/models` and runs pytest. With `REPS=N` it reruns the named tests and prints one
    `<id>\tpass|fail` line per run. The host's clone is never written.
  - `c4-diag.sh` takes `IMG`, `SVC`, `VALIDATE` and `OUT` from the environment, with the Step 12 paths as
    defaults.
  - `cuda-runner-smoke.mjs` gains `--local`, the executor's existing `local` target.
  - `runner/docker/kiln-docker-python`: a local executor runs the runner from the Kiln checkout rather than from
    `~/.cache/kiln-runner`, so the shim now also mounts the runner script's directory, read-only, when it lies
    outside the cache directory. The SSH executor's behaviour is unchanged.
- **First run, from the Mac** (`./run-on-gpu-host.sh --playback`, 20:10:19–20:13:26 UTC, Kiln `c800080` plus the
  uncommitted script). All ten stages passed (table 13.3). The numbers repeat Steps 11 and 12. GNU tar on `bling`
  printed `tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'` three times for
  the scripts sent from the Mac, so the script now sends with `COPYFILE_DISABLE=1 tar --no-xattrs`, as `build.sh`
  does.
- **Two more Kiln stages**, `kiln-unit` and `kiln-cuda-compile`. On their first run from the Mac, `pnpm test`
  passed in 80 s, and 146 of 146 exported kernels compiled for sm_121 with the image's NVRTC 13.0.88 and ptxas, with
  no register spills.
- **A `PATH` gap.** `ssh bling.local 'command -v uv'` prints nothing. uv lives in `~/.local/bin`, which Ubuntu's
  `.bashrc` adds only for interactive shells. The script now prepends it (`33196b5`).
- **The whole run on `bling` itself**, started over SSH under `nohup` so that a dropped connection would not stop it:
  `nohup …/scripts/run-on-gpu-host.sh --local --playback --ab --diag > ~/kiln-002/logs/run-local-20261020T201637Z.log`
  (Kiln `33196b5`, 20:16:37–20:48:19 UTC). Table 13.4 has the summary.
  - `pb-ab` repeats Step 12 (table 13.5): every gate passes, and all 12 paired ratios are below 1 again.
  - `pb-diag` repeats Step 12's stage timers (table 13.6): the post-pass is cheaper, preprocessing takes 2.7 ms per
    frame longer, and wall time goes up 1.5 ms per frame.
  - `kiln-unit` FAILED with `FAIL lab-e2e.mjs (exit 1)`:
    `no /home/manuel/code/kiln/apps/workbench/dist/kiln-workbench.html: build first (node build.mjs)`. I added
    `pnpm build` before `pnpm test` (`4828ea5`). The next run on `bling` failed one step later:
    `no Perf Lab store at /home/manuel/code/kiln/lab-workbench/.data/perf-lab.sqlite (--from DIR)`.
  - `pb-test` came out KNOWN-FLAKY, because the raw-path test failed in the revision's full run. In the reruns it
    failed 5 of 6 times at `ac835daa9` and 3 of 6 at `d1faf0cf1`. But the note ended in
    `…; fails at both revisions: ` with nothing after it.
- **The pb-test verdict bug.** The rerun table was written with `{ … } | tee pytest-reruns.md`. The loop inside the
  braces sets `regress` and `flaky`, but a pipeline runs it in a subshell, so both assignments were lost. The empty
  list was the visible half. The other half: `regress` always read 0, so a test failing only at the revision would
  also have come out KNOWN-FLAKY. The fix writes the table with a plain redirection and prints it afterwards (`e4e03c2`).
- **A test for it**, `scripts/test-pb-test-verdicts.sh` (same commit). It extracts `stage_pb_test` from
  `run-on-gpu-host.sh` with `sed`, replaces the host with a stub `R` that prints canned pytest output per revision,
  and checks four cases. On `4828ea5` it prints `FAIL regression: expected FAIL, got KNOWN-FLAKY`; on `e4e03c2` all
  four pass, on the Mac and on `bling`:

  ```text
  ok   passes: PASS
  ok   flaky: KNOWN-FLAKY
  ok   regression: FAIL
  ok   no-suite: FAIL
  ```

- **`lab-e2e.mjs` out of `pnpm test`** (`9d409d1`). The file's header says "Not part of `pnpm test`: it needs
  Chrome, a built page and Perf Lab's data (guide §36)", and KILN-001's diary (line 2069) says the same. But
  `1d31e9d`, which added the file, never added it to the workbench's `--skip` list, and `run-node-tests.mjs` runs every
  `test/*.mjs` that is not skipped. The fix adds `--skip lab-e2e.mjs`. With that test out of the suite, nothing in
  `pnpm test` needs `dist/`, so `kiln-unit` goes back to plain `pnpm test`. On the Mac, the workbench suite then
  reports `skipped: … lab-e2e.mjs` and `all 5 passed`. On `bling`, `kiln-unit` passed in 24 s.
- **The final run, on `bling`** (`--local --playback`, Kiln `9d409d1`, 20:51:26–20:54:37 UTC): all twelve stages
  pass (table 13.7). The flaky test passed in this run.
- **Evidence** in `various/run-on-gpu-host/`: `mac-first-20261020T201016Z` (the first run, from the Mac),
  `local-full-20261020T201637Z` (the whole run on `bling`, with the A/B and the diagnosis) and
  `local-final-20261020T205126Z` (the final run). Each holds `summary.md`, `host.txt`, `logs/`, `kiln/`,
  `playback/` and `figures/`. They contain no video or image file except the three charts per run.

Table 13.1: `test_trt_engine_raw.py`, ten runs per revision, same image and engine.

| Revision               | Passed | Failed, each with "disagree on 28 px" |
| ---------------------- | -----: | ------------------------------------: |
| `d1faf0cf1` (baseline) | 6      | 4                                     |
| `ac835daa` (C3)        | 5      | 5                                     |

Table 13.2: the stages of `run-on-gpu-host.sh`, in order.

| Stage                | What it runs                                                                                        | Where                                         |
| -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `kiln-unit`          | `pnpm test` in the Kiln checkout                                                                    | the machine running the script                |
| `kiln-image`         | `runner/docker/build.sh [--host]`                                                                   | host                                          |
| `kiln-selftest`      | the image's default command: the launcher fixtures against the GPU                                  | host                                          |
| `kiln-probe`         | `kiln-probe` in the image, with `--pid host`                                                        | host                                          |
| `kiln-cuda-compile`  | `apps/workbench/test/export-cuda.mjs`, then `cuda_check.py` with the image's NVRTC and ptxas        | export where the script runs, compile on host |
| `kiln-smoke`         | `cuda-runner-smoke.mjs` per `--targets` spec (default gb10, fallback, rtx5090)                      | executor over SSH, or local                   |
| `kiln-spec`          | `gb10-spec-check.mjs` against each other target                                                     | where the script runs                         |
| `kiln-figures`       | `gb10-figures.py spec` and `schedules`                                                              | where the script runs                         |
| `pb-sync`            | bundle of the Mac's C3 checkout; fetch and detached checkout in the host clone, which must be clean | host; skipped with `--local`                  |
| `pb-image`           | `docker build` of `playback-redaction:kiln-002-<rev8>` unless the tag exists                        | host                                          |
| `pb-test`            | `pb-pytest.sh` at the revision and at the baseline; reruns of any failure at both                   | host                                          |
| `pb-time`            | `mask-post-cuda-time.py` in the image, and its chart                                                | host                                          |
| `pb-ab` (`--ab`)     | `validate_on_host.sh --candidate-env REDACTION_MASK_POST=kiln`                                      | host                                          |
| `pb-diag` (`--diag`) | `c4-diag.sh`, then `parse_segment_timing.py` on each arm's log                                      | host                                          |

Table 13.3: the first run, from the Mac (`mac-first-20261020T201016Z/summary.md`).

| Stage         | Verdict | Seconds | Note                                                                                   |
| ------------- | ------- | ------: | -------------------------------------------------------------------------------------- |
| kiln-image    | PASS    | 5       |                                                                                        |
| kiln-selftest | PASS    | 3       | 5 launcher fixtures agree with their references                                        |
| kiln-probe    | DONE    | 3       | NVIDIA GB10: 28.9 TFLOP/s FMA, 239 GB/s read, 2.4 us launch                            |
| kiln-smoke    | PASS    | 103     | 18 of 18 agree under each of gb10, fallback and rtx5090                                |
| kiln-spec     | DONE    | 13      | the 11 kernels that differ: gb10 6,328 µs, rtx5090 3,749 µs (Step 12: 6,308 and 3,705) |
| kiln-figures  | DONE    | 2       |                                                                                        |
| pb-sync       | PASS    | 6       | host clone at `ac835daa9`                                                              |
| pb-image      | PASS    | 1       | the tag existed                                                                        |
| pb-test       | PASS    | 36      | 675 passed at `ac835daa9`, 650 at `d1faf0cf1`; the raw-path test ran and passed        |
| pb-time       | PASS    | 14      | 0 differing pixels; 768x416, 100 masks: 3.107 ms Kiln, 20.836 ms CPU loop              |

Table 13.4: the whole run on `bling` (`local-full-20261020T201637Z/summary.md`, Kiln `33196b5`).

| Stage             | Verdict     | Seconds | Note                                                                                              |
| ----------------- | ----------- | ------: | ------------------------------------------------------------------------------------------------- |
| kiln-unit         | FAIL        | 25      | `lab-e2e.mjs`: no `dist/kiln-workbench.html` (fixed in `9d409d1`)                                 |
| kiln-image        | PASS        | 5       |                                                                                                   |
| kiln-selftest     | PASS        | 3       | 5 launcher fixtures agree                                                                         |
| kiln-probe        | DONE        | 3       | 28.9 TFLOP/s FMA, 240 GB/s read, 2.5 µs launch                                                    |
| kiln-cuda-compile | PASS        | 26      | 146/146 kernels compile for sm_121; 0 with spills                                                 |
| kiln-smoke        | PASS        | 71      | 18 of 18 under each spec; 71 s against 103 s from the Mac (no SSH per runner call)                |
| kiln-spec         | DONE        | 11      | the 11 that differ: gb10 6,381 µs, rtx5090 3,765 µs                                               |
| kiln-figures      | DONE        | 68      | uv fetched matplotlib on `bling` for the first time                                               |
| pb-sync           | SKIP        | 0       | local run                                                                                         |
| pb-image          | PASS        | 0       |                                                                                                   |
| pb-test           | KNOWN-FLAKY | 79      | raw-path test: 5/6 fails at `ac835daa9`, 3/6 at `d1faf0cf1`; note list empty (fixed in `e4e03c2`) |
| pb-time           | PASS        | 11      | 0 differing pixels; 3.113 ms Kiln, 20.459 ms CPU loop                                             |
| pb-ab             | PASS        | 1486    | every gate passes; ratios in table 13.5                                                           |
| pb-diag           | PASS        | 114     | table 13.6                                                                                        |

Table 13.5: `pb-ab` throughput, frames per second, median of 4 pairs, against Step 12.

| Concurrency | Baseline | Candidate | Ratio (min–max)     | Step 12 ratio |
| ----------: | -------: | --------: | ------------------- | ------------: |
| 1           | 76.44    | 75.40     | 0.987 (0.972–0.996) | 0.974         |
| 4           | 130.69   | 125.60    | 0.958 (0.948–0.981) | 0.971         |
| 8           | 130.32   | 126.01    | 0.964 (0.961–0.976) | 0.968         |

Table 13.6: `pb-diag` stage timers, ms per frame (p50, 38 renders of 144 frames), arm A (baseline) and arm B
(`REDACTION_MASK_POST=kiln`), against Step 12's diagnosis.

| Timer              | A     | B     | B − A | Step 12 B − A |
| ------------------ | ----: | ----: | ----: | ------------: |
| `infer_preprocess` | 20.17 | 22.90 | +2.73 | +3.08         |
| `infer_forward`    | 2.84  | 2.77  | −0.07 | −0.18         |
| `infer_decode`     | 1.78  | 1.50  | −0.28 |               |
| `infer_post`       | 2.19  | 1.55  | −0.64 |               |
| `infer_busy`       | 6.90  | 5.80  | −1.10 | −1.47         |
| wall               | 28.39 | 29.93 | +1.54 | +1.86         |

Table 13.7: the final run on `bling` (`local-final-20261020T205126Z/summary.md`, Kiln `9d409d1`).

| Stage             | Verdict | Seconds | Note                                                                 |
| ----------------- | ------- | ------: | -------------------------------------------------------------------- |
| kiln-unit         | PASS    | 25      |                                                                      |
| kiln-image        | PASS    | 4       |                                                                      |
| kiln-selftest     | PASS    | 3       |                                                                      |
| kiln-probe        | DONE    | 3       | 28.9 TFLOP/s, 240 GB/s, 2.4 µs                                       |
| kiln-cuda-compile | PASS    | 26      | 146/146 for sm_121, no spills                                        |
| kiln-smoke        | PASS    | 68      | 18 of 18 under each spec                                             |
| kiln-spec         | DONE    | 12      | gb10 6,338 µs, rtx5090 3,776 µs                                      |
| kiln-figures      | DONE    | 1       |                                                                      |
| pb-sync           | SKIP    | 0       | local run                                                            |
| pb-image          | PASS    | 0       |                                                                      |
| pb-test           | PASS    | 37      | 675 passed at `ac835daa9`, 650 at `d1faf0cf1`; the raw-path test ran |
| pb-time           | PASS    | 12      | 0 differing pixels; 3.122 ms Kiln, 20.2 ms CPU loop                  |

### Why

- **One script, two modes.** From the Mac, nothing has to be installed on the host beyond Docker. On the host, a
  person can start everything with one SSH command and leave it running. Both modes run the same stage functions.
  Only `R` and `RS` differ (`bash -c` instead of `ssh`), so neither mode can drift from the other.
- **Verdicts rather than logs.** Step 12's refutation came from reading a table, while `validate_on_host.sh` printed
  PASSED, because it does not gate throughput. The summary therefore states each stage's verdict, and for a
  measurement it states DONE and puts the figures in the note. Nothing in the summary claims the A/B "passed" on
  throughput.
- **Both revisions in `pb-test`.** A failing test at the revision means nothing until the same test has run at the
  baseline. The raw-path test shows why: it would read as a C3 regression in about half of all runs.
- **Refusing a busy GPU** for the A/B and the diagnosis, because `dgx` is the shared host and the comparison is
  worthless with a co-tenant.

### What worked

- Both modes ran end to end; everything that failed on the way is listed under What didn't work. The numbers agree
  with Steps 11 and 12 to within 1–2 %, and every A/B ratio is below 1 again.
- `nohup` over SSH for the 32-minute run. One of my status queries was reset during key exchange
  (`kex_exchange_identification: read: Connection reset by peer`); the run did not notice, and the retry succeeded.
- The verdict test: red on the commit with the bug, green on the fix, on both machines.

### What didn't work

- Sending scripts from the Mac with plain `tar`: GNU tar on `bling` warned about `LIBARCHIVE.xattr.com.apple.provenance`
  headers. Fixed with `COPYFILE_DISABLE=1 tar --no-xattrs`.
- `--local` over SSH without `~/.local/bin` on `PATH`: uv was not found. Fixed in `33196b5`.
- The whole suite with only `services/redaction` mounted (`IndexError: 3`), then with the clone mounted read-only
  (`6 failed`, `OSError: [Errno 30] Read-only file system`); see What I did.
- `kiln-unit` on a fresh clone, twice: first the missing `dist/kiln-workbench.html`, then the missing Perf Lab store.
  `4828ea5` treated the first symptom; `9d409d1` removed the cause and reverted the build step.
- The `pb-test` note `fails at both revisions: ` with an empty list, which exposed the subshell bug.
- My own test harness for that verdict, twice, before it tested anything:
  - Its first stub matched the revision as `" REV "` with spaces, but the stage passes its arguments through
    `printf %q`, which escapes spaces. Every case came out `FAIL: the suite did not run`.
  - Its second stub ended with a `for` loop whose last `[[ … ]] && cat` was false, so the stub returned 1. Under
    `set -e` the stage stopped at its first `R` call for reruns, and the verdict note was never written.
  - In both cases the defect was in the stub, not in the script. The committed test's stub ends with `return 0`,
    like the real `R`, which returns the remote command's status.

### What I learned

- A fresh host is the cheapest audit of a test suite's hidden prerequisites. The Mac had a built `dist/` and Perf
  Lab's data, so `pnpm test` had been passing there by accident since `1d31e9d`.
- In bash, `{ …; } | tee` runs the braces in a subshell. Any verdict computed inside them is gone afterwards. Here
  the lost value was the one that tells a regression from a flaky test.
- The redaction suite needs a writable whole-repository tree, and its one TensorRT test needs the engine at a path
  the service itself does not use.

### What was tricky to build

- **Running stage functions with `set -e` in force.** Bash ignores `errexit` inside a function called from an `if`,
  `&&` or `||` context, so a stage would carry on past a failed command. Each stage therefore runs as
  `(set -e; stage) > log 2>&1 &` followed by `wait $!`, which is not such a context. The stage communicates its
  verdict and note through files under `.stage/`, because a subshell cannot set the parent's variables. The
  `.stage/` directory is cleared at the start of each invocation, so that `--out` pointing at an earlier run cannot
  pass off that run's verdicts as new ones.
- **Keeping footage off the evidence path.** `validate_on_host.sh` writes renders under its output directory, so
  the script points it at the host's run directory and copies back an explicit list of file types, never the
  directory.

### What warrants a second pair of eyes

- `9d409d1` changes Kiln's `pnpm test` itself: `lab-e2e.mjs` no longer runs there. That matches what the file and
  KILN-001 say. But anyone who relied on `pnpm test` to exercise the Perf Lab import end to end on the Mac now has
  to run `node apps/workbench/test/lab-e2e.mjs` by hand, as KILN-001 documented.
- `pb-test`'s rule treats a test as flaky if it fails at the baseline even once in `--reps + 1` runs. A test that
  fails much more often at the revision (say 6 of 6 against 1 of 6) still comes out KNOWN-FLAKY. The rule separates
  "new failure" from "old failure", not "more frequent failure".
- The kiln-docker-python mount change: for a local executor, the runner directory is mounted read-only. If the
  runner ever writes next to itself, a local run will fail where an SSH run does not.

### What should be done in the future

- Fix `test_trt_engine_raw.py` in Playback: run inference once and apply both post-processing paths to that one
  result, which is what its docstring says it tests. That needs a Playback change outside this ticket.
- Run `run-on-gpu-host.sh --host playback@playback-rtx-dev --playback --ab --diag` on the RTX PRO 6000 once SSH
  access exists. That host needs a `--targets` list without gb10 first, and `kiln-spec` will SKIP.
- C4.d (Step 12) is unchanged: profile the inference thread under load. The stage timers in table 13.6 repeat the
  +2.7–3.1 ms preprocessing cost.

### Code review instructions

- Start with `scripts/run-on-gpu-host.sh`: the stage plumbing (`verdict`, `note`, the `(set -e; …) &` / `wait`
  loop), then `stage_pb_test`, then the copy-back in `stage_pb_ab`.
- Run `scripts/test-pb-test-verdicts.sh`; all four cases must print `ok`.
- Run `scripts/run-on-gpu-host.sh --help`, then `--stages kiln-selftest` against a GPU host as the smallest real run.
- `apps/workbench/package.json` (one `--skip`) and `runner/docker/kiln-docker-python` (the `case` on the runner
  directory).

### Technical details

- Commits: Kiln `450fbd0`, `33196b5`, `4828ea5`, `e4e03c2`, `9d409d1`; playback-vault `d5058c9`.
- Root commands on `bling` (tmux `admin`, via `bling-root.sh`):
  - `cd /tmp && curl -fsSLO https://nodejs.org/dist/v26.8.1/node-v26.8.1-linux-arm64.tar.xz && echo "23c1b4d1…  node-v26.8.1-linux-arm64.tar.xz" | sha256sum -c - && mkdir -p /usr/local/lib/nodejs && tar -xJf node-v26.8.1-linux-arm64.tar.xz -C /usr/local/lib/nodejs && for b in node npm npx; do ln -sf /usr/local/lib/nodejs/node-v26.8.1-linux-arm64/bin/$b /usr/local/bin/$b; done && rm node-v26.8.1-linux-arm64.tar.xz`
  - `npm install -g --no-fund --no-audit pnpm@12.4.1 && ln -sf /usr/local/lib/nodejs/node-v26.8.1-linux-arm64/bin/pnpm /usr/local/bin/pnpm`
- State on `bling` added in this step: `/usr/local/lib/nodejs/node-v26.8.1-linux-arm64` and its four links in
  `/usr/local/bin`; `~/code/kiln` (at `9d409d1`, with `node_modules`); `~/.local/bin/kiln-docker-python` (updated);
  `~/kiln-002/runs/<stamp>/` (four runs; the full run's holds bench renders of real footage) and
  `~/kiln-002/evidence/<host>-<stamp>/`; `~/kiln-002/logs/run-local-20261020T201637Z.log`. The Playback clone is
  detached at `ac835daa9`.
- The flaky-test count: `git -C ~/code/playback-kiln-002 archive <rev> | docker run --rm -i --gpus all -v playback_ds-engine-cache:/engine-cache:ro -e NVIDIA_TF32_OVERRIDE=0 --entrypoint sh playback-redaction:kiln-002-ac835daa -c "… ln -sf /engine-cache/rtmdet-ins_m.engine /opt/models/ … for i in 1 … 10; do python3 -m pytest -q tests/test_trt_engine_raw.py | grep -oE 'disagree on [0-9]+ px|1 passed'; done | sort | uniq -c"`.
- Reproduce everything: `scripts/run-on-gpu-host.sh --host manuel@bling.local --playback --ab --diag` from the
  Mac, or on `bling`: `cd ~/code/kiln/ttmp/2026/10/20/KILN-002--*/scripts && ./run-on-gpu-host.sh --local --playback --ab --diag`.

## Step 14: The Kiln server on `bling`, reached from the Mac through a tunnel; a guided first kernel

This step sets up Kiln the way a person uses it, rather than the way the scripts of Step 13 use it. The Kiln server
runs on `bling` with one executor, `spark`, which runs the runner through `kiln-docker-python` on the GB10. The
workbench page is served by that server and opened in a browser on the Mac through an SSH tunnel. A headless run
of the page measured W-18 as a job on `spark`: 122.8 µs median, the reference check passing on 384 sampled outputs.
The rest of the step is a guided walkthrough for the user, in which they write a small kernel and measure it.

One setup defect appeared: the first server start could not reach Docker. The fix was to start the server under a
tmux server of its own, which is recorded below because the same problem waits for anyone who starts a long-lived
process on `bling` from the existing tmux server.

### Prompt Context

**User prompt (verbatim):** "ok can we start thingso n bling.local and you teach me how to use the system here, step
by step? Like how to write and measure something simple?"

**Assistant interpretation:** Start the Kiln server and workbench on `bling`, check one measurement end to end, then
teach the workbench interactively: the pieces, the views, writing a program, compiling it, measuring it on the GB10
and reading the result.

**Inferred user intent:** To be able to use Kiln on the Spark without the agent.

### What I did

- Built the page on `bling`: `cd ~/code/kiln && pnpm build` → `apps/workbench/dist/kiln-workbench.html` (1826 KB,
  27 presets).
- Wrote `~/kiln-002/server-data/executors.json` with one local executor:
  `{ "id": "spark", "target": "local", "python": "/home/manuel/.local/bin/kiln-docker-python", "env": { "KILN_ARCH": "native" } }`.
- Started the server in its own tmux server (socket `kiln`, session `kiln`), with the data directory outside the
  clone: `tmux -L kiln new-session -d -s kiln -c ~/code/kiln "export PATH=$HOME/.local/bin:$PATH KILN_DATA_DIR=$HOME/kiln-002/server-data; pnpm serve 2>&1 | tee $HOME/kiln-002/logs/server.log; exec bash"`.
  It prints `kiln server on http://127.0.0.1:5280/ · db /home/manuel/kiln-002/server-data/kiln.sqlite · 1 executor`.
- Tunnel from the Mac: `ssh -N -o ExitOnForwardFailure=yes -L 5280:127.0.0.1:5280 manuel@bling.local`. The server
  binds only to 127.0.0.1 and refuses any `Host` header other than `127.0.0.1:5280`, `localhost:5280` or
  `[::1]:5280`, so the local port of the tunnel must also be 5280.
- `GET /api/devices` through the tunnel reported `cuda:nvidia-gb10-e220ce35`: NVIDIA GB10, cc 12.1, 48 SMs,
  2418 MHz, 121.7 GB, driver 580.178.04, runtime 13000.
- Headless check (`scripts/shoot.mjs`'s `withPage`, scratchpad driver): load W-18, `setDevice('server:spark')`,
  `measure()`. The page proposed and approved a job, the server ran 7 repetitions × 20 launches (3 warm-up, seed 1)
  in 7.8 s of executor time, and one record came back: `k_ew` `TPB=128`, median 122.8 µs, fastest 113.5 µs,
  128 threads × 32768 blocks, check `max abs diff 2.38e-7`. Model estimate on the Perf view: 132 µs.
- Compiled, without measuring, the program the walkthrough uses (`out = 2·x + y` on 16,777,216 elements): no
  diagnostics, one kernel `k_ew`, row `TPB=64,COARSEN=2`.

### Why

- A server executor rather than a browser-local CUDA runner, because the page then needs nothing on the Mac but a
  browser, the records persist in the server's SQLite file, and the job protocol (fresh runner process per
  repetition, seeded shuffled order) is the one the guide recommends.
- The data directory is `~/kiln-002/server-data`, not the default `apps/server/.data`, so a later `git pull` or a
  fresh clone of Kiln on `bling` leaves the records alone.

### What worked

- The page found the server, listed `CUDA NVIDIA GB10 · spark · server` as a device, and measured on it with no
  configuration in the page itself.

### What didn't work

- The first start, in a new session of the existing tmux server, probed the executor and got
  `"/home/manuel/.local/bin/kiln-docker-python exited with 1: permission denied while trying to connect to the docker API at unix:///var/run/docker.sock"`.
  `id -nG` over a fresh SSH login lists `docker`. The tmux server was started at 14:15 local time, before `manuel`
  was added to the `docker` group, and every session it creates inherits its supplementary groups. A new tmux server
  (`tmux -L kiln`) started from a fresh SSH login has the group, and the probe then succeeded.

### What I learned

- A process's supplementary groups are fixed when it starts. Adding a user to a group reaches new logins only, so
  any long-lived server process (tmux, a shell) started earlier must be replaced, not reused.

### What was tricky to build

- Nothing in this step needed code. The two constraints that shape the setup are the loopback-only bind with its
  `Host` allow-list, which forces port 5280 on both ends of the tunnel, and the group inheritance above.

### What warrants a second pair of eyes

- The headless check left one W-18 record in the server's database. It is a valid record of the GB10 and is kept.

### What should be done in the future

- The walkthrough continues below as the user works through it.

### Code review instructions

- No code changed in this step. To reproduce: the three commands under What I did, then open
  `http://localhost:5280/` on the Mac.

### Technical details

- Server: `tmux -L kiln attach -t kiln` on `bling` shows its output; `~/kiln-002/logs/server.log` keeps a copy.
  Stop it with Ctrl-C in that session.
- Health: `curl -s http://localhost:5280/api/health` →
  `{"status":"ok","version":"kiln-server/0.1",…,"executors":1,"features":["records","devices","jobs","events","lab"]}`.
- The W-18 job: `job-26f0cd2f-df64-4704-95e4-66e4fbed88b6`; record
  `7935e997d5f27086c016aa64f283b6ea581d6d5196976e9964d76e8fb251d800`.

## Step 15: Records name the program they were compiled from (record context)

The user asked whether a measurement keeps the slider settings it was taken at. It kept the schedule knobs
(`kernel.knobs`, `kernel.row`, `activation`) and the launch, but a project's parameters, W-18's `elements` and
`degree`, reached a record only as hashes: the kernel identity (what is computed, on which shapes) and the content id
(the exact source, launch, inputs and output). The consequence the user could see was in Evidence: two degrees at the
same schedule were two groups with identical headings, `k_ew TPB=128 · CUDA NVIDIA GB10`. This step adds an optional
`context` to `kiln-measure/1` records: the preset, the project, the project's parameters at the values the compile
used, and the sha256 of the script. Every producer fills it, the server stores it per job kernel, and the page shows
it. On the GB10, W-18 at degree 8 measured 126.5 µs and at degree 32 measured 133.2 µs, and each record names its
degree.

The same inspection found that 9 of the 11 jobs on the server had lost their records. The only route that deletes
records is Evidence's Forget (`DELETE /api/records?device=…`, which removes every record of that device). The deletion
happened between 21:13:56 and 21:14:35 UTC: job `942585ba` (finished 21:13:56) has none, `96066413` (21:14:35) has
its record. The jobs remain; their measurements cannot be recovered.

### Prompt Context

**User prompts (verbatim):**

- "Do we save the knobs used i the evidence? Like if I adjust elements/degrees in here? How can I see which were used
  for a specific job / evidence"
- "Can we record those knobs? also, what else would we like to investigate? and could we do knob sweeps and see the
  multiple results in kiln? / Also, how do I access the perf lab?"

**Assistant interpretation:** Answer from the stored records rather than from the code's intent; then make records
carry the parameter values by name, deploy it to `bling`, and verify it on the GB10. Answer the sweep and Perf Lab
questions from what the page and server do today.

**Inferred user intent:** To be able to look at any stored measurement and know the exact settings that produced it,
which a parameter sweep will need.

### What I did

- Read one record and the job list through the tunnel (`GET /api/records`, `GET /api/jobs/:id`) and tabulated every
  job's identity, row, launch and content id. Same row and launch with a different identity (`d1a856e6` vs
  `d9aad7e4`, both `TPB=64`, `2048 × 64`) showed a degree change; the launch gives `elements` as grid × block ×
  COARSEN.
- `@kiln/evidence` (`record.ts`): `RecordContext` `{ preset?, project?, params?, script? }`; `validateContext(x, at)`
  (unknown fields, 1..200-character names, `params` a flat object of strings, finite numbers and booleans, at most
  64, `script` a sha256 digest); `validateRecord` checks `context` and accepts it as a known field.
- Kiln (`std/records.js`): `recordContext({ preset, project, params, script })` builds it from `project._params` and
  the ParamSet, dropping values a record cannot hold. `makeRecord`, `EvidenceStore.record`, `measureProgram`,
  `measurePaired` and `tune` take `context` and pass it on.
- Server (`jobs.ts`): `JobKernelInput.context` is optional and per kernel; `parseJob` validates it with
  `validateContext(k.context, 'kernels[i].context')`; it is stored in the spec, returned in `JobView.kernels`, and
  copied into the kernel's record by `jobRecord`.
- Page: `compile()` sets `wb.compileContext` next to `wb.prog`; `measure`, `compare`, `tune` and `proposeJob` (via
  `jobSpec`'s new `contextOf`) use it. Evidence shows the parameters in each group heading and a Program block in the
  record detail; the Jobs detail has a `parameters` row (one per kernel when they differ). `reference.txt` mentions
  the context.
- Tests: evidence 133 (8 new), server 91 (2 new: context per kernel through view and record; malformed context
  refused), `packages/kiln/test/evidence.mjs` (5 new checks), `pnpm test` all green; `node test/server-e2e.mjs`
  passes with a new check that W-05's records carry `rows=1024, dim=4096`.
- Deployed to `bling`: bundle `9d409d1..main`, `git pull --ff-only`, `pnpm build`, server restarted in `tmux -L kiln`.
- Verified on the GB10 headless: W-18 measured at degree 8 and 32 on `spark`, both records and both job views carry
  the parameters (table below); screenshots of Evidence and Jobs in the scratchpad.

### Why

- A record field rather than a job field: the record is what moves between stores (export, import, sync to the
  server), so a job-only context would be lost on the first export.
- Per job kernel rather than per job: a parameter sweep sent as one job holds kernels from several parameter points.
- Captured at compile time: the context then describes exactly the program `wb.prog` holds, even if the editor has
  changed since.
- The field on the page is `compileContext`, not `context`, because the agent's API already has `wb.context()`.
- Knobs are not copied into the context: they are `kernel.knobs`, and two copies could disagree.

### What worked

- The first record measured after the deploy carried `{"preset":"W-18","project":"roofline","params":{"degree":8,
  "elements":4194304},"script":"47c77e3b…"}`; Evidence's heading now reads `k_ew TPB=128 · degree=8,
  elements=4194304 · CUDA NVIDIA GB10`.

### What didn't work

- `pnpm typecheck` in `apps/server` failed on the two deliberately malformed contexts in the new test
  (`TS2322: Type '[number, number]' is not assignable to type 'string | number | boolean'`, `TS2353: … 'knobs' does
  not exist in type 'RecordContext'`); marked them `as never`.
- My screenshot driver failed with `SyntaxError: Unexpected token ';'`: `shoot.mjs`'s `page.eval` wraps its argument
  as an expression, so two statements must be joined with a comma.

### What I learned

- Tune and Compare refuse a server device by design (`server-sync.js`: "runs jobs only: Measure proposes one (Tune and
  Compare run on the page's devices)"), so no knob or parameter sweep can run on the GB10 from the page yet.
- W-18 cannot reach the compute-bound regime on the GB10: its intensity is degree/4 flop/byte, the GB10's ridge in the
  page's spec is 28.9 TFLOP/s ÷ 259 GB/s ≈ 111 flop/byte, so it would need degree ≈ 446, and the slider stops at 256.
  The measurement agrees so far: degree 8 → 32 costs 5 %.
- The Kiln server's Perf Lab routes on `bling` have an empty catalog; `local` is unavailable (Kiln does not execute lab
  jobs) and `playback@dgx` / `playback@rtx-dev` are synthetic.

### What was tricky to build

- `validateRecord` rejects unknown fields and the record id hashes everything, so the context had to be a declared,
  validated field; it is optional, which keeps every existing record valid and its id unchanged.

### What warrants a second pair of eyes

- `recordContext` records only `project._params`, not pipeline parameters a user pinned; those that are schedule
  knobs appear in `kernel.knobs` and `activation`, but a pinned non-knob compiler option would not be named.
- A page older than `432a4b9` posting to the new server is unaffected; a new page posting records with a context to
  an old server is refused (`context: unknown field`). Both ends on `bling` are updated together.

### What should be done in the future

- Task udht: sweep as a job (a knob and parameter grid sent as one job, and a view of time against a parameter).

### Code review instructions

- `packages/evidence/src/record.ts` (`RecordContext`, `validateContext`), then `packages/kiln/src/std/records.js`
  (`recordContext`), `apps/server/src/jobs.ts` (`parseJob`, `copyContext`, `jobRecord`, `view`), `apps/workbench/src/ui/wb.js`
  (`compileContext`), `Evidence.jsx`, `Jobs.jsx`.
- `pnpm test`; `cd apps/workbench && node build.mjs && node test/server-e2e.mjs`.

### Technical details

- Commit: Kiln `432a4b9`.
- Verification jobs on `bling` (W-18, `TPB=128`, 7 × 20 launches):

| job        | degree | elements | identity      | median of 7 (µs) |
| ---------- | -----: | -------: | ------------- | ---------------: |
| `e21c5d38` | 8      | 4194304  | `29gtq5uarr9` | 126.5            |
| `1ddcfc43` | 32     | 4194304  | `3pfhtwvkj4`  | 133.2            |
