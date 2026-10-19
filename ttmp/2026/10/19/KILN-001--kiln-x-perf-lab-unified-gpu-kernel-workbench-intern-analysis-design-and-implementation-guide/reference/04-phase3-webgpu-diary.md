---
Title: Phase 3 diary — the WebGPU measurement protocol
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - evidence
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/devices.js
      Note: WebGpuDevice.measureKernels, the pure runProtocol bookkeeping, timerQuantum and the per-context deadline (guide §28)
    - Path: repo://packages/kiln/src/std/tune.js
      Note: measureProgram batches un-memoised kernels through device.measureKernels
    - Path: repo://packages/kiln/src/std/records.js
      Note: makeRecord keeps repetition errors as reasons, the protocol seed, and device-supplied partial caveats
    - Path: repo://packages/kiln/test/protocol.mjs
      Note: Node checks of the order, positions, medians, failed repetitions, timer resolution and batching
    - Path: repo://apps/workbench/test/webgpu.mjs
      Note: Headless Chrome run of the protocol on the local GPU (pnpm --filter @kiln/workbench test:webgpu)
ExternalSources: []
Summary: 'Chronological diary of Phase 3 part 3 (guide §25, §27, §28): repetitions in fresh WebGPU contexts, seeded kernel order, per-repetition medians, the headless Chrome check on an M1 Pro, and what the numbers showed (GPU clock states, a coarsened timer in ordinary Chrome, a NaN in W-24 on Metal).'
LastUpdated: 2026-10-19T19:30:00-04:00
WhatFor: "Reviewing how the WebGPU protocol was built, what it measured on this machine, and where it deviates from the guide"
WhenToUse: "Before changing WebGpuDevice, measureProgram, the record validity rules for WebGPU, or the paired-comparison protocol of Phase 6"
---

# Phase 3 diary — the WebGPU measurement protocol

Written by the Phase 3 part 3 worker. The main diary is `01-investigation-diary.md`. Its Step 1 holds the user's
requests verbatim, and its Step 7 describes the core this part builds on: records, the store and the policy.

Paths: `K/` is `packages/kiln/`, `W/` is `apps/workbench/`.

Machine: Apple M1 Pro (16 GPU cores, Metal 3), macOS 15.8.1, Chrome 155.0.8059.39 headless, Node 26.8.1.

## Step 1: Probe the GPU and decide the unit of a repetition

Before any design, the protocol needs two facts. First, whether headless Chrome on this machine gets a WebGPU adapter
at all. Second, whether that adapter grants `timestamp-query`.

Both hold. With `--enable-unsafe-webgpu`, Chrome 155 headless on the M1 Pro returns an adapter with
`vendor: "apple"` and `architecture: "metal-3"`. Its `device` and `description` are empty, and it grants
`timestamp-query`.

### Prompt Context

