# 02 — Kiln and Perf Lab: what exists today (research for KILN-002)

Read-only research, 2026-10-20. Every fact carries a `path:line` reference. Path roots used below:

| Root   | Absolute path                                                                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KILN` | `/Volumes/SSD/code/kiln`                                                                                                                                                      |
| `KS`   | `KILN/packages/kiln/src` (`core/` and `std/`)                                                                                                                                 |
| `WB`   | `KILN/apps/workbench`                                                                                                                                                         |
| `SRV`  | `KILN/apps/server/src`                                                                                                                                                        |
| `LAB`  | `KILN/lab-workbench` (Perf Lab, imported verbatim)                                                                                                                            |
| `G1`   | `KILN/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/design-doc/01-kiln-x-perf-lab-intern-guide-to-the-unified-gpu-kernel-workbench.md` |
| `T1`   | `KILN/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/`                                                |
| `MP3`  | `/Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/ttmp/2026/10/12/ML-PERF-003--running-perf-lab-experiments-on-the-dgx-an-ssh-executor-for-containerized-gpu-captures/` (untracked in the playback worktree) |

Nothing under `LAB/.data`, `KILN/apps/server/.data`, or any `*.sqlite` file was opened, and no `.env` file was read. Nothing
was built, run, formatted, or committed, and no ssh or network was used.

## Diary

What I read and ran, in order.

1. **Listed `KILN`.** It has `apps/`, `imports/`, `lab-workbench/`, `packages/{evidence,kiln,lab}`, `runner/`,
   `scripts/`, `ttmp/`. The KILN-002 workspace holds only stubs: `design-doc/01` is 54 lines, `reference/01` is 42
   lines, and `sources/` was empty before this file.
2. **Read the Kiln compiler core.** Files: `KS/core/ix.js`, `KS/std/{fns,index,targets,kernel,tensor,emit,program,emmy,tile,loop,devices,records}.js`.
   I read `tile.js` for the knobs, `analyze`, `legalMaps`, `forkTree`, `timeModel` and `estimate`. I read `loop.js` for
   `E`, `schedule`, `compilePoint` and the fusion guard.
3. **Found the presets** in `WB/presets/W-NN-*.js` (each with a `.md`). `WB/build.mjs:15-30` generates them into
   `src/presets.gen.js`.
   - Dead end: a grep over `WB/src/docs.gen.js` dumped the embedded runner source. Generated `*.gen.js` files are
     bundles of other files, so exclude them from greps.
4. **Read the KILN-001 guide (`G1`, 2191 lines).** Sections: §6–8, §10–11, §15.3, the K/P limitation tables in §17–18,
   §30, §33, §34, the Part VI phases, and §37. Also read `T1/tasks.md`, diaries `T1/reference/01`, `05` and `09`, and
   `T1/sources/03-*`.
5. **Read the Kiln server's CUDA executor path.** Files: `SRV/executors/{types,index,cuda-runner}.ts`, `SRV/devices.ts`,
   an outline of `SRV/jobs.ts`, and `KILN/runner/kiln_runner.py`.
6. **Read Kiln's lab server.** Files: `SRV/lab/{routes,probe,importer,import,captures}.ts`.
7. **Read `packages/evidence`** (`stats.ts`, `verdict.ts`, `identity.ts`, `values.ts`, `index.ts`, `protocol.ts`)
   **and `packages/lab`** (`src/lang/{rows,refs,values,generate}.ts`, `scripts/{check-pl,perf-lab}.ts`, `package.json`).
8. **Read Perf Lab's source** (never `.data`).
   - `LAB/workloads/perf_lab_local/{probe,sampler,run}.py` and `LAB/workloads/pyproject.toml`.
   - `LAB/server/{runner,index,config,probe,importer}.ts` and the head of `LAB/server/dino.ts`.
   - `LAB/src/lang/{library,env,stats}.ts` and `LAB/src/lang/build.ts:395-640`.
   - `LAB/src/data/capabilities.ts`, the verdict logic in `HypothesisView.tsx`, and
     `LAB/src/presets/programs/local-sampler.lab.js`.
9. **Read the ML-PERF-003 ticket (`MP3`).** Files: `index.md`, `tasks.md`, `changelog.md`, and
   `design/01-intern-guide-running-perf-lab-experiments-on-the-dgx.md` (1027 lines; §0–2, 4–6.4, 6.8, 6.13, 8–11).
   Also `reference/01-implementation-diary.md`.
10. **Re-verified the excerpts quoted below** against `W-08`, `W-12`, `W-16`, `W-21`, `devices.js`, `emit.js`,
    `tile.js`, `emmy.js`, `loop.js`, `fns.js`, `targets.js`, `tensor.js` and `program.js`. Also `WB/test/export-cuda.mjs`,
    `LAB/server/runner.ts` and `dino.ts`, and `LAB/workloads/perf_lab_dino/run.py`.
11. **Compared `KILN/lab-workbench` against the playback original** at
    `ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/experiments/lab-workbench`.
    The command was
    `diff -rq -x .data -x node_modules -x __pycache__ -x '*.sqlite*' -x dist -x .venv <kiln copy> <playback copy>`.
    It printed nothing, so the two copies are identical outside the excluded paths, and `.data` was never entered.
    `git log -- lab-workbench` in `KILN` shows a single commit, `92daa13 Import Perf Lab (verbatim) and Kiln Workbench
    sources; open KILN-001`.

### Surprises

- **No `--flush-l2` in the runner.** `G1` §30.6 promises a `--flush-l2` runner flag, but `KILN/runner/kiln_runner.py`
  has none. A grep for `flush` hits only `sys.stdout.flush`/`print(..., flush=True)`
  (`kiln_runner.py:58,451`). There is no L2 flush and no clock lock.
- **Input seeding moved.** `G1` §6.6 says inputs are seeded by kernel **name**, but the code now seeds by kernel
  **identity**. The comment and code are at `KS/std/program.js:46-48`.
- **A second Perf Lab workload exists.** `LAB/workloads/perf_lab_dino/run.py` (261 lines) runs Playback's Grounding DINO
  at two revisions (ML-PERF-002). `LAB/server/dino.ts` dispatches it from a hard-coded branch,
  `LAB/server/runner.ts:288`. My earlier picture of "one workload" was wrong. This is the precedent for adding a
  workload package (Q10).
- **The CUDA runner has never timed a kernel on an NVIDIA GPU.** See Q4.
- **The `corresponds_to` edge exists only in prose.** It is named in the memo and the guide, but no code anywhere
  mentions it (Q5).
- **The fidelity comparison was not done by `check:pl`.** `check:pl` only builds and prints with `@kiln/lab`. The
  comparison against Perf Lab's own code was done with scratch scripts (`baseline.mts` vs `port.mts` plus
  `diff.mjs`), per `T1/reference/09-phase8a-lab-language-diary.md:98,316-334`.

### Failing commands (zsh)

- `echo =======` fails with `(eval):1: ====== not found`, because zsh `=` expansion treats it as a command lookup. Quote it.
- `grep -rn ... --include=*.js` fails with `no matches found: --include=*.js`, because the glob is expanded by zsh.
  `--include='*.js'` works.
- `sed -n 15,24p tile.js` from `KS` fails with `No such file or directory`, because `tile.js` lives in `KS/std/`, not
  `KS/`.

## Findings

### Q1. Kiln's authoring API: how a kernel is written

**Script scope.** A project script is plain JS evaluated with this scope:

```js
// KS/std/index.js:74-77
export function makeScriptScope(sink) {
  const project = (name = "project") => { const p = new Project(name); sink.projects.push(p); return p; };
  return { k, P, std, N, T, nn, tensor, Tensor, ix: IX, project, param: k.param, E, KB, kx };
}
```

The headless entry is `runScript(text, extra)` at `KS/core/script.js:21`.

**`Project` builder** (`KS/std/index.js:35-73`):
- Methods: `.pipeline(p)`, `.program(fn, inputsSpec)`, `.data`, `.check(name, fn)`, `.params(...)`, `.pins`, `.device`,
  `.about`, `.note`, and `.hypothesis(id, h => h.claim().predicts(rows, pred).alternatives().scope())` (builder at
  `KS/std/evidence-context.js:161-168`).
- With no `.pipeline`, the project uses `std.emmy.pipeline()`.

**Inputs and parameters.**
- `k.tensor(shape)` declares an fp32 input (`KS/core/kiln.js:9`).
- `std.weight(name, shape)` declares a named weight (`KS/std/tensor.js:165-170`).
- Sliders come from `param.int/float/enum/bool`. `param.int` takes `{min, max, default, scale: "log", help}` (see the
  presets below).

**Frontend ops `N.*`** (`KS/std/tensor.js:194-211`):
- Elementwise through `N.ew`: add, sub, mul, div, max, min, pow, exp, log, sqrt, rsqrt, tanh, sigmoid, relu, abs, neg,
  square, sin, cos, select, gt, lt.
- Reductions: `sum`/`amax`/`mean(x, axis=-1, keepdim=true)`.
- Layers: `linear(x, w, b?)`, `matmul`, `rms_norm`, `layer_norm`, `softmax(x, dim)`, `gelu`, `silu`.
- Shape ops: `transpose(x, d0, d1)`, `reshape(x, shape)`, `slice(x, axis, start, end)`.
- Constants: `weight`, `const(v, shape)`.

**Tensor IR helpers `T.*`** (`KS/std/tensor.js:176-190`):
- `T.view(x, shape, mapFn)` creates an index-map view with no copy.
- `T.bc`, `T.ew`, `T.reduce`, `T.sum`, `T.max`, `T.squeeze`, `T.reshape`.

**Index expressions** (`KS/core/ix.js`):
- Terms: `C(n)`, `V(name)`, and add/sub/mul/div/mod (floor), min/max, lt/le/eq/and/or, with affine simplification.
- `IxMap`, `map(n, fn)` and `compose` live at `KS/core/ix.js:226-241`.

**Loop IR builder `E`:**

```js
// KS/std/loop.js:50-60
export const E = {
  num: (v) => intern({ k: "num", v: +v }),
  load: (i, idx) => intern({ k: "in", i, idx: idx.map(IX.lift) }),
  op: (fnName, ...a) => { /* constant-folds, canonicalizes commutative ops */ ... },
  red: (fnName, r, n, body) => { reducer(fnName); return intern({ k: "red", fn: fnName, r, n, body }); },
};
```

- `schedule` hoists loop-invariant values to the outermost legal loop (`KS/std/loop.js:90-154`).
- The function table is `KS/std/fns.js:4-37`.
- Reducers are **add/max/min/mul only** (`KS/std/fns.js:38-43`).

**Pipeline.** Seven IRs with strict checkpoints:

```js
// KS/std/emmy.js:18-35 (abridged)
k.pipeline(name)
  .ir("torch", { dialects: [nn, tensor] }).pass(decomposition)
  .ir("tensor", { dialects: [tensor], strict: true }).pass(optimization).pass(lift).pass(fuse).pass(stamp)
  .ir("loop",   { dialects: [loop, tensor], strict: true }).pass(tilePass)
  .ir("tile",   { dialects: [tile, tensor], strict: true }).pass(kernelPass)
  .ir("kernel", { dialects: [kern, tensor], strict: true }).pass(emitPass)
  .ir("gpu",    { dialects: [gpu, tensor], strict: true })
  .target(t).decide(defaultDecide(store)).build();   // default target SPECS.rtx5090
