# Kiln Workbench

A browser workbench for building compilers and the programs they compile, on the kiln API, with
Octavo Lab's tiled IDE, Swiss look, and coding agent.

What you can do with it:

- **Write programs** in PyTorch-style JavaScript. They are compiled through six IRs into CUDA and WGSL kernels:
  torch → tensor → loop → tile → kernel → gpu, after the CloudRift "GPU compiler from scratch" series.
- **Write compilers.** Define dialects, rewrite rules, whole-graph passes and pipelines in the same script, then see the result:
  - every IR level as text or as a graph;
  - every rewrite with its diff;
  - every rule that declined, and why;
  - every fork and the policy that decided it.
- **Measure kernels** on three kinds of device:
  - **Simulated GPUs** (RTX 5090/4090, H100, A100, Orin). A lockstep SIMT simulator gives Nsight-style metrics and checks correctness.
  - **WebGPU** on your own GPU, with real timings and checked outputs.
  - **A real CUDA box** through `runner/kiln_runner.py`, using nvcc, CUDA events and optional Nsight Compute.
- **Tune** with SP-MCTS over the program's whole fork tree, or with a sweep. Every measurement becomes evidence that the next compile decides by.
- **Learn.** 25 preset projects, each with a tutorial in the Notes view: the idea, the maths (KaTeX), what to try as
  clickable `lab:` links that set sliders, pin schedules, measure and switch GPUs, the numbers you should see, and
  exercises. The "GPU optimization" group (W-18 to W-25) covers the roofline, fusion, batch size and arithmetic
  intensity, the matmul optimization ladder, numerics of variance, occupancy and latency hiding, one program on five
  GPUs, and scoring the cost model against measurements.
- **Ask the agent.** It works through one `eval` tool against the whole workbench: editor, IRs, trace, forks, kernels, devices, measure, tune and evidence. Every step can be reverted.

## Layout

```
reference.txt          the API reference (Reference view; also the agent's prompt)
agent-guidelines.txt   how the agent works
presets/W-NN-*.js      25 projects: Basics, GPU optimization, ML compiler, Write programs, Extend the compiler, Other compilers
presets/W-NN-*.md      their notes (tutorials), shown in the Notes view
runner/kiln_runner.py  the CUDA side: run | serve | device
app/
  build.mjs            → dist/index.html (artifact page) and dist/kiln-workbench.html (standalone)
  src/core/            kiln: dialects, graphs, patterns, rules, passes, pipelines, params, forks, decide, runs; ix (index algebra)
  src/std/             the ML stack: tensor (nn/tensor dialects, decomposition), loop (fusion, LICM scheduling),
                       tile (schedules, cost model), kernel (materialization), emit (CUDA, WGSL, simulator),
                       program (simulation, checks), devices, store (evidence), tune (SP-MCTS, sweep)
  src/ui/              the workbench: wb.js (state), dock, views (Notes, Code, Agent, Reference, IR, Graph, Trace,
                       Kernels, Perf, Knobs, Tune, Devices, Events); doc.js (Markdown + KaTeX), links.js (lab: links)
  src/agent/agent.js   the agent: eval tool, scope, snapshots and revert, conversations
  test/                unit tests, presets.mjs (every preset headless), notes.mjs (every note's lab: links),
                       param-sweep.mjs (every preset at its parameter extremes and on every GPU), ui.mjs
                       (Playwright), CUDA checks
```

## Build and test

```
cd app && npm install
node build.mjs                      # dist/index.html, dist/kiln-workbench.html
node test/core.mjs && node test/stack1.mjs && node test/stack2.mjs && node test/stack3.mjs && node test/progs.mjs && node test/tune.mjs
node build.mjs --gen-only && node test/presets.mjs     # every preset: compile, end-to-end check, measure
node test/notes.mjs                 # every note renders; every lab: link names a real param, knob, IR, kernel, view
node test/param-sweep.mjs           # every preset at the min and max of each parameter, and on every simulated GPU
node test/ui.mjs all                # browser: views, presets, agent (fake sample), notes (KaTeX, lab: links), phone, dark
node test/ui.mjs webgpu-all         # every preset's kernels through WGSL on the WebGPU adapter
node test/export-cuda.mjs k.json && python3 test/cuda_check.py k.json --nvrtc libnvrtc.so.12 --ptxas ptxas
```

### What was verified, and how

- **Every note** renders, and its 169 `lab:` links all name a parameter (with a legal value), knob, IR level, kernel, view, device or preset that exists in that project.
- **Every preset compiles at the extremes of each of its parameters and on every simulated GPU** (227 compiles).
- **Every preset** compiles, passes its end-to-end check (frontend graph vs. last evaluable IR), and passes the sampled kernel checks on the simulator.
- **The WGSL of every preset's kernels** ran on a real WebGPU implementation (Chromium with SwiftShader). Outputs matched the reference.
- **The CUDA compiles.** 79 distinct kernels, covering every preset plus the cost model's alternative schedules, went through NVRTC and ptxas for sm_89. All compile, with no register spills.
- **The runner generates the same inputs as the workbench.** Its host-side input generator was compiled with g++ and matches the workbench's mulberry32 inputs bit for bit.
- **The runner's control flow** was exercised with a stand-in nvcc.
- **Not tested: timings from a physical NVIDIA GPU.** None was available. The numbers in the notes come from the
  simulator's model (stated in each note); the W-25 tutorial is about exactly where such a model can be wrong.

## The CUDA runner

On a machine with an NVIDIA GPU and the CUDA toolkit (no Python packages needed):

```
python kiln_runner.py device                        # what GPU this is
python kiln_runner.py run bundle.json -o out.json   # Devices → export a bundle; import out.json back
python kiln_runner.py serve kiln-workbench.html     # open http://127.0.0.1:8765: the CUDA device is live
```

`serve` compiles and runs code it receives. It binds to 127.0.0.1 and refuses cross-origin requests.