**User prompt (verbatim):** see the main diary, Step 1 ("Once upload, then implement it … tell subagents to write
their own as they work as well").

**Assistant interpretation:** The parent agent assigned part 3 of Phase 3:

- implement guide §28's WebGPU protocol;
- route `measureProgram` through it;
- test it in headless Chrome on this Mac;
- keep this diary.

**Inferred user intent:** Real-GPU numbers with repetitions as the statistical unit, so the evidence policy can
decide on intervals rather than on a single best time.

### What I did

- Ran `node scripts/shoot.mjs apps/workbench/dist/kiln-workbench.html <png> --webgpu --print "<adapter probe>"`. It
  printed:
  - the adapter info;
  - the feature list, including `timestamp-query`, `shader-f16` and `subgroups`;
  - `maxComputeInvocationsPerWorkgroup: 1024`;
  - the user agent, `HeadlessChrome/155.0.0.0`.

### What I learned

- The WebGPU specification makes an adapter single-use: once `requestDevice` succeeds, the adapter is consumed.
  - A fresh context per repetition therefore means `requestAdapter` + `requestDevice` each time.
  - The protocol must check that each new adapter is the same GPU as the one the device was fingerprinted from.
- The guide's pseudocode (§28) calls `adapter.requestDevice` repeatedly on one adapter. That does not work, and it is
  the first deviation.

## Step 2: Measure what a fresh context costs

The guide asks for each kernel to run in a fresh context. It leaves open what a context is:

- one GPUDevice per repetition, shared by all kernels in that repetition; or
- one GPUDevice per kernel per repetition.

The second is the independent unit; the only question was whether it is affordable. It is:

- a device costs about 1 ms;
- a pipeline costs about 0.5 ms;
- the dominant cost of a repetition was generating inputs on the CPU. That does not depend on the context at all, so
  it can be done once.

### What I did

- Built the page with `pnpm build`, then ran a scratch script, `scratchpad/cost.mjs`, through
  `withPage({ webgpu: true })`. It:
  - calls `wb.setDevice("webgpu")`;
  - counts kernels per preset;
  - times 8 calls of `device.freshDevice()`;
  - compares `runKernel` with `measureKernels(…, { reps: 3 })`. `runKernel` uses the persistent device and a cached
    pipeline, and checks outputs on every call.
- A second scratch script, `scratchpad/breakdown.mjs`, timed three things per kernel, 5 times each:
  - `freshDevice()`;
  - `createShaderModule` + `createComputePipelineAsync`;
  - `std.gpu.kernelInputs(kern, 1)`.

### What worked

Medians of 5, in ms:

| kernel                          | device | pipeline | inputs | input MB |
| ------------------------------- | ------ | -------- | ------ | -------- |
| W-05 k_rms_norm_reduce          | 1.2    | 0.5      | 37.8   | 16.79    |
| W-10 k_matmul_reduce            | 0.9    | 0.6      | 2.4    | 1.05     |
| W-10 k_matmul_ew_softmax_reduce | 1.0    | 0.5      | 4.9    | 2.10     |
| W-10 k_matmul_reduce_2          | 0.9    | 0.6      | 6.0    | 2.62     |
| W-18 k_ew                       | 1.2    | 0.5      | 38.1   | 16.78    |

- `freshDevice()` alone took 14.9 ms the first time in a page, then 0.4–0.5 ms.
- Whole cost per kernel and repetition, over 3 repetitions:

  | preset | fresh device | persistent device |
  | ------ | ------------ | ----------------- |
  | W-05   | 59 ms        | 82 ms             |
  | W-10   | 11.8 ms      | 13.9 ms           |

  The persistent path is slower only because `runKernel` checks outputs on every call.

### What I learned

- The decision: **one fresh GPUDevice per kernel per repetition.**
  - A device shared by the kernels of one repetition would let one kernel's allocations and residency shape the next
    kernel's sample. That is the dependence repetitions exist to break.
  - Avoiding it costs about 1.5 ms per kernel and repetition.
  - The code comment on `measureKernels` says this and points here.
- Inputs depend only on the kernel and `INPUT_SEED`.
  - So `measureKernels` makes them once per call, in a `Map` keyed by kernel, and uploads them afresh into each
    context.
  - That removes about 38 ms per repetition for W-05.

### What was tricky

- A 0.5 ms pipeline compile in a brand-new device means Dawn reuses compiled shaders across devices inside one
  process. A fresh device is therefore not a cold compile.
- That does not matter for timing, because compiles are not timed. But "fresh context" should not be read as
  "nothing cached anywhere".

## Step 3: Implement the protocol, batch measureProgram, keep failed repetitions

### What I did

- `K/src/std/devices.js`:
  - `repetitionOrder(n, seed, rep)`: a Fisher–Yates shuffle with `rng(\`${seed}:${rep}\`)` from `@kiln/evidence`.
  - `runProtocol(kernels, { reps, warmup, launches, seed }, runOne, { kind, onStep })`: the bookkeeping, with no GPU
    code in it. In each repetition it runs the kernels in that repetition's order. For each kernel it:
    - takes `median(times)` as the sample;
    - records the kernel's `position`;
    - asks for the output check until a repetition of that kernel completes;
    - turns a throw into `repErrors: ["repetition r: message"]`.

    A kernel with no completed repetition gets
    `{ us: Infinity, samples: [], error: "all N repetitions failed; repetition 0: …" }`.
  - `runOnce(dev, pipe, kern, { warmup, launches, timestamps, check, ins })`: one kernel, once, on one device.
    - It times each launch with timestamp queries when they are granted, else with the wall clock per submit.
    - It pops the error scopes also on failure.
    - Its `finally` destroys every buffer and the query set.
  - `WebGpuDevice`:
    - `protocol = { reps: 7, warmup: 3, launches: 20, seed: 1 }`.
    - `freshDevice()` asks for a new adapter and compares it with the fingerprint on vendor, architecture, device,
      description and timestamps. On a mismatch it refuses with "the adapter is not the probed GPU (…)".
    - `measureKernels(kernels, opts = {}, { onStep })`, where `opts` overrides `this.protocol`.
    - `runKernel` is kept: one repetition on the probe's device.
- `K/src/std/tune.js`: `measureProgram` now:
  - collects the un-memoised kernels, deduplicated by identity and row;
  - calls `device.measureKernels(todo, {}, { onStep })` once;
  - records each result in program order, keeping the existing memo, `onKernel` and activation logic.

  Sim and CUDA devices have no `measureKernels` and keep the per-kernel path.
- `K/src/std/records.js` (outside my assigned files; a minimal edit):
  - each `repErrors` entry becomes a `repetition error: …` reason, next to the small-n reason;
  - `protocol.seed` comes from `result.seed` when the device reports one.
- `K/test/protocol.mjs`: script-style checks, now 38, of everything above that runs without a GPU. They include
  `measureProgram` against a fake device whose `measureKernels` uses `runProtocol`, and a compile on that device
  afterwards that decides by evidence.

### Why

- Keeping the bookkeeping pure makes the order, positions and error handling testable in Node. The GPU part is the
  `runOne` callback.

### What didn't work

- Nothing failed at this step. `node test/protocol.mjs`, `test/tune.mjs` and `test/evidence.mjs` passed on the first
  run.

### What warrants a second pair of eyes

- `order`: the guide's record has a protocol `order`. I store each kernel's `position` per repetition instead.
  - `validateRecord` requires `position.length === samples.length`.
  - Given the kernel list, the full order of a repetition can be recovered from `repetitionOrder(n, seed, rep)`. But
    the record does not name the other kernels.
  - Phase 6's paired records (`pairId`) will need the partner's identity; that is the place to add it.
- The `records.js` edit is outside my assigned files.

## Step 4: The headless Chrome test, and a coarsened timer in ordinary Chrome

The test `W/test/webgpu.mjs` loads the built page in headless Chrome with WebGPU and selects the webgpu device. It
measures W-05 (one kernel) and W-10 (three kernels), then checks the stored records and the next compile.

While reading raw launch times, I compared Chrome with and without `--enable-unsafe-webgpu`. Without the flag, every
timestamp sits on a 65.536 µs grid. Such records must not decide anything, so the device now detects the grid and
marks the records partial.

### What I did

- Wrote `W/test/webgpu.mjs`.
  - It takes preset ids and `--shot DIR` as options.
  - Added a `test:webgpu` script to `W/package.json`: `node build.mjs && node test/webgpu.mjs`.
  - Added `--skip webgpu.mjs` to the package's default `test`.
- What the test checks:
  - the `evidenceId` is fingerprinted and matches `^webgpu:[a-z0-9-]+-[0-9a-f]{8}$`;
  - there is one record per kernel;
  - the timing kind matches the adapter (`gpu-timestamp` when timestamps are granted).
  - For each valid record:
    - `samples.length === protocol.reps === 7`, with seed 1;
    - there are 7 × 20 raw launch times;
    - the positions equal `repetitionOrder(n, 1, rep).indexOf(kernel)`;
    - the output check passed;
    - the store's interval holds the median.
  - In a multi-kernel run, each repetition puts every kernel at a distinct position.
  - `wb.measure` recompiles afterwards. Each measured fork must be decided by evidence, with a note, when its
    records are decisive, and by the model otherwise.
  - There are no page errors.
- When the device probe fails, the test exits 0 with `skip: WebGPU unavailable …`.
- Wrote a Chrome wrapper, `scratchpad/chrome-safe.sh`, passed as `CHROME=`. It drops `--enable-unsafe-webgpu`, to
  show what an ordinary browser grants.

### What worked

`pnpm --filter @kiln/workbench test:webgpu`, 2026-10-19 (abridged; every `ok` line passed):

```text
adapter apple metal-3 · timestamps granted · HeadlessChrome/155.0.0.0
device webgpu:webgpu-apple-metal-3-2167faf0 · protocol 7 reps × 20 launches, 3 warm-up, seed 1
W-05: 1 kernel, measured in 0.18 s · timer step 0.001 µs
  k_rms_norm_reduce   MAP=row,TPB=1024,STAGE=reused  gpu-timestamp n=7 median 195 µs [194, 196]
                      samples 580 194 195 195 194 195 196 · fresh · max |err| 1.2e-7
  next compile: by evidence (confirms the model)
W-10: 3 kernels, measured in 0.19 s · timer step 0.001 µs
  k_matmul_ew_softmax_reduce  MAP=row,TPB=128                        median 42.3 µs [42.1, 42.4]
                      samples 134 42.4 42.2 42.3 42.3 42.1 42.1 · positions 0022222
  k_matmul_reduce     MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2          median 73.0 µs [71.6, 73.3]
                      samples 73.0 221 71.6 73.3 73.2 71.9 71.3 · positions 2211001
  k_matmul_reduce_2   MAP=tiled,BM=128,BN=64,BK=16,TM=8,TN=2          median 95.8 µs [95.8, 96.0]
                      samples 289 96.0 94.9 95.8 95.9 95.8 95.8 · positions 1100110
  next compile: all three by evidence (confirms the model)
all webgpu checks pass in 2.1 s
```

- I ran the same test nine more times with a 45 s limit each (`scratchpad/loop.mjs`). All passed, in 2.0–2.6 s each.
- Timestamp resolution, W-10, 2 repetitions:
  - with `--enable-unsafe-webgpu`, the raw times are `220.25, 220.875, 222.125, 220.292, …` µs, on a 1 ns grid;
  - without it, they are `196.608, 262.144, 196.608, …` µs: all multiples of **65.536 µs** (2^16 ns). The guide and
    common lore say 100 µs; Chrome 155 on macOS uses 65.536 µs.
- I added `timerQuantum(times)` to `devices.js`. It finds the grid: the smallest gap between distinct values, when
  every value is a multiple of it. It returns `Infinity` when every launch read 0.
- `measureKernels` reads the grid over the whole run. When the step is 1 µs or more, it sets
  `partial: ["timestamps quantized to 65.536 µs by the browser"]` on every result.
- `makeRecord` appends a result's `partial` to the record's caveats. This is a second one-line edit to `records.js`.
- Through the wrapper, the test now passes with every record `partial` and every fork decided by the model:

```text
W-10: 3 kernels, measured in 0.29 s · timer step 65.536 µs
  k_matmul_reduce  … samples 197 65.5 65.5 65.5 98.3 131 197 · partial (timestamps quantized to 65.536 µs by the browser)
  next compile k_matmul_reduce: by model → MAP=tiled,BM=128,BN=128,BK=8,TM=8,TN=2
```

- Screenshots of Perf after measuring on WebGPU:
  - `various/screens/p3-webgpu-W-05-perf-1600.png`;
  - `various/screens/p3-webgpu-W-10-perf-1600.png`, which shows a run at a low GPU clock: 141, 131 and 289 µs.

### What didn't work

- The first run failed with `Error: ReferenceError: id is not defined`, from the in-page code.
  - The preset id was interpolated into `wb.load(…)` but not declared for the object the page code returns.
  - Fixed by declaring `id` in the page.
- The ordinary-Chrome run failed with `FAIL …: the store's interval [—, —] holds its median, n=undefined`.
  - A partial record has no interval: `statsFor` returns null for records that may not decide.
  - The interval check now applies to decisive records only, and partial records are checked to have no interval.

### What I learned

- In an ordinary Chrome, the workbench's WebGPU timings of kernels under a few hundred µs are mostly quantization.
  `k_matmul_ew_softmax_reduce`, 42 µs with a fine timer, reads 65.5 or 131 µs.
- Before this step, those records would have been valid and decisive.

### What should be done in the future

- Tell the user in the Devices view when the timer is coarse. The record says so; the view could too.
- Tell them how to get a fine timer: chrome://flags "WebGPU Developer Features", or `--enable-unsafe-webgpu`.
- A coarse timer could still measure long kernels: time a whole batch of launches with one begin/end pair, so the
  batch length divides the quantum. Not done; the records are marked partial instead.

## Step 5: What the numbers say about this GPU

The samples of one kernel are not spread around one value across repetitions. They take a few discrete levels, and
the first repetition after an idle GPU is often about 3× slower than the rest. The levels look like GPU clock states.

The protocol handles this as it should: the median is robust and the intervals widen. But it means an unpaired
comparison between two protocol runs on this machine can differ by 3× for the same code.

### What I did

- Ran the test three times over W-05, W-10, W-22 and W-24 (`node test/webgpu.mjs W-05 W-10 W-22 W-24`).
- Ran `scratchpad/preheat.mjs`: 8 trials each of W-05 and W-22, each after 1.5 s idle. Trials alternated between no
  pre-heat and about 150–200 ms of back-to-back `runKernel` launches just before the protocol.

### What worked

- W-22 `k_one_pass`, same code, three runs:
  - The medians were 96.7, 96.9 and **294 µs**. In the third run every repetition sat at 293–295.
  - Across the runs its samples took the values 96.7, 123, 150, 177, 234 and 295 µs. The ratios, 1 : 1.27 : 1.55 :
    1.83 : 2.42 : 3.05, form a ladder, not noise.
- W-05's first repetitions took 572, 513, 575 and 580 µs, before settling at 188–196 µs (a ratio of about 3.0).
- Within a repetition, launches agree closely; for W-10 the raw times were `73.6, 76.9, 76.4, 76.1, …`. The variance
  is between contexts, which is what repetitions are for.
- Long kernels are stable. W-24 `k_linear_ew_reduce` measured 1338 µs [1337, 1342], with three runs within 0.1%.
- Pre-heating did not help reliably:
  - W-05 first samples with pre-heat: 355, 582, 242, 576 µs; without: 573, 578, 518, 576 µs;
  - pre-heated W-22 runs still had repetitions at 294 µs.

### What I learned

- On Apple Silicon without clock control, the GPU's clock state is the dominant source of variance for kernels under
  about 300 µs. The gaps between fresh contexts (CPU work, device creation) let the clock drop.
- The protocol's answer is conservative here:
  - the median is taken over repetitions;
  - the interval comes from the samples;
  - decisions use separated intervals only.

  Wide intervals lead to "within noise" and the model's choice, not to a wrong switch.
- The paired comparison of Phase 6 is the right tool on this hardware: both schedules run in every repetition, in
  random order. Both members of a pair see the same clock state far more often than two separate runs do.

### What should be done in the future

- Consider a reference kernel in every repetition, and record its time. Samples could then be read relative to the
  clock state the repetition ran at. The guide does not have this; noted for Phase 6.

## Step 6: A kernel that fails its check on Metal, and a hang

### What I did

- W-24 `k_linear_gelu_reduce` (shape [256, 3072]) failed its output check in every run:
  `59 of 384 values differ (first at 4: 1.0000000150474662e+30 vs 22.855934143066406)`.
  - `scratchpad/gelu.mjs` pinned every schedule of that fork and measured each once: TPB 64…512, with and without
    COARSEN, and the tiled rows.
- One run of the test (unsafe flag, right after a rebuild) never finished.
  - It printed nothing until `withPage`'s 600 s timer killed Chrome.
  - Then Node printed `Warning: Detected unsettled top-level await at …/test/webgpu.mjs:22`.

### What worked

- The gelu kernel:
  - Every schedule fails identically, so it is not a schedule bug.
  - `checkValues` maps NaN to `1e30` (`K/src/std/program.js:72`), so the GPU wrote NaN.
  - GELU is decomposed with the tanh approximation (`K/src/std/tensor.js:271`). At x ≈ 22.9 the argument of `tanh`
    is about 0.80 · (22.9 + 0.045 · 22.9³) ≈ 440, and `tanh` of such an argument returns NaN in Metal.
  - The protocol did its job: the record is invalid with that reason and never decides, and the next compile falls
    back to the model.
  - The fix belongs to the WGSL emitter: clamp the argument of `tanh`, for example to ±15. That is not in this part's
    files.
- The hang did not recur in the next 14 runs, and I could not tell where it waited. Two changes follow from it.
  - `measureKernels` now races each kernel-repetition against `CONTEXT_TIMEOUT_MS` (60 s), using `deadline(…)`.
    - A GPU that stops answering fails that repetition, with `repErrors` "no answer from the GPU within 60 s".
      Before, it would have left `wb.measuring` set forever.
    - The device is destroyed when the deadline fires, and also if it arrives after the deadline. Destroying it
      settles anything it still has pending.
    - Node checks cover `deadline` and a hung repetition inside `runProtocol`.
  - `scripts/shoot.mjs` has a matching weakness, which I did not fix.
    - Its `Page` never rejects pending calls when the websocket closes. When its timer kills Chrome, a pending
      `eval` stays unsettled, and Node exits with that warning instead of an error.
    - The fix is to reject `pending` when `ws` closes.
    - That file was mine to change only if its `--webgpu` flags needed fixing, and they did not.

### What warrants a second pair of eyes

- 60 s is generous. A kernel taking more than about 2.5 s per launch would hit it with 23 launches. None comes close
  today; the slowest seen took 26 ms.

## Summary of deviations from the guide

- A new adapter per fresh context, because adapters are single-use, checked against the fingerprint.
- `protocol.position` per kernel instead of a protocol `order` in the record.
- Three small edits to `records.js`, so that `makeRecord` receives from the device:
  - repetition errors (`repErrors`);
  - the protocol seed (`seed`);
  - a coarse-timer caveat (`partial`).
- Inputs generated once per `measureKernels` call, since they do not depend on the context.
- A per-context deadline, which the guide does not have.

## Code review instructions

- Read in this order:
  1. In `K/src/std/devices.js`: `repetitionOrder`, `runProtocol`, `timerQuantum`, `deadline`, then
     `WebGpuDevice.measureKernels` and `runOnce`.
  2. `measureProgram` in `K/src/std/tune.js`.
  3. The `repErrors`, `seed` and `partial` lines in `makeRecord` (`K/src/std/records.js`).
- Validate:
  - `node packages/kiln/test/protocol.mjs` (38 checks);
  - `pnpm test`;
  - `pnpm build`;
  - on a machine with a GPU and Chrome, `pnpm --filter @kiln/workbench test:webgpu`.
- To see the ordinary-browser path, run the test with `CHROME` pointing at a wrapper that drops
  `--enable-unsafe-webgpu`.

## Technical details

- Default protocol: 7 repetitions × (3 warm-up + 20 timed launches), seed 1.
  - A W-10 measure (3 kernels) takes about 0.19 s.
  - A W-24 measure (3 kernels of 1–1.3 ms each) takes about 0.6 s.
- `measureKernels(kernels, opts, { onStep })` calls `onStep(done, total)` once per kernel-repetition.
  - `wb.measure` passes only `onKernel`, which now fires after the whole batch, so the progress counter jumps from 0
    to N.
  - Passing `onStep` through `measureProgram` would restore per-step progress. That change is in `W/src/ui/wb.js`,
    which is not mine.
- `timerQuantum` reports a step of 0.001 µs with the unsafe flag, because Dawn hands out integer nanoseconds. Without
  the flag it reports 65.536 µs.