```

The default decide chain is pinned → evidence(store) → costPrior → first (`KS/std/emmy.js:12-17`).

**Schedule knobs.** Every kernel's schedule fork is the product of these, filtered for legality:

```js
// KS/std/tile.js:15-24 (abridged)
MAP     ["thread","row","tiled"]   TPB [32..1024]   COARSEN [1,2,4]   STAGE ["none","reused","all"]
BM [16,32,64,128]  BN [16,32,64,128]  BK [8,16,32]  TM [1,2,4,8]  TN [1,2,4,8]
```

- `legalMaps` (`KS/std/tile.js:99-104`) allows `row` only if the loop has a reduction (`an.rd != null`), and `tiled`
  only if `analyze` (`KS/std/tile.js:31-97`) detected a contraction.
- `forkTree` (`KS/std/tile.js:105-128`) drops options exceeding `smemPerBlock` or `maxThreadsPerBlock`.
- The fusion blowup guard allows 2% slack (`KS/std/loop.js:342`, limitation K-9).

#### Matmul-like kernel: the exact shape

```js
// WB/presets/W-08-linear.js:10-17
const M = param.int("M", { min: 64, max: 8192, default: 1024, scale: "log", help: "tokens" });
const K = param.int("K", { min: 64, max: 8192, default: 1024, scale: "log", help: "in features" });
const Nf = param.int("N", { min: 64, max: 8192, default: 1024, scale: "log", help: "out features" });
project("linear")
  .params(M, K, Nf)
  .program(({ x }, { param }) => ({ y: N.linear(x, std.weight("W", [param(Nf), param(K)])) }),
           ({ param }) => ({ x: k.tensor([param(M), param(K)]) }));
