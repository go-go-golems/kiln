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
