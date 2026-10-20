# kiln

Working repository for unifying two browser GPU-performance workbenches:

- **Kiln Workbench** (`imports/kiln-workbench-src/kiln-workbench/`) — a kernel *compiler* workbench: PyTorch-style
  programs lowered through six IRs (torch → tensor → loop → tile → kernel → gpu) to CUDA and WGSL, a SIMT simulator,
  an analytic cost model, tuning, 25 tutorial presets and a coding agent. Imported from `kiln-workbench-src.zip`.
- **Perf Lab** (`lab-workbench/`) — an *experiment* workbench from Playback ticket ML-PERF-001: a lab language
  that compiles experiments (arms, captures, gates, estimators, hypotheses, boards) and a Hono + SQLite server that
  runs Python workloads in paired, interleaved processes and qualifies the evidence. Copied verbatim from
  `playback/ttmp/2026/10/12/ML-PERF-001--…/experiments/lab-workbench` at playback commit `cdb84891c`.
- `imports/Untitled.md` — the 2026-10-19 comparison memo "Kiln Workbench × Perf Lab (ML-PERF-001)".

Design and analysis live in docmgr tickets under `ttmp/` (start with `KILN-001`).

## Layout

```text
packages/kiln/           @kiln/kiln: the compiler framework (src/core) and the standard ML stack (src/std)
apps/workbench/          @kiln/workbench: the page (UI, agent, presets, docs); build.mjs → dist/kiln-workbench.html
runner/kiln_runner.py    the CUDA runner (local or remote CUDA box)
runner/docker/           kiln-perf: the runner, launcher, a device probe and fixtures in a CUDA image
scripts/                 run-node-tests.mjs (Kiln's script-style tests), shoot.mjs (headless Chrome over CDP)
imports/                 imported sources, kept as received (zip kept for provenance)
lab-workbench/           Perf Lab, verbatim copy (node_modules, workloads/.venv, .data and dist are present
                         on disk but gitignored by lab-workbench/.gitignore); its own pnpm root
ttmp/                    docmgr root (tickets, vocabulary, templates)
```

## Running

Node 26 and pnpm 12.

```bash
pnpm install
pnpm build                 # apps/workbench/dist/kiln-workbench.html — one offline file (React, KaTeX bundled)
pnpm test                  # compiler tests, then the workbench's presets and notes tests
pnpm --filter @kiln/workbench test:sweep   # every preset × parameter grid point (about a minute)
node scripts/shoot.mjs apps/workbench/dist/kiln-workbench.html out.png --size 1600x1000
python3 runner/kiln_runner.py serve apps/workbench/dist/kiln-workbench.html   # on a CUDA box
```

This repository lives on `/Volumes/SSD/code/kiln`; `~/code/tulip/experiments/kiln` is a symlink to it.