```

- **`.program` takes two callbacks.** The first, `(inputs, {param}) => ({outName: tensorExpr})`, defines the outputs.
  The second, `({param}) => ({inputName: k.tensor(shape)})`, defines the inputs.
- **`N.matmul` decomposes to a view and a sum.** It becomes two views, an elementwise `mul`, and `T.sum(..., -2)`
  (`KS/std/tensor.js:248-254`). The tile pass recognises that as a contraction and offers `MAP=tiled`.
- **Schedules can be forced.** `WB/presets/W-21-matmul-ladder.js:10-36` pins each schedule with a custom decide policy:

```js
// WB/presets/W-21-matmul-ladder.js:21-31 (abridged)
const ladder = k.decide.cost(({ knobs, run }) => {
  const want = LADDER[run.params.get(STEP)];
  if (!want) return null;
  return Object.entries(want).every(([key, v]) => knobs[key] === v) ? 0 : Infinity;
}, { name: "ladder" }).for("schedule");
const base = std.emmy.pipeline();
project("matmul-ladder")
  .pipeline(base.with({ decide: k.decide.chain(k.decide.pinned(), ladder, base._decide) }))
  .params(N_, STEP)
  .program(({ a, b }) => ({ c: N.matmul(a, b) }), ({ param }) => ({ a: k.tensor([param(N_), param(N_)]), b: k.tensor([param(N_), param(N_)]) }))
  .check("the schedule this step asks for", ({ run }) => { const d = run.decisions[0]; /* ... */ });
```

#### Stencil-like kernel: the exact shape

```js
// WB/presets/W-12-blur.js:8-22
const H = param.int("height", { min: 32, max: 4096, default: 1024, scale: "log" });
const W = param.int("width", { min: 32, max: 4096, default: 1024, scale: "log" });
const r = param.int("radius", { min: 1, max: 3, default: 1 });
project("blur")
  .params(H, W, r)
  .program(({ img }, { param }) => {
    const h = param(H), w = param(W), k2 = 2 * param(r) + 1;
    let acc = null;
    for (let dy = 0; dy < k2; dy++) for (let dx = 0; dx < k2; dx++) {
      const s = N.slice(N.slice(img, 0, dy, dy + h), 1, dx, dx + w);
      acc = acc ? N.add(acc, s) : s;
    }
    return { out: N.mul(acc, 1 / (k2 * k2)) };
  }, ({ param }) => ({ img: k.tensor([param(H) + 2 * param(r), param(W) + 2 * param(r)]) }));
```

- A stencil is written as shifted `N.slice` views (index maps) summed. The adds fuse into **one kernel**.
- **Padding is the caller's job.** The input is declared pre-padded (`H + 2r`), because there is no boundary handling.
- **Weights are scalar literals.** A non-uniform stencil (Sobel, Gaussian) multiplies each slice by a different
  `N.mul(s, c)`.
- For an arbitrary affine view, use `T.view(x, shape, coordMapFn)` (`KS/std/tensor.js:176-190`).

#### Extending the compiler

- **A new frontend op** is declared with `k.dialect("ext").op(name, {args, traits, infer, print, eval})`. It is
  lowered by `std.decompose("ext.op", ({x}) => T....)` and wired in with
  `std.emmy.pipeline().insertRule("frontend/decomposition", rule).withIr("torch", {dialects: [..., Ext]})`
  (`WB/presets/W-16-new-op.js`, lines 11-21 of the file).
- **A custom pass** uses `k.rule`, `k.fork.toggle`, `k.pass` and `.insertAfter` (W-14).
- **A custom cost model** uses `k.decide.cost` (W-15, W-21).

#### What can and cannot be expressed

Expressible:
- pointwise and broadcast ops;
- single-axis reductions with add/max/min/mul;
- contractions, which get tiled schedules;
- stencils and convolutions written as sums of affine views/slices;
- transpose, reshape and slice;
- strided and div/mod index maps;
- multi-op programs, fused under the blowup guard.

Not expressible, with the source of each limit:
- **Gathers or data-dependent indexing.** `Ix` depends only on output coordinates (`G1` line 401; K-10). This rules
  out `grid_sample`/deformable sampling, histograms, scatter and top-k.
- **Index as a value.** There is no iota, so coordinate-dependent weights or masks must be passed in as an input
  tensor.
- **Integer tensors.** `Tensor` is a `Float32Array` (`KS/core/util.js:50-51`). Everything is fp32: no fp16/bf16 and no
  tensor cores.
- **Pair reducers.** There is no online softmax, Welford or argmax.
- **Atomics and sorting.**
- **More than one output buffer per kernel.** `KS/std/kernel.js:254` allows one.
- **Runtime shapes.** Shapes are baked at compile time, so every size is a literal in the emitted code.

The limitation table K-1..K-18 is at `G1:1045-1062`:
- **K-1** Sim times use the model's formula.
- **K-2** One best number per schedule.
- **K-3** The evidence key lacked code and hardware.
- **K-4** Minimal method; kind ignored.
- **K-5** Exploitation only.
- **K-6** Tune rollouts are blind to evidence.
- **K-7** `pinned()` applies only when all knobs are pinned.
- **K-8** `keepOriginal` uses `p.off`.
- **K-9** 2% fusion slack.
- **K-10** Coordinate-only index, scalar reducers, fp32 only.
- **K-11** Textbook codegen: no warp shuffles, no double buffering, no `cp.async`.
- **K-12** Blocked decisions are dead code.
- **K-13** Checks are sampled; the end-to-end check is skipped above 6e7 ops (10 presets).
- **K-14** The agent has full page privileges.
- **K-15** Runner Origin bypass and arbitrary CUDA.
- **K-16** No CI; pass names drift.
- **K-17** By-example rules read lambda text.
- **K-18** Silent scale limits: 20,000 fork leaves and 4,000 rewrites.

### Q2. The presets

**Where they live and how they are built.**
- Source is `WB/presets/W-01..W-25`, one `.js` and one `.md` each.
- Each `.js` starts with this header, parsed by `WB/build.mjs:16-20`:

  ```text
  /** W-NN Title
   *  group <g>
   *  about <a>
   *  try <t>
   */
  ```

- They are bundled into `WB/src/presets.gen.js` (`WB/build.mjs:15-30`).

**The 25 presets, by group:**

| Group           | Presets                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Basics          | W-01 Hello, dialect; W-02 Patterns, declines and guards; W-03 Lowering to a register VM; W-04 Forks, knobs and sliders                                                    |
| ML compiler     | W-05 RMSNorm, fused (carries hypothesis `row-beats-thread`); W-06 Softmax in one kernel; W-07 GELU; W-08 Linear layer, tiled; W-09 MLP and the blowup guard; W-10 Attention |
| Write programs  | W-11 N-body forces; W-12 Box blur, a stencil; W-13 LayerNorm with a residual                                                                                              |
| Extend          | W-14 Your own pass; W-15 Your own cost model; W-16 A new frontend op                                                                                                      |
| Other           | W-17 Regex→NFA→DFA→JS                                                                                                                                                     |
| GPU optimization | W-18 Roofline three regimes; W-19 Fusion; W-20 Batch size and arithmetic intensity; W-21 Matmul ladder; W-22 Variance three ways; W-23 Occupancy; W-24 Five GPUs; W-25 Model vs measurement |

- The closest templates for real work are W-08/W-21 (contraction), W-12 (stencil), W-07 (pointwise), W-05/W-13/W-22
  (row reductions) and W-11 (broadcast reduction).
- **Copies of Perf Lab's lab programs** live in `KILN/packages/lab/presets/`. They are registered for the workbench
  through the `LAB_META` entry in `WB/build.mjs`.

### Q3. Code generation, export, targets, cost model

**CUDA output.** `toCuda(K)` is at `KS/std/emit.js:14-45`. The signature is fixed:

```js
// KS/std/emit.js:21-24
lines.push(`extern "C" __global__ void __launch_bounds__(${K.block}) ${cname(K.name)}(${[...ins.map((p, i) =>
  `const float* __restrict__ src${i}`), "float* __restrict__ dst"].join(", ")}) {`);
