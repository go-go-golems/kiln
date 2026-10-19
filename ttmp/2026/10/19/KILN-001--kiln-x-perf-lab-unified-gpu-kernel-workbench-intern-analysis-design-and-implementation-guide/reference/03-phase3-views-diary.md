---
Title: Phase 3 diary — the views (Perf, Knobs, Kernels, Devices, Evidence)
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - evidence
    - workbench-ui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/workbench/src/ui/Evidence.jsx
      Note: The new Evidence view (guide §32.6) — records grouped by kernel × row × device, detail panel, import/export/forget
    - Path: repo://apps/workbench/src/ui/marks.jsx
      Note: Shared value cells, provenance marks, status stamps and the §24 method strings
    - Path: repo://apps/workbench/src/ui/Perf.jsx
      Note: Perf with model/simulated/measured columns, validity stamps, three-mark roofline, title block; Tune without the evidence table; Devices with fingerprint and protocol
    - Path: repo://apps/workbench/src/ui/Knobs.jsx
      Note: Fork options with measured median, CI and n from EvidenceStore.statsFor; by tag plus note
    - Path: repo://apps/workbench/src/ui/Kernels.jsx
      Note: Content id per language and the activation row
ExternalSources: []
Summary: 'Chronological diary of the Phase 3 views work (guide §32.6): the views that show kiln-measure/1 records with provenance marks, and the new Evidence view.'
LastUpdated: 2026-10-19T16:00:00-04:00
WhatFor: "Reviewing how the Phase 3 views were built on the EvidenceStore API and where they deviate from the guide"
WhenToUse: "Before changing how the workbench shows a measured number, or adding a view that reads evidence records"
---

# Phase 3 diary — the views

Written by the Phase 3 views worker, running beside a second worker that owns the WebGPU protocol
(`packages/kiln/src/std/devices.js`, `std/tune.js`, `apps/workbench/test/webgpu.mjs`) in the same working tree. The
main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim requests. Paths: `T/` is this
ticket, `UI/` is `apps/workbench/src/ui/`, `S/` is `packages/kiln/src/std/`.

## Step 1: Read the core API and the views it breaks

