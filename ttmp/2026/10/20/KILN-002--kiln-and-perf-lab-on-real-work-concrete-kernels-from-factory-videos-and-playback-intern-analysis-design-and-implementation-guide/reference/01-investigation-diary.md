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