lines.push(`    const int tid = threadIdx.x;`, `    const int bid = blockIdx.x;`);
for (const s of K.smem) lines.push(`    __shared__ float ${s.name}[${s.size}];`);
```

- Launches are 1-D: `tid` and `bid` are scalars.
- Shared memory uses static `__shared__` arrays, capped at 48 KiB per block.
- All sizes are literals.

**WGSL output.** `toWgsl(K)` is at `KS/std/emit.js:49-86`.
- Bindings: each input is `@group(0) @binding(i) b{i}` (read-only storage), and the output `bout` sits at binding
  `nIn`.
- Entry point: `@compute @workgroup_size(block) fn main`.
- A grid past 65535 is folded to 2-D, and the kernel starts with `if (bid >= grid) return`.
- There are no uniforms.

**Simulator.** `toSim` is a lockstep simulator (`KS/std/emit.js:92-201`).

**Kernel record.**
- `materialize` returns `{name, grid, block, smem, smemBytes, body, floats, ints, params[{name,size,shape,role}], map, row}`
  (`KS/std/kernel.js:244-257`).
- `programOf` produces `{id, name, K, cuda, wgsl, expr, shape, inShapes, args, map, row, identity, bytes}`
  (`KS/std/program.js:29-43`).
- `identity = hash("loop|"+expr.__key+"|"+shape+"|"+inShapes)`, so identity names what a kernel computes, not its
  schedule.
- `CODEGEN_VERSION = "kiln-codegen/2"` (`KS/std/records.js:11`).

**Export.** Yes, kernels can be exported, as CUDA source strings in a JSON bundle:

```js
// KS/std/devices.js:336-344
export function bundle(kernels, { seed = 1, reps = 50, warmup = 5, ncu = false } = {}) {
  return {
    format: "kiln-bundle/1", reps, warmup, ncu, created: new Date().toISOString(),
    kernels: kernels.map((kn) => ({
      name: kn.name, identity: kn.identity, row: kn.row, source: kn.cuda, grid: kn.K.grid, block: kn.K.block, smem: kn.K.smemBytes,
      inputs: kn.inShapes.map((s, j) => ({ size: numel(s), seed: seedOf(kn, seed, j) })), out: numel(kn.shape), samples: sampleIndices(numel(kn.shape), 384),
    })),
  };
}
```

- **UI path.** `wb.bundleJSON(opts)` (`WB/src/ui/wb.js:314`) backs the Devices panel's "Export the compiled kernels"
  download (`WB/src/ui/Perf.jsx:459`).
- **Headless path.** `WB/test/export-cuda.mjs:1-24` loads every preset through `wb.load`. It also pins the model's top
  alternatives at each schedule fork and writes `{preset, name, row, grid, block, smem, cuda, ...}` JSON to `argv[2]`
  (default `/tmp/kiln-kernels.json`) for `WB/test/cuda_check.py` (NVRTC + ptxas).
- **What an export does not give you.**
  - There is no host-side launcher, no PyTorch extension or `torch.library` op, and no strided or dynamic-shape ABI.
  - The ABI is contiguous fp32 `src0..srcN` plus `dst`, with shapes baked in.
  - To call a kernel from Playback code you would have to write the launch wrapper by hand: grid and block from the
    bundle, and `cudaFuncSetAttribute` is unnecessary since shared memory is static and at most 48 KiB.

**Targets.** `KS/std/targets.js:5-13` defines `rtx5090` (the default), `rtx4090`, `h100`, `a100` and `orin`, plus
`WEBGPU_DEFAULT`.
- Fields: `sm`, `sms`, `clockGHz`, `peakTflops` (FP32), `bwGBs`, `l2MB`, `smemPerSM`, `smemPerBlock` (48 KiB),
  `maxThreadsPerBlock`, `maxThreadsPerSM`, `maxBlocksPerSM`, `regsPerSM` and `launchUs`.
- `launchUs` is 2.5, except Orin at 5 and WebGPU at 15.
- **There is no GB10/DGX Spark entry and no RTX PRO 6000 (Blackwell workstation) entry**, the two Playback hosts.

**Cost model.** `timeModel` is at `KS/std/tile.js:152-194`.
- It computes occupancy limits from blocks, threads, shared memory and registers.
- It computes raw times for DRAM, L2 (3x bandwidth), compute, shared memory and issue.
- Efficiency curves are `memEff = min(1, .2 + 1.6·occ)` and `compEff = min(1, .25 + 1.5·occ)`.
- It works in waves and takes the per-wave max over resources, which makes it a roofline.
- `us = launchUs + core`, and the bound is reported as `launch` when `us < 1.5·launch`.
- `estimate` (`KS/std/tile.js:201-281`) supplies analytic counts, using a 12%/60% DRAM-vs-L2 heuristic.

### Q4. Execution, correctness, and whether it has ever run on an NVIDIA GPU

**Kiln server CUDA executor** (`SRV/executors/cuda-runner.ts`):
- **Profiles.** They are loaded from `executors.json` (`SRV/executors/index.ts:1-43`). The interface is at
  `SRV/executors/types.ts:58-68`.
- **`target` is `'local'` or `'ssh'`** (`cuda-runner.ts:17,60`). The host must be an SSH destination like `user@host`,
  with no `host:port` and no leading `-` (`cuda-runner.ts:42,61`).
- **SSH command.** It is `ssh -T -o BatchMode=yes -- <host> <script>` (`cuda-runner.ts:88,95`).
- **Runner placement.** The runner is copied content-addressed to `~/.cache/kiln-runner/` (`cuda-runner.ts:24,68`;
  copy logic around lines 79-96).
- **Invocation.** It runs `run - --out - --exit-on-eof` with the bundle JSON on stdin, kept open
  (`cuda-runner.ts:6,121`).
- **Abort and output limits.** Aborting kills the process group. Stdout is capped at 64 MiB (`cuda-runner.ts:28,70`).
- **Device identity.** `SRV/devices.ts` builds it with `cudaDevice`.

**Server jobs** (`SRV/jobs.ts`):
- `LIMITS` sits at line 20.
- The content id is recomputed, and a mismatch returns `409 content_id_mismatch`.
- Repetitions follow `repetitionOrder`, with one runner invocation per repetition (lines 322-358). There is also an
  agent budget.

**Runner** (`KILN/runner/kiln_runner.py`, `RUNNER_VERSION = "kiln_runner/2"` at line 42):
- **Prerequisites.** `find_nvcc` checks `PATH`, then `$CUDA_HOME/bin`, and otherwise exits with
  `nvcc not found: install the CUDA toolkit or set CUDA_HOME` (lines 61-65).
- **Build.** `nvcc -O3 -std=c++14 -arch=<native|$KILN_ARCH> -Xptxas -v`, cached by content (`build`, lines 161-181;
  `default_arch` at 332-333).
- **Harness** (`run_kernel`, lines 232-254):
  - inputs are generated with mulberry32;
  - the output is NaN-filled;
  - it runs the warmup launches, then `reps` launches, each bracketed by `cudaEventRecord` (lines 120-122);
  - it returns `us_all`, median, min, the sampled outputs (non-finite → 1e30) and the `-Xptxas -v` register count;
  - with `--ncu` it profiles via `profile` (lines 256+).
- **Device report.** `device_info` (line 184) plus `nvidia_smi` fields (line 204) plus the hostname.
- **Result format.** `kiln-results/1` (line 299).
- **Missing.** There is no L2 flush, no clock lock, and no co-tenancy check.

**WebGPU executor** (`KS/std/devices.js:110-286`):
- It creates a fresh `GPUDevice` per kernel per repetition.
- The protocol is `{reps: 7, warmup: 3, launches: 20, seed: 1}`.
- It uses timestamp queries when granted and wall clock otherwise. `timerQuantum` flags coarse timers.
- It checks 384 sampled outputs.

**Correctness checks:**
- **Per-measurement check.** `checkSamples` uses `rtol 2e-3, atol 2e-4` (`KILN/packages/evidence/src/protocol.ts:37-60`).
- **Reference.** `referenceAt` → `compilePoint` is the Loop IR's JS point evaluator (`KS/std/program.js:58-61`,
  `KS/std/loop.js:232-258`).
- **Simulator check.** It covers at most 512 outputs and detects out-of-bounds accesses and divergent barriers
  (`KS/std/program.js:83-111`).
- **End-to-end check.** It runs the whole program against the frontend op `eval`s with `rtol 1e-3, atol 1e-4`, and is
  skipped when the reference would exceed 6e7 operations (`WB/src/compile.js:42-59`, threshold at line 47).

**Real NVIDIA hardware: never timed.**
- `G1:145` says "CUDA compiled, never timed".
- `T1/reference/01-investigation-diary.md:205` says "Not run anywhere: ... the CUDA runner (no NVIDIA GPU here)".
- `T1/reference/05-phase5-server-diary.md:304-321` shows the `local-cuda` executor reporting `nvcc not found: install
  the CUDA toolkit or set CUDA_HOME`.
- Jobs were exercised only with a fake runner (`T1/reference/01-investigation-diary.md:1686`).
- The original Kiln README claims 79 kernels compiled through NVRTC + ptxas for sm_89 with no spills. It adds "Not
  tested: timings from a physical NVIDIA GPU" (`KILN/imports/kiln-workbench-src/kiln-workbench/README.md:68-72`).
- The one real measured comparison (Phase 6) ran on **WebGPU / Apple Metal**: paired ratio 0.0079 [0.0072, 0.0083]
  (`T1/reference/01-investigation-diary.md` around 1473-1490; `WB/test/paired-webgpu.mjs`).

### Q5. The lab / evidence entity model

**Entities and links.**
- `EntityKind` (`KILN/packages/lab/src/lang/rows.ts:9-25`) is one of: `run, request, span, kernel, code, op, tensor,
  alloc, instant, batch, graphgen, image, annotation, detection, check`.
- A link is `{from, to, rel, evidence, method}` (`rows.ts:27-32`).
- `LinkEvidence` is `direct | derived | heuristic | illustrative | unknown`
  (`KILN/packages/lab/src/lang/values.ts:39`).

**Refs.** An entity ref is `` `${runRef}!${kind}:${id}` ``, where `runRef = exp/arm/mode#rep`
(`KILN/packages/lab/src/lang/generate.ts:45-49`; `LAB/server/importer.ts:63-74`).

