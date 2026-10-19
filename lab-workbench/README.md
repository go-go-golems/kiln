---
Title: Perf Lab Workbench Prototype
Ticket: ML-PERF-001
Status: active
Topics:
    - vision
    - backend
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/design/02-lab-language-specification.md
      Note: The language this prototype implements
    - Path: repo://ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/design/03-workbench-ui-design.md
      Note: The UI this prototype implements
ExternalSources: []
Summary: "How to run the lab.js workbench and its lab server, what each preset shows (including the measured local-sampler), keyboard and panes, math, the live assistant, the layout, and what is still synthetic."
LastUpdated: 2026-10-12T18:55:00-04:00
WhatFor: "Running and extending the prototype."
WhenToUse: "Before opening or changing experiments/lab-workbench."
---

# Perf Lab workbench (prototype)

A self-contained prototype of the ML-PERF-001 performance explorer: the `lab.js` language
([spec](../../design/02-lab-language-specification.md)) and the workbench UI
([design](../../design/03-workbench-ui-design.md)), running entirely on **synthetic data**. No collector,
importer, profiler or GPU is involved; every run is generated deterministically from its capture's content
hash and labelled synthetic.

## Run it

```bash
pnpm install                          # standalone pnpm root (own pnpm-workspace.yaml), pnpm 10.22
(cd workloads && uv sync)             # Python 3.12 + PyTorch 2.14.1 for the real workloads
pnpm lab-server                       # http://127.0.0.1:5198/api — SQLite, runner, importer, assistant
pnpm dev                              # http://127.0.0.1:5199 — the workbench; /api is proxied to the server
pnpm test                             # language, data, server and assistant tests (vitest)
pnpm build                            # tsc -b && vite build
```

Start at `/labs/hello`, then try the presets in order from the picker in the IDE. `/labs/local-sampler` runs real
work on this machine: open PLAN and run the missing captures (about 40 s). Without `pnpm lab-server` the workbench
stays on synthetic data and the live assistant is unavailable. (`pnpm server` is a pnpm built-in, hence `lab-server`.)

Server settings (environment): `PERF_LAB_DATA_DIR` (default `.data/`: `perf-lab.sqlite` and `artifacts/`),
`PERF_LAB_PORT` (5198), `PERF_LAB_MODEL` (`lunaroute/deepseek-4.1-flash:high`, resolved through the pi agent's
credentials in `~/.pi/agent`), `PERF_LAB_PI_EXTENSIONS` (extension files that register providers; default: the
installed `@lunaroute/pi-extension`), `PERF_LAB_UV` (`uv`).

## What to try