The coordinator committed the core of Phase 3 in `a62ae31`: `S/records.js` (one place that builds a
kiln-measure/1 record), `S/store.js` (the `EvidenceStore`) and `decide.evidence` v2, with `wb` already writing
records. The views were not touched, so three of them still read the old kiln-evidence/1 row shape (`r.us`,
`r.knobs`, `r.name`, `r.ok`) and would throw or print nothing.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` (the "Once upload, then implement it…"
request: implement the guide, commit at intervals, keep detailed diaries, take screenshots).

**Assistant interpretation:** The coordinator split Phase 3 in two and gave this worker the views: Perf, Knobs,
Kernels and Devices changed as §32.6 says, a new Evidence view, screenshots in light, dark and phone widths, and no
commits (the coordinator reviews and commits).

**Inferred user intent:** Every number a person reads in the workbench says where it came from, and the evidence
the compiler decides with can be inspected, imported, exported and forgotten in one place.

**Commit (code):** none (the coordinator commits).

### What I did

- Read `S/records.js`, `S/store.js`, `packages/kiln/test/evidence.mjs`, `scripts/specimen.mjs`, `UI/evidence.css`,
  `UI/tokens.css`, and the views: `UI/views.jsx`, `UI/dock.js`, `UI/wb.js`, `UI/Perf.jsx`, `UI/Knobs.jsx`,
  `UI/Kernels.jsx`, `UI/common.jsx`, and `scripts/shoot-views.mjs`.
- Read guide §24 (the method strings) and §32 (tokens, marks, stamps, title block, charts, the per-view table).

### Why

The store's API is the contract: the views must not reach into `records` maps or re-derive staleness. Every
question a view asks — is this record decisive, what is its status, what are an option's statistics — has one
answer in `EvidenceStore`.

### What worked

- `wb.measures[deviceId].kernels[i].record` is the id of the record measure just wrote, so a view can go from a
  measured row to its record with `wb.store.records.get(id)`.
- Simulator records carry `counts.sampledBlocks` and `counts.blocks`, which is exactly what the §24 method strings
  need ("timeModel over counts from N sampled blocks", "scaled ×S to the grid").
- `estimate()` in `S/tile.js` returns the model's flop and DRAM counts along with its time, so the roofline can
  place the model's mark from the model's own counts.

### What didn't work

- Nothing ran yet. Found by reading: `UI/Knobs.jsx:72` builds `measuredFor` from `r.knobs`, which records no longer
  have (`r.kernel.knobs`), so `KN.canonical(undefined)` is called for every record. `UI/Perf.jsx:206` compares
  `store.best(...) === r`, but `best` now returns a statistics object, never a record, and `store.import` now
  returns `{ added, skipped, errors }`, so the Tune view's toast would print `Imported [object Object] evidence rows`.

### What I learned

- `EvidenceStore.statsFor` only pools *decisive* records. A wall-clock WebGPU record (partial) or a stale one never
  reaches it, so a view that shows only `statsFor` would hide the fact that a measurement exists. The cells need a
  second path: the newest record of the option, shown with its status (struck through when stale, an `invalid`
  word when invalid).
- `decision.score` is the evidence median when `by === "evidence"`, so it cannot be the "model" column. The model
  number has to come from `estimate()` (the Knobs view already caches it per loop node).

### What was tricky

- Which simulator and which hardware device a column refers to when the selected device is the other kind. A sim
  record and a WebGPU record of the same kernel live under different device ids; the view has to pick one of each.

### What warrants a second pair of eyes

- Nothing yet.

### What should be done in the future

- Nothing yet.

### Code review instructions

- Nothing to review in this step.

### Technical details

- Record → measure row: `wb.measures[wb.deviceId].kernels[i].record` (an id) → `wb.store.records.get(id)`.
- `store.status(r)` is `invalid` | `stale` | `partial` | `fresh`, in that precedence.

## Step 2: One module for marks, and the Evidence view

Every view that shows a kernel time needs the same four things: the cost model's estimate, the statistics of an
option on a device, the status of a record, and a value cell that draws all of it with a mark, a word and a title.
Writing them once in `UI/marks.jsx` kept Perf, Knobs, Kernels and Evidence in the same words; the Evidence view
(`UI/Evidence.jsx`) is then mostly layout.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** The coordinator's directive item 5 (a new Evidence view, registered with the views,
in the default layouts and the view picker) and item 6 (every mark paired with a word and a §24 method title).

**Inferred user intent:** One place to see, import, export and forget what the compiler decides with.

**Commit (code):** none (the coordinator commits).

### What I did

- `UI/marks.jsx` (new): `METHOD` (the §24 method strings), `modelOf`/`modelUs` (the cost-model cache moved out of
  Knobs, so Perf, Kernels and the roofline share it), `decisionOf`, `optionEvidence` (pooled decisive statistics,
  else the option's newest record and its status), `simRef`/`hwRef` (which simulator and which real device a column
  reads), `evidenceVal`/`modelVal`/`recordVal`/`missingVal` (value descriptors), `<Val>`, `<StatusStamp>`,
  `statusWhy`, `methodOf`, `<Row>` (a schedule row with `<wbr>` after each comma) and `<SvgDefs>` (the one
  `url(#half)` pattern, rendered once by `App.jsx`).
- `UI/Evidence.jsx` (new): toolbar with two filters (this program, this device), Import…, Export, Forget this
  device, Forget all (a second click confirms; the arm expires after 4 s); a table with one `tbody` per
  kernel × row × device group whose head row shows the pooled decisive statistic (what `decide.evidence` reads) and
  an "in use" tag, and one row per record (time, by, timing kind × launches, its own median and n, its status); a
  title block; and a side panel for the selected record: status, a sample strip plot, validity reasons, activation,
  check, protocol, counts (with their provenance), manifest, ids and the fingerprint.
- Registered `evidence` in `UI/views.jsx` (with a badge counting invalid records on this device), in
  `UI/dock.js` `SYS_VIEWS` (which feeds the view picker and the phone tabs) and in the default, compiler and perf
  layouts. `UI/wb.js` moves Evidence beside Tune once in layouts saved before the view existed, behind an
  `evidenceView` localStorage flag so a user who closes it is not overruled on the next load.
- `wb.sel.record` selects a record; Perf's side panel has an "Open in Evidence" button that sets it.

### Why

- A value descriptor (`{ prov, text, ci, n, title, state }`) rather than a component per source keeps the decision
  "which mark, which word, which method" out of the JSX of four views.
- The group head shows `statsFor` (pooled, decisive only) and the rows show each record's own median: the head is
  what the compiler uses, the rows are what happened. A stale or partial record keeps its number but cannot move
  the head.

### What worked

- Import of a kiln-evidence/2 export, the same export again, a kiln-evidence/1 file with one good and one bad row,
  and a non-evidence JSON, driven through the real file input in headless Chrome:
  `Imported 1 record` / `Imported 0 records, 1 already stored` / `Imported 1 record, skipped 1` /
  `Could not import: not an evidence export: expected format kiln-evidence/2 or kiln-evidence/1` (red). The legacy
  row became `legacy:sim:rtx5090`, status `partial`.

### What didn't work

- The first build failed: `✘ [ERROR] The symbol "src" has already been declared` at `src/ui/Kernels.jsx:34:8` —
  I named the source word `src`, which the Kernels view already uses for the CUDA/WGSL text. Renamed to `word`.
- `EvidenceStore.import` does not count duplicates as skipped (`add` returns the stored record), so re-importing
  the same file reported `Imported 0 records` and nothing else. The toast now derives "N already stored" from the
  file's record count minus added minus skipped.

### What I learned

- A real WebGPU measurement in headless Chrome (`scripts/shoot.mjs --webgpu`) works on this Mac (Apple Metal-3,
  7 repetitions × 20 launches, gpu-timestamp), which gave the strip plot real data: five repetitions within
  185–192 µs and two at up to 573 µs. On a linear axis those two squeeze the other five into two pixels.

### What was tricky

- The strip plot's axis. I clip it at 8 median absolute deviations around the median and draw the repetitions
  beyond as an arrow at the edge with their count and value ("2 up to 573 µs"); the CI band is drawn only when it
  fits on the clipped axis, and the note under the plot says which case applies.
- Duplicate SVG ids: the roofline, the strip plot and any future chart all want `url(#half)`. One zero-sized SVG
  holds it (`.svgdefs`); a `display: none` SVG would stop the pattern painting in Chrome.

### What warrants a second pair of eyes

- `hwRef` picks the real device with the newest record of the program's kernels when the selected device is a
  simulator. With records from two GPUs, the "measured" column shows the newer one; its title names it.
- The Evidence view's filters default to this program and this device, so imported legacy records
  (`legacy:<old id>`) only appear with "This device" off. The empty state says so.

### What should be done in the future

- Forget by kernel or by group from the Evidence view (the store's `forget({ identity })` exists).
- The view keeps no sort or filter state across reloads.

### Code review instructions

- Start at `UI/marks.jsx` (`optionEvidence`, `evidenceVal`, `StatusStamp`), then `UI/Evidence.jsx`.
- Check: `node scripts/shoot-views.mjs apps/workbench/dist/kiln-workbench.html <dir> p3- --only evidence-light-1600,evidence-webgpu-light-1600`.

### Technical details

- Group key: `` `${r.kernel.identity}|${r.kernel.row}|${r.device.id}` ``; groups sort by kernel name, then the
  schedule in use first, then device name, then row.
- CI suffix: `±h` when the two sides differ by at most 25 %, else `+up/−down` (a single slow repetition moves only
  the upper bound; `±max` would claim a symmetric interval that is not there).

## Step 3: Perf, Knobs, Kernels, Devices and Tune

The four changed views now read records through `UI/marks.jsx`. The Tune view loses its evidence table to the
Evidence view and keeps a pointer to it.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** Directive items 1–4: Perf (big number with mark and source word, model / simulated /
measured columns, validity stamps, a three-mark roofline without label overlap, a title block; the Tune evidence
table removed), Knobs (median, CI, n with marks; `by` plus note; the W-21 cut-off), Kernels (content id per
language, activation), Devices (evidence id, fingerprint, protocol settings).

**Inferred user intent:** The gap between the model, the simulator and the hardware is visible wherever a kernel
time appears, and no number is shown without where it came from.

**Commit (code):** none (the coordinator commits).

### What I did

- **Perf** (`UI/Perf.jsx`): the big number carries `.prov` (heuristic for simulated, derived for measured, bad
  when a kernel failed) and a stamp (`simulated`, `measured on <device>`, or `model only` before any
  measurement, when the total is the sum of the model's estimates). The kernel table has `model`, `simulated` and
  `measured` value cells and a `validity` column (`✓ valid`, or a `stale` / `partial` stamp, or a red `invalid` /
  `error` stamp with the reasons in its title); the three least-used metric columns hide below 780 px of stage
  width and the table scrolls in its own box. Before a measurement the table shows the compiled kernels with
  their model numbers. The title block closes the scroll area: project, device, evidence id, data origin,
  `CODEGEN_VERSION`, records shown/stored, measured at.
- **Roofline**: up to three marks per kernel — the model (hollow) at its own flop/DRAM counts, the simulator (half
  filled) at its counts, the hardware median (filled, with the CI as a whisker) at the simulator's intensity (or
  the model's when nothing was simulated) — joined by a hairline. A key in the top-left names the series present.
  One label per kernel, placed greedily: right of the mark, then rows below and above, then the left side; a
  displaced label gets a leader. The selected kernel's label and top mark are red; its other marks keep their
  fill and get a red ring, so shape still tells the source apart.
- **Tune**: the Evidence block is gone; a Records block counts this device's records and opens the Evidence view.
- **Knobs** (`UI/Knobs.jsx`): fork table `by` shows the tag and `d.note` beneath it; model and measured are value
  cells; the fork detail header reads "picked by **evidence** (confirms the model)"; option rows show
  `optionEvidence` for this device with a validity stamp; sorting by measured uses the pooled median. The options
  table scrolls in its own box, the option text wraps after commas, and the meter column hides below 560 px.
- **Kernels** (`UI/Kernels.jsx`): model and simulated/measured value cells and a validity column; a line under the
  table with the selected kernel's content id for CUDA, WGSL and the simulator (12 hex characters, the full id and
  the source sha256 in the title) and its activation ("✓ as requested (decided by evidence)", or
  "requested X → materialised Y ✕" in red).
- **Devices**: an Identity block (evidence id, records on it, every fingerprint field) and, for a device with a
  `protocol`, four number inputs (repetitions, warm-up launches, timed launches, order seed) bound through
  `wb.setProtocol`, which also persists them per device kind (`protocol:webgpu`). The describe() row "protocol"
  is hidden when the inputs show the same thing.
- **Header pill** (`UI/App.jsx`) says "simulated" or "measured" by device kind instead of always "measured".
- `wb.importResults` keeps each kernel's record id on the measure row, as `wb.measure` does, so an imported CUDA
  run links to its records too.

### Why

- The W-21 cut-off was not a width bug in one column: every `td` in `.opts` was `white-space: nowrap`, the option
  text has no spaces, and the Knobs stage in the compiler layout is about 480 px. Break opportunities after commas,
  a scroll box and a container query fix the class rather than the one column.
- The roofline's overlapping labels came from fixed `x + 7` placement; kernels of one program often share an
  intensity.

### What worked

- Done-condition, read from the DOM after `wb.load("W-05")`, `setDevice("sim:rtx5090")`, `measure()`: Knobs `by`
  cell "evidence" + "confirms the model", fork detail "picked by evidence (confirms the model)"; Perf headers
  `kernel, model, simulated, measured, validity`, marks `prov heuristic | model: analytic estimate: roofline +
  occupancy + waves (tile.js)`, `prov heuristic | simulated on RTX 5090: timeModel over counts from 4 sampled
  blocks`, `prov unknown | no measurement on real hardware: pick WebGPU or CUDA in Devices and Measure`; Evidence
  lists `k_rms_norm_reduce MAP=row,TPB=1024,STAGE=all · RTX 5090 in use 24.3 µs 1 record`.
- WebGPU (headless, Apple Metal-3): Perf "◐ 186 µs +0.4/−0.1 n=7" in the measured column, the big number
  "measured on WebGPU apple metal-3", the roofline's filled mark with its whisker.

### What didn't work

- My first roofline coloured every mark of the selected kernel with `.on`, which fills it red: the hollow model
  mark and the filled hardware mark became identical red dots. Now only the top mark takes `.on`.

### What I learned

- On the shipped presets the model and the simulator often agree to the last digit (W-05 24.271 µs both; W-09
  32.243 and 44.423 µs both) even where their counts differ (W-09 DRAM 5.54 MB simulated vs 5.28 MB modelled):
  both run `timeModel`, and these kernels are bound by shared memory or by counts the two agree on. The roofline
  shows the difference (different intensity), the time columns do not.
- On WebGPU the program compiles to a different schedule (`STAGE=reused`) than on the RTX 5090 (`STAGE=all`), so
  the simulated column is "—" with "no simulation of this schedule on RTX 5090" — correct, and a reason to read
  the title.

### What was tricky

- `decision.score` is the evidence median when `by` is `evidence`, so it cannot feed the model column; the model
  number always comes from `estimate()`.

### What warrants a second pair of eyes

- The metric columns (bound, occupancy, GB/s, …) carry no marks; their headers name the source. Marking every
  cell would bury the three time columns.
- `simRef()` for a real device is the simulator measured last in this session, else the first simulated device.

### What should be done in the future

- Tune's search chart should draw intervals (§32.6); the history entries carry one total per program, not
  samples, so this needs `tune()` to return the records' statistics.
- The roofline's text scales down with the SVG on a phone (about 7 px at 390 px width).

### Code review instructions

- `UI/Perf.jsx`: `PerfView`, `BigNumber`, `Roofline`, `placeLabels`, `ProtocolBlock`.
- `UI/Knobs.jsx`: `KnobsView` table and `ForkDetail`; `UI/Kernels.jsx`: `KernelIds`.

### Technical details

- Stage container queries: `.perft .xtra` hidden ≤ 780 px, `.opts .mcol` ≤ 560 px, `.evt .by` ≤ 480 px.
- `placeLabels`: label width ≈ 5.6 px per character at 10 px Arial; tries dy ∈ {0, ±11, ±22, ±33, ±44} on the
  right, then on the left.

## Step 4: Wording, screenshots and verification

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` ("Take screenshots as you go for the diary and
for reports").

**Assistant interpretation:** Directive items 7 and 8: new scenes in `scripts/shoot-views.mjs`, light/dark/phone,
the useful ones copied to `T/various/screens/p3-*.png`; tests, build, contrast, dead selectors; and the wording in
the reference, presets and agent prompt that the views made false.

**Inferred user intent:** The work can be reviewed from pictures and numbers without re-running it.

**Commit (code):** none (the coordinator commits).

### What I did

- `scripts/shoot-views.mjs`: scenes `evidence-light-1600`, `evidence-dark-1600`, `knobs-measured-light-1600`,
  `evidence-phone-390` (W-05 measured on sim:rtx5090, then `tune({ strategy: "sweep", budget: 8 })`), and
  `perf-webgpu-light-1600`, `evidence-webgpu-light-1600`, `devices-webgpu-light-1600` (W-05 on the simulator,
  then on WebGPU; a shot can now set `webgpu: true`). Toasts are cleared before each shot.
- Wording: `reference.txt` §9 described evidence as "device, kernel identity, schedule row → µs" and "the next
  compile prefers the fastest measured row" — now the record and the separation rule, and the Evidence view.
  `presets/W-24-five-gpus.md` pointed at Tune for the evidence; it points at Evidence. The agent prompt's view
  list gains `notes` and `evidence`, and `chat.show` can select a `record`.
- `apps/workbench/test/notes.mjs` imports `ALL_VIEWS` from `dock.js` instead of a copied list (outside my file
  list; the W-24 link to `lab:view?name=evidence` would otherwise fail it).

### What worked

- `pnpm test`: evidence package 114 tests in 8 files; kiln 9 of 9 (`core`, `evidence`, `hypotheses`, `progs`,
  `protocol`, `stack1-3`, `tune`); another package 46 tests in 5 files (51 in 7 on the final run, with the parallel agents' new tests); workbench 2 of 2 (`notes.mjs`: 169 lab
  links, `presets.mjs`).
- `pnpm build`: `dist/index.html 1194 KB (bundle 1135 KB, 25 presets, 25 with notes)`.
- `node scripts/contrast.mjs`: all pairs pass (no token changed). css-usage: 4 dead selectors, all §32 classes no
  view uses yet (`.prov.illustrative`, `.stamp.solid`, `.stale-frame`, `.hatched`); the removed `.roof .rp*`
  rules are gone with their markup.

### What didn't work

- `pnpm test:ui` cannot run here: `Error: Cannot find module 'playwright'` (it looks in `/opt/npm-tools`), as before
  this work.

### What should be done in the future

- `.stamp.solid` and `.hatched` will be used by the Hypotheses view (Phase 4); `.prov.illustrative` by notes.

### Technical details

- Screens kept (`T/various/screens/`): `p3-evidence-light-1600`, `p3-evidence-dark-1600`, `p3-evidence-phone-390`,
  `p3-evidence-webgpu-light-1600`, `p3-perf-light-1600` (W-09: labels no longer overlap),
  `p3-perf-webgpu-light-1600`, `p3-knobs-measured-light-1600`, `p3-knobs-light-1600` (W-21 compiler layout: the
  pin buttons fit), `p3-devices-webgpu-light-1600`, `p3-default-light-1600` (Perf before measuring: model only),
  `p3-phone-dark-390`, `p3-graph-light-1600` (Tune without the evidence table).