**Relations in use.**
- The set is `contains, launches, compiled_from, implements, aliases, retains, reads, writes` (`generate.ts:306-716`).
- The request-to-kernel program walks `contains → launches → compiled_from → implements`
  (`request-to-kernel.lab.js:35`).

**Value provenance.**
- `Prov` is `observed | derived | heuristic | illustrative | unknown` (`KILN/packages/evidence/src/values.ts:6`).
- The `Value` interface is at `values.ts:9-24`.

**`corresponds_to` does not exist in code.**
- The memo describes it. `KILN/imports/Untitled.md:154`, item 5: "**One entity graph for all kernels.** Generated,
  simulated and observed kernels in one graph, linked by `compiled_from`, `corresponds_to` and `implements`, each link
  with its evidence class. The route view then runs from a slow request down to the rewrite that made its kernel."
- `G1:1892` (§33) lists four parts: a headless language, boards as dock views, server routes, and one entity graph
  with `corresponds_to` edges.
- `G1:1907-1953` (§33.1 "As built (Phase 8a–8c, 2026-10-19)") reports three of the four built:
  - `@kiln/lab` uses `@kiln/evidence` for values, stats and verdicts. `evaluateHypothesis` returns
    `{verdict, checks, reasons, support}`.
  - `labEnv(data: LabData)` takes synchronous data methods.
  - Capture hashes stay cyrb53 (P-5).
  - The server has `/api/lab` with migration-2 `lab_*` tables and the `lab:import` importer. Lab jobs answer 501.
  - The checks are `check:pl`, unit tests (lab 98, server 89) and `lab-e2e.mjs`.