| Preset              | Shows                                                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hello`             | Program → IR; lints for the missing quality gate, activation rule and repetition policy                                                                              |
| `parameters`        | Every parameter kind; VIEW re-renders, DATA recomputes, PLAN becomes a pending plan you can run or revert                                                            |
| `request-to-kernel` | Run picker, linked table/timeline selection, a route with per-hop evidence, counters by structural match                                                             |
| `compare`           | Manifest diff, paired estimate over processes, a mirror of two traces on two clocks                                                                                  |
| `learn`             | Illustrative walkthroughs (bilinear, fused reduction, RMSNorm, tiling) driven by parameters                                                                          |
| `matrices`          | `matrix()`/`when()`/`skip()` ablation, an interference matrix and a custom collector; PLAN tab                                                                       |
| `scenario-a`        | DINO sampled intermediate: logical vs measured traffic vs retained allocation, hypothesis, assistant                                                                 |
| `scenario-b`        | Embedding layout churn under open-loop offer, request vs window throughput, peak graph-pool retention                                                                |
| `scenario-c`        | Lost trace interval; the assistant states what holds, forks a re-trace, a person approves the job                                                                    |
| `local-sampler`     | **Measured**: eager `grid_sample` vs TorchInductor on this machine; timing, trace, allocator, `getrusage`                                                            |
| `dino-pr1005`       | **Imported + measured**: PR 1005's DGX evidence, its acceptance rule as hypotheses, every recorded detection drawn on its image; a local CPU run of the real backend |

Keyboard: ⌘/Ctrl+Enter builds, `[` / `]` change board, Esc clears the selection, ⌘/Ctrl+/ focuses the assistant,
⌘/Ctrl+B collapses or shows the editor, ⌘/Ctrl+Alt+B the inspector.

## Panes, math, colour and the assistant

- **Panes.** Drag the splitters beside the editor and inspector (and above the console) to resize them, or focus one
  and use the arrow keys (Shift for bigger steps, Home/End for the limits, double-click to reset, Enter to collapse).
  A collapsed pane leaves a labelled rail; click it to reopen. The button at the right of the inspector's tab bar
  docks it at the bottom instead (its splitter then sets the height). Sizes and the dock persist in `localStorage`
  (`perf-lab:layout`).
- **Lab tab.** The inspector opens on `LAB`: the program's boards, each experiment's question, arms, captures with
  their plan status and resolved contract, and each hypothesis with its verdict, evidence, alternatives and scope.
- **Math.** `math(tex, { caption })` renders a display formula; `$…$` works inline in board titles, subtitles, notes,
  captions and stepper labels. MathJax 4 typesets TeX to SVG in the browser and is loaded on the first formula.
- **Colour.** Tokens in `src/styles/tokens.css`: an accent for stencil labels, numbering and stippling, and six muted
  data hues (`--d1 … --d6`) for series and kernel roles, each at least 3:1 on the sheet; legends name every hue.
- **Assistant.** The Agent tab is one built-in assistant scoped to the board in view; programs do not declare agents.
  Its policy is fixed in `src/features/agent/builtins.ts`. `LIVE` asks the model through the lab server; its code
  runs in the browser and the result goes back to the model (at most four executions). Transcripts and token usage
  are stored in SQLite and reload with the page. In `LIVE` mode the model and thinking menus list every model the pi
  agent holds credentials for. Clear (archive icon) moves the transcript to the library (book icon), where
  transcripts can be searched, read, continued, copied as JSON or deleted.
- **Code and data.** Assistant code is highlighted; results, lowered specifications, IR nodes and contracts show as
  YAML with a `YAML | JSON` toggle and a copy button.

## Layout

```text
server/       lab server: db (migrations), store, runner, importer, app (HTTP + SSE), assistant/ (pi model, prompt, service)
workloads/    uv project: perf_lab_local (probe, sampler, run)
src/
  lang/        the lab.js runtime: builders, params, queries, values, passes (build.ts), runtime, algo, stats
  data/        synthetic capability reports, adapter contracts, run generator, DataSource
  presets/     the nine programs (*.lab.js, loaded raw) and scripted assistant replies
  features/    Redux Toolkit slices and thunks (program, build, params, signals, selection,
               catalog, jobs, agent (built-in assistant + eval runtime), annotations, ui)
  services/    labApi — RTK Query; the seam where the real backend replaces the synthetic data
  app/         store, router shell, URL sync, board context, build registry
  components/  atoms/ molecules/ organisms/ (incl. organisms/views/) templates/ pages/ — one folder per widget
```

Functions never enter Redux: a build stores its serializable IR in the store and keeps builders, lambdas
and the data source in `app/registry.ts`, keyed by build id.

## Studying PR 1005 (ML-PERF-002)

The `dino-pr1005` preset reads evidence produced on the DGX, which the lab imports from a content-addressed archive
instead of executing:

```bash
pnpm lab evidence add ~/code/tulip/playback-vault/Projects/2026/10/12/_assets/pr1005-dgx-20261012/evidence-final.tar.gz
pnpm lab datasets materialize c435d426e9d2   # the 128 COCO images, fetched from their public source, SHA-256 verified
pnpm lab models fetch                         # the pinned Grounding DINO snapshot, only for the local CPU run
```

Then open the preset's PLAN and import. Images are served only from the media store (`.data/media`, git-ignored)
and only if public; each view shows the image's licence and source. The design, API and results are in the
[ML-PERF-002 intern guide](../../../ML-PERF-002--studying-grounding-dino-pr-1005-in-the-perf-lab-evidence-import-images-detections-and-datasets/design/01-intern-guide-studying-grounding-dino-acceleration-in-the-perf-lab.md).

## What is real and what is synthetic

- **Measured:** every run of an experiment on host `local` — produced by `workloads/perf_lab_local` in a fresh
  Python process per repetition, imported by `server/importer.ts`, stored in SQLite, labelled `measured`.
- **Synthetic:** runs on `playback@dgx` and `playback@rtx-dev`. The server has no executor for them; their jobs
  complete as synthetic artifacts and their runs are generated from the capture hash, labelled `synthetic`.
- **Imported:** captures declared with `.evidence(archive(…))` are read from a registered archive; they are labelled
  measured (on their host) with the archive as their source, and are never synthesized.
- **Capability reports:** `local` comes from a read-only probe of this machine; the remote hosts' reports are synthetic.
- **Assistant:** scripted replies, or a live model through the pi agent's credentials.