- **Not built:**
  - the entity graph;
  - lab job execution;
  - dataset materialization;
  - `catalog.changed` refresh.
- **Where the edge is planned.** Phase 8 is defined in `G1` §35 (around 2081-2086) with four sub-phases. The open item
  is `T1/tasks.md:23`: "- [ ] Phase 8d: entity graph (corresponds_to edges between Perf Lab and Kiln kernels)".

### Q6. Kiln's lab server (`SRV/lab/`)

**Routes** (`SRV/lab/routes.ts`):

| Area        | Endpoints                                                                                                                       | Notes                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Hosts       | `GET /hosts`; `GET /hosts/:host/capabilities`                                                                                   | `local` plus synthetic `playback@dgx` and `playback@rtx-dev`; capabilities exist for `local` only |
| Programs    | `GET/PUT/DELETE /programs/:labId`                                                                                               |                                                                                           |
| Catalog     | `GET /catalog`; `POST /labs/:labId/seed`; `GET /bundles?hashes=`                                                                | Seeding runs `validateCaptures` then `seedSynthetic`                                      |
| Jobs        | `GET /jobs`; `GET /jobs/:id`; `POST /jobs` with approve and cancel                                                              | POST, approve and cancel answer **501**                                                   |
| Annotations | `GET/POST /annotations`                                                                                                         |                                                                                           |
| Evidence    | `GET /evidence`; `GET /evidence/:sha`; `POST /evidence`                                                                         | POST takes base64 data or a local path                                                    |
| Datasets    | `GET /datasets`; `GET /datasets/:id`; `POST /datasets/:id/materialize`                                                          | Materialize answers **501**                                                               |
| Media       | `GET /media/:sha`                                                                                                               | Immutable cache                                                                           |

**Importer** (`SRV/lab/importer.ts`).
- `importPerfLab` copies `perf-lab.sqlite` (and `-wal`) into a `mkdtemp` directory and opens the copy with
  `DatabaseSync({readOnly})` (lines 70-82).
- It expects Perf Lab schema 5.
- It verifies every hash and is idempotent.
- It skips assistant transcripts.

**Import CLI.** `SRV/lab/import.ts` is run as `pnpm --filter @kiln/server lab:import [dir]`. Exit codes: 0 imported,
1 refused, 2 unreadable.

**Probe** (`SRV/lab/probe.ts`):

```ts
// SRV/lab/probe.ts:25-34
/** sha256 over each `*.py` file's name then bytes, in name order, first 12 hex digits (probe.py `workloads_revision`). */
export function workloadsRevision(dir: string): string {
  const h = createHash('sha256');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.py')).sort()) {
    h.update(name);
    h.update(readFileSync(join(dir, name)));
  }
  return h.digest('hex').slice(0, 12);
}
```

- The `LocalReport` shape (`probe.ts:12-23`) carries `gpu: {name, count, precisions}`, and for local it reports none.
- The header comment (`probe.ts:1-6`) says this hash is the one field a local capture's identity depends on.

**Captures.**
- `captureHash = cyrb53(stableStringify(spec))` (`SRV/lab/captures.ts`).
- `validateCaptures` enforces `reps` between 1 and 64 and answers `409 spec_hash_mismatch` on a mismatch.

### Q7. Perf Lab's local workload

**Layout and provenance.**
- Files: `LAB/workloads/perf_lab_local/{__init__.py, probe.py (76 lines), run.py (219), sampler.py (120)}`.
- Sibling package: `LAB/workloads/perf_lab_dino/run.py` (261).
- `LAB/workloads/pyproject.toml` pins `torch==2.14.1`, `numpy==2.5.4`, and others.
- `KILN/lab-workbench` is byte-identical to playback's `ttmp/.../ML-PERF-001.../experiments/lab-workbench` (Diary step
  11).

**Invocation.** One fresh process per repetition:

```ts
// LAB/server/runner.ts:57-61 (inside processExecutor, 45-89)
const child = spawn(config.uv, ['run', '--project', config.workloadsDir, 'python', '-m', 'perf_lab_local.run',
  '--spec', specFile, '--rep', String(rep), '--out', dir], {
  cwd: config.workloadsDir,
  env: { ...process.env, PYTHONUNBUFFERED: '1', PERF_LAB_INDUCTOR_CACHE: join(config.dataDir, 'inductor-cache') },
```

- Stdout lines starting with `{` are progress events (`runner.ts:67-76`).
- The stderr tail is saved to `rep-N/stderr.log`.

**`run.py`** (`LAB/workloads/perf_lab_local/run.py:56-215`):
- **Inputs it reads.** `spec.workload`, `comparison.switches.impl`, `collection.mode` and `state.compilerCache`.
- **Warmup.** `warmup.requests` (default 4), plus up to 16 more until the expected activation holds.
- **Request count by mode.** timing/cpu 32, trace 6, memory 3.
- **Fixture seed.** `wl.seed` defaults to 20261012 (`run.py:85`).
- **Synchronization.** `sync` is `torch.mps.synchronize` or a no-op. **There is no CUDA synchronize.**
- **Outputs.**
  - `manifest.json`: `spec_sha256`, versions, `git_revision`, `workload_sha256`, boundary, and more.
  - `activation.json`.
  - `quality.json`: compared against eager `unfused`, with tolerance 1e-5 for fp32 and 1e-2 for half.
  - `timing.json`: `perf_counter_ns` and `thread_time_ns` per request.
  - `cpu.json`: `getrusage` deltas.
  - `trace.json`: the `torch.profiler` CPU trace.
  - `memory.json`: the allocation ledger.

**`sampler.py`.**
- Shape defaults are heads 8, channels 32, queries 2048, points 16, spatial 64 (`sampler.py:39-46`).
- Implementations: `unfused` (`grid_sample` plus a weighted sum), `gather`, and `compiled` (`torch.compile` of `plain`).
- This is a **gather** workload, which Kiln cannot express (Q1).

**The lab program** (`LAB/src/presets/programs/local-sampler.lab.js:7-29`):

```js
const L = lab('Local · deformable sampling, measured')
  .param('queries', select([1024, 2048, 4096, 12240]).label('Queries').default(2048));
return L
  .experiment('sampler-local', e => e
    .host('local')
    .workload(sampler({ queries: ctx => ctx.param('queries'), heads: 8, channels: 32, points: 16, spatial: 64, device: 'cpu', dtype: 'float32' }))
    .boundary('sampler_output')
    .baseline(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'unfused' }))
    .candidate(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'compiled' }))
    .state({ process: 'fresh', compilerCache: 'reused' })
    .warmup(w => w.requests(4))
    .expect(activation({ compile: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('workloads/perf_lab_local/sampler.py#unfused', { mode: 'exact' }))
    .repeat({ processes: 4, order: paired({ seed: 20261012 }) })
    .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
    .capture(capture.timing()).capture(capture.trace().requests(4).processes(1))
    .capture(capture.memory()).capture(capture.cpu()))
```

- Line 5 pins the source by a playback-repo path:
  `src('HEAD:ttmp/2026/10/12/ML-PERF-001--.../experiments/lab-workbench/workloads/perf_lab_local/sampler.py#unfused')`.
- The capture builders are `capture.timing/trace/memory/cpu()` (`LAB/src/lang/library.ts:19-24`). Each is a `CaptureB`
  (`LAB/src/lang/builders.ts:173-191`) whose `.sections()` is additive with a `+` prefix.

**Probe.** `workloads_revision` (`LAB/workloads/perf_lab_local/probe.py:23-29`) globs only
`Path(__file__).parent/*.py`, which is `perf_lab_local/` alone. It matches Kiln's `workloadsRevision`.

**Importer.** `importRepetition` (`LAB/server/importer.ts:63-275`):
- **Validity.** A run is invalid on a nonzero exit or an activation mismatch.
- **Entities.** It emits request entities, a rusage instant, and trace ops and allocations.
- **Quality status.** It is `qualified` only when a gate is declared and `quality.pass && valid` (lines 243-275).

### Q8. Lab programs and statistics

**Preset programs.** `LAB/src/presets/programs/*.lab.js` holds `compare`, `dino-pr1005`, `hello`, `learn`,
`local-sampler`, `matrices`, `parameters`, `request-to-kernel` and `scenario-a/b/c`, plus `scenario-a/c.replies.txt`.
Copies live in `KILN/packages/lab/presets/`.

**Spec lowering.** `makeInstance` is at `LAB/src/lang/build.ts:517-590`. The spec it builds:

```text
{ schema_version: 1, experiment_id, arm, host,
  workload: lowerWorkload(...) = {adapter, boundary, fixture_manifest_sha256, ...opts},
  comparison: {baseline_revision, candidate_revision, arm_revision, switches, corunner, paired_order_seed},
  state, warmup, expect, phases, offer, admission, deadline,
  repeat: {processes}, collection: {mode, ...opts}, quality_gate_sha256, evidence? }
```

- `hash = cyrb53(stableStringify(spec))` (`build.ts:558`).
- Capture status is one of `cached / execute / import / blocked`.
- The host report enters a spec only through `rev(capabilities.tools.workloads)`, which becomes `arm_revision`.

**Adapters** (`LAB/src/data/capabilities.ts:90-121`):
- `dino`, `embedding`, `sampler` and `unknown`.
- `sampler` supports `unfused/gather/compiled`, maps switches through `switchesFor` to `{impl}`, and assumes
  `perRequestMs` 400.
- The library builder is `sampler(opts)`, which returns a workload tagged with adapter `'sampler'`
  (`LAB/src/lang/library.ts:97-100`).

**Statistics.**
- **Perf Lab `pairedRatio`** (`LAB/src/lang/stats.ts:23-80`):
  - takes the median per process per arm;
  - computes the ratio candidate/baseline;
  - draws a 2000-sample bootstrap, seeded from the ratios themselves, so the declared seed is ignored (P-9);
  - excludes invalid runs.
- **Evidence `pairedRatio`/`summarize`** (`KILN/packages/evidence/src/stats.ts:77-136`) honours the seed and adds notes
  when n < 6. `separated` is at lines 139-142.

**Verdicts.**
- **Evidence verdict** (`KILN/packages/evidence/src/verdict.ts:49-91`):
  - invalid support gives `unqualified`;
  - no rows gives `open`;
  - any clean false gives `refuted`;
  - a throw or missing value gives `open`;
  - otherwise `supported`.
  - `below`/`above` are three-valued (lines 150-151).
- **Perf Lab's old verdict.** `HypothesisView.tsx:19-48` treats a throw as false, so it yields `refuted` (P-8).

**`check:pl`.** `KILN/packages/lab/scripts/check-pl.ts` builds `local-sampler` and `dino-pr1005` against a temp
read-only copy of the Perf Lab store. `perf-lab.ts` reconstructs `tools.workloads` from `arm_revision`. It prints plan,
lints, derives and verdicts, and compares nothing.

### Q9. Remote captures today

**Perf Lab.**
- **Executors.** Only `local` gets a real executor (`processExecutor`). Every other host gets `syntheticExecutor`,
  which sleeps 150 ms and returns exit 0 with no directory (`LAB/server/runner.ts:91-98`; wiring in
  `LAB/server/index.ts:16`; `G1:1008-1010`).
- **Executability.** `canExecute(host)` is true only for a `process` executor (`runner.ts:122-124`).
- **Dispatch order** (`runner.ts:284-292`):
  1. a spec with `evidence` → `importEvidence`;
  2. `adapter === 'dino'` on an executable host → `runDino`;
  3. otherwise → `executorFor(host)`.
- **DGX numbers.** They come from a hand-made evidence archive imported by `importEvidence`
  (`runner.ts:165-211`, format `detection-qualification/v1`). Local dino runs emit the same schema, so one importer
  (`importQualification`, `LAB/server/qualification.ts`) handles both (`LAB/workloads/perf_lab_dino/run.py:1-12`).

**Kiln.** The SSH CUDA executor exists (Q4) but has never been pointed at a host.

**ML-PERF-003: design only.**
- `MP3/tasks.md` has all six tasks unchecked, and `MP3/reference/01-implementation-diary.md` has only Step 1.
- Option B, an SSH container executor run from the Mac, was chosen over hosting the lab on the DGX (A) or an agent
  service (C).

The design (`MP3/design/01-...md` §0, §5, §6.1-6.4, §6.8, §6.13, §8):
- **Host profiles** live in `.data/hosts.json`.
- **Remote probe.** `driver.py probe` reports the image ID, `nvidia-smi`, package versions and co-tenancy.
- **`spec.environment`** is `{executor, image ID, driver, limits, threads}`. It is added only for executed captures
  on profiled hosts, and a capture is blocked if its host is unreachable.
- **Staged bundle.** It contains `git archive` trees, specs, media, and a `plan.json` of `docker run` steps.
- **DGX side.** A stdlib-only `driver.py` takes a `flock` GPU lock and records co-tenancy. It runs `--network none`
  containers of the detection image (`sha256:d06d49c0…`) and packs `result.tar.gz`.
- **Mac side.** The server fetches, registers and imports the result with the same qualification importer.
- **Interface.** A `StepHost` interface (probe/run/cancel/reconcile) in `LAB/server/remote/host.ts`, with a
  `LocalShellHost` for tests.
- **`run.py` changes.** `--trees`, CUDA sync, a full header, and the host name.
- **Plan.** Phases 0–5. Experiments: 7.1 (16 stratified images vs the archive), 7.2 (memory), 7.3 (prompt
  sequences).

### Q10. What a new Perf Lab workload needs

**Route (a): a new implementation inside `perf_lab_local`.**
- Add a function to the eager-implementation table in `sampler.py` (or a new module beside it).
- Add its name to the adapter's `supports` list (`LAB/src/data/capabilities.ts:90-121`).
- **Side effect: every local arm's identity changes.** Any edit to a `perf_lab_local/*.py` file changes
  `workloads_revision` (`probe.py:23-29`; `SRV/lab/probe.ts:25-34`). That changes every local arm's `arm_revision`
  and therefore every local capture hash (`build.ts:558`).
  - Existing local captures flip from `cached` to `execute`.
  - The local runs imported into Kiln stop matching (`G1` §33.1; `SRV/lab/probe.ts:1-6`).

**Route (b): a new workload package.** This follows the `perf_lab_dino` precedent:
1. **Package.** `LAB/workloads/<pkg>/run.py` with its own CLI; dino's is
   `--specs baseline.json candidate.json --mode --rep --images --repo --out` (`perf_lab_dino/run.py:3-4`). A
   separate directory leaves `perf_lab_local`'s revision unchanged, since the glob is per-directory.
2. **Dispatch.** Add a hard-coded branch in `LAB/server/runner.ts:284-292`. There is no workload registry, and dino is
   keyed on `spec.workload.adapter === 'dino'` (line 288). Add a spawner like `LAB/server/dino.ts:79-84`
   (`uv run --project <workloadsDir> python -m <pkg>.run ...`).
3. **Library builder.** Add one in `LAB/src/lang/library.ts`, as `sampler` does at lines 97-100.
4. **Adapter contract.** Add one in `LAB/src/data/capabilities.ts:90-121`: supports, `switchesFor`, cost.
5. **Importer.** Extend `importRepetition` (`LAB/server/importer.ts:63-275`), or emit an existing schema such as
   `detection-qualification/v1` and reuse `importQualification`.
6. **Identity.** Add a revision source to the probe for the new package. Today only `perf_lab_local` is hashed into
   `tools.workloads`, so a new package's code would not enter its arms' identity.
7. **Preset.** Add a `.lab.js` preset program in `LAB/src/presets/programs/`, mirrored into
   `KILN/packages/lab/presets/` with a `LAB_META` entry in `WB/build.mjs`.
8. **GPU work.** Add a CUDA `synchronize` in place of the current MPS-or-no-op `sync` (`run.py`), as the ML-PERF-003
   design already plans (Q9).

### Gaps that bear directly on KILN-002

1. **The Kiln → GPU path is unproven.** No kernel has ever been timed on NVIDIA hardware (Q4). The runner has no L2
   flush or clock lock, and there is no target spec for GB10 or the RTX PRO 6000 (Q3).
2. **Exported kernels cannot be called from Python.** They are raw `extern "C"` fp32 kernels with baked shapes and no
   host wrapper (Q3). A Perf Lab workload that wants to time a Kiln kernel needs a launcher, for example
   `cupy.RawKernel` or `torch.utils.cpp_extension.load_inline`. Nothing in either repo provides one.
3. **Kiln cannot express several real workloads.** Gathers, bilinear sampling, integer and fp16 tensors, multi-output
   kernels and pair reducers are all out (Q1). Factory-video pipeline stages such as resize/letterbox (coordinate-only
   affine maps without interpolation), box blur and Sobel-style stencils, frame differencing, per-channel normalisation
   and matmul-like projections fit. Bilinear resize, `grid_sample`, NMS and top-k do not.
4. **Kiln and Perf Lab kernels cannot be joined yet.** The entity graph that would join Perf Lab's observed kernels to
   Kiln's generated ones (`corresponds_to`) is unbuilt (Phase 8d, `T1/tasks.md:23`). Lab job execution in the Kiln
   server answers 501 (Q6).
