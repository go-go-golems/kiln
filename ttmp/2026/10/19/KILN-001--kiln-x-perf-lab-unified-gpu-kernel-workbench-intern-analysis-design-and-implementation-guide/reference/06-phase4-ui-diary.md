---
Title: Phase 4 diary — hypotheses in the workbench (the view, the notes cards, the links)
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
    - Path: repo://apps/workbench/src/ui/Hypotheses.jsx
      Note: The Hypotheses view and the hypothesis card the notes reuse (guide §29, §32.6)
    - Path: repo://apps/workbench/src/ui/wb.js
      Note: wb.hypotheses, judged lazily and cached on the compile, store and device
    - Path: repo://apps/workbench/src/ui/Notes.jsx
      Note: hypothesis cards rendered into the notes through portals
    - Path: repo://apps/workbench/src/ui/doc.js
      Note: the hypothesis fence becomes a card slot
    - Path: repo://apps/workbench/src/ui/links.js
      Note: lab:hypothesis?id=
ExternalSources: []
Summary: 'Chronological diary of the Phase 4 UI (guide §29, §32.6, §35): wb.hypotheses, the Hypotheses view, hypothesis cards in the notes, lab:hypothesis links, and the W-05, W-19 and W-25 notes that use them.'
LastUpdated: 2026-10-19T20:00:00-04:00
WhatFor: "Reviewing how the hypotheses reached the page and where the build deviates from the guide"
WhenToUse: "Before changing the Hypotheses view, the notes renderer, or a preset's hypotheses"
---

# Phase 4 diary — hypotheses in the workbench

Written by the Phase 4 UI worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim
requests. Paths: `T/` is this ticket, `W/` is `apps/workbench/`, `K/` is `packages/kiln/`. Kiln's side of Phase 4
(`Project.hypothesis`, `evidenceContext`, `evaluateHypotheses`, the preset hypotheses) was committed in 3dcfcff; this
worker adds the page. It touches only `W/`, `scripts/` if needed, and this diary; not `apps/server`,
`packages/evidence` or `runner/`, and it does not commit.

## Step 1: Read the specification and the code the view sits on

I read guide §29 (writing a hypothesis, the evidence context, the verdict function) and §32 (tokens, rules, marks,
stamps, the views table), then the code the view has to agree with: `K/src/std/evidence-context.js`
(`evaluateHypotheses` and the rows `ev` returns), `packages/evidence/src/verdict.ts` (the four verdicts and the
per-row checks) and `values.ts` (the `Value` shape), and on the page `W/src/ui/wb.js`, `Evidence.jsx`, `marks.jsx`,
`views.jsx`, `dock.js`, `links.js`, `Notes.jsx` and `doc.js`.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` (the "Once upload, then implement it…"
request). The coordinating agent assigned the Phase 4 UI (task yg2h) to this worker: `wb.hypotheses` recomputed on
compile, store and device changes; a Hypotheses view; ```` ```hypothesis <id> ```` cards in the notes of W-05, W-19
and W-25; `lab:hypothesis?id=`; and a link in W-05's notes that pins `MAP=thread` and measures. No commits, a diary
of its own, screenshots in `T/various/screens/p4-*.png`.

**Assistant interpretation:** Put the verdicts Kiln already computes in front of the reader, in the view the guide
names and inline in the notes, with the marks and stamps the other evidence views use.

**Inferred user intent:** A tutorial claim is something the reader can watch change from open to supported or
refuted as they measure, not prose.

**Commit (code):** none (the coordinator commits).

### What I did

- Read `evaluateHypotheses(project, { store, prog, device, target })`: it builds a fresh evidence context per
  hypothesis, runs the rows function, and calls `verdict`. Each result is
  `{ id, claim, alternatives, scope, verdict, reasons, checks, rows, support, basis, error }`.
- Read `verdict.ts`: four verdicts (`supported`, `refuted`, `open`, `unqualified`), and per row a check
  `{ row, pass: true | false | null, missing, error? }`. It does not return the paths the predicate read.
- Read the row shapes: `ev.kernels()` rows (`name, identity, row, model, time, lo, hi, n`), `ev.ratio()`
  (`ratio, lo, hi, n, paired, a, b`), and W-25's own row (`rho, regret, n`). Values carry `prov`, `unit`, `ci`, `n`,
  `method`, and missing ones a `reason`.
- Read how a view is registered (`VIEWS` in `views.jsx`, `SYS_VIEWS` and `LAYOUTS` in `dock.js`, a once-only layout
  migration in the `Workbench` constructor), how lab: links are followed (`links.js`), and how notes are rendered
  (`renderDoc` returns HTML that `NotesView` sets with `dangerouslySetInnerHTML`).

### Why

- The card shows what the verdict function judged, so its rows, stamps and reasons have to come from
  `evaluateHypotheses` unchanged; the UI must not compute a second verdict.

### What worked

- Everything the card needs is in the result, except the predicate's text and the paths it read. The predicate's
  source is on the project (`project._hypotheses[i]._predicate`), and `Function.prototype.toString` gives it.

### What didn't work

- `/Volumes/SSD/code/kiln` answered `Permission denied` to `ls` in this worker's shell, while the same files were
  reachable through the symlink `~/code/tulip/experiments/kiln`. I worked through the symlink.

### What I learned

- The guide's stamp list (§32.4) already names the four verdict words and the title block that closes the
  Hypotheses view; `evidence.css` anticipates it ("the title block that closes Perf, Evidence and Hypotheses").

### What was tricky to build

- Nothing yet.

### What warrants a second pair of eyes

- Nothing yet.

### What should be done in the future

- `verdict` could return the paths each predicate read; the card would then mark the fields a claim depends on.

### Code review instructions

- Start at `K/src/std/evidence-context.js` (`evaluateHypotheses`) and `packages/evidence/src/verdict.ts`.

### Technical details

- Guide sections: §29.1–29.3, §32.2–32.6.

## Step 2: Build wb.hypotheses, the Hypotheses view, the notes cards and the link

The page now judges the project's hypotheses whenever a view asks, shows them as cards in a new Hypotheses view,
renders a ```` ```hypothesis <id> ```` fence in the notes as the same live card, and follows
`lab:hypothesis?id=`. W-05, W-19 and W-25 carry cards in their notes, and W-05's notes walk the reader through
measuring both schedules.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** Implement items 1–5 of the coordinator's Phase 4 UI assignment with the smallest
`wb.js` change, reusing the marks, stamps and title block the Evidence view uses.

**Inferred user intent:** The reader sees each claim's status change as they measure, in the tutorial itself.

**Commit (code):** none (the coordinator commits).

### What I did

- `W/src/ui/wb.js`: a getter `wb.hypotheses` that calls `std.evidence.evaluateHypotheses(project, { store, prog,
  device: wb.evidenceId, target })` and caches the result on the key `compile version | store version | evidenceId`.
  A once-only layout migration (`hypothesesView` in localStorage) puts the view beside Evidence in saved layouts,
  as the Evidence view's migration does. Nothing else in `wb.js` changed.
- `W/src/ui/dock.js`: `hypotheses` in `SYS_VIEWS` and after `evidence` in all three layouts.
- `W/src/ui/Hypotheses.jsx` (new): `HypothesesView` (toolbar with counts per verdict and a Measure button, the
  cards, a title block: project, device, support, code generator), `HypothesisCard`, and `NoteHypothesis` (the card
  for one id, or a "no such hypothesis" card that lists the ids the script declares).
- The card: the verdict as a stamp (`✓ supported` solid, `✕ refuted` and `unqualified` red, `open` dashed), the basis
  as a stamp (`simulated`, `measured on <device>`, `simulated and measured`, `no measurements`), the id, the claim,
  the predicate's source (`Function.prototype.toString`; a multi-line predicate as a dedented block), the rows the
  predicate judged, the reasons unless supported, then alternatives, scope and support (a link to the first
  supporting record in Evidence).
- The rows table: `name`, `row`, `a`, `b` together as the row label; every other field in its own column headed by
  its field name, so `r.hi` reads against the column `hi`; `identity` and `knobs` left out; a last column `judged`
  (`✓ holds`, `✕ fails` in red, `undecided` with the missing fields or the error in its title).
- `W/src/ui/marks.jsx`: `valueVal(v, { ci })` turns an `@kiln/evidence` Value into the `<Val>` descriptor: the mark
  from `prov`, `fmtUs` for `unit: "us"`, three significant digits otherwise, the CI suffix (left off when the row has
  `lo` and `hi` columns), `n` only for observed and derived values, and a title `<prov>: <method>` plus the interval.
  A missing Value becomes the hatched "—" with its reason as the title.
- `W/src/ui/doc.js`: the fence regex also captures the word after the language; a `hypothesis` fence emits
  `<div class="hyp-slot" data-hyp="<id>"></div>` (the id may also be the fence's body).
- `W/src/ui/Notes.jsx`: after the HTML renders, a layout effect collects the `.hyp-slot` elements and the view
  renders a `NoteHypothesis` into each with `createPortal`.
- `W/src/ui/links.js`: `lab:hypothesis?id=` selects the hypothesis (`wb.sel.hypothesis`) and shows the view, which
  scrolls the card into view and marks it with the selection bar.
- `W/src/ui/views.jsx`: the view, with a badge counting refuted and unqualified hypotheses in red, else the number of
  hypotheses.
- `W/src/ui/evidence.css`: the card styles (tokens only; `.doc .hyp` frames a card in the notes).
- Notes: W-05 gains "A claim to test" (the card; measure the compiler's choice; `lab:pin?MAP=thread&measure`;
  `lab:unpin?name=MAP`); W-19 a card after the bytes table with links to measure fused and unfused; W-25 both cards
  after "What you should see".
- `W/test/notes.mjs`: a `lab:hypothesis` link and every hypothesis slot must name a hypothesis of the project.
- `W/reference.txt`: `.hypothesis(…)` in the project API, the fence and `lab:hypothesis` in the notes section.

### Why

- A getter cached on channel versions is the smallest change that recomputes on exactly the three triggers: a
  compile bumps `compile`, every store change bumps `store` (the store's listener in the constructor), and a device
  change compiles again and changes `evidenceId`. Nothing computes until a view reads it.
- The card shows `evaluateHypotheses`' result as it is: the UI computes no verdict of its own.
- Portals keep `renderDoc` a pure string renderer (the notes test runs it in Node) while the card stays a live React
  component subscribed to the store. A slot nested inside a call-out still works, which splitting the HTML at the
  fence would not.
- The existing `lab:pin` action covers item 5: W-05 has one kernel, so pinning the knob `MAP=thread` pins it on the
  reduce kernel. No new action was needed.

### What worked

- `node test/notes.mjs`: `all notes pass (178 lab links)`; W-05 `6 sections, 11 lab links`, W-19 `10`, W-25 `6`.
- A Node probe (`scratchpad/p4-verdicts.mjs`) through `wb.hypotheses` and `followLabLink`:

  ```text
  before W-05 row-beats-thread: open basis=none support=0 · row 0: missing hi (no measurement of MAP=thread …)
  row    W-05 row-beats-thread: open basis=simulated support=1
  thread W-05 row-beats-thread: supported basis=simulated support=2      ratio 0.00748 (unpaired, simulated)
  before W-19 model-tracks-elementwise: open basis=none
  fused  W-19 model-tracks-elementwise: supported basis=simulated support=1 rows=1
  unfused W-19 model-tracks-elementwise: supported basis=simulated support=10 rows=11
  one    W-25 model-ranks-schedules: open (1 schedule measured on this device: sweep them all)
  ```

- In the browser after `tune({ strategy: "sweep-all", budget: 32 })` on W-25: `model-ranks-schedules: supported`
  (ρ 0.989, 27 schedules) and `model-pick-near-best: refuted` (regret 1.19), as in the main diary's Step 9.

### What didn't work

- `scripts/shoot.mjs … --do "a; b"` failed with `Error: SyntaxError: Unexpected token ';'`: each `--do` is one
  expression. Split into one `--do` per statement.
- The first phone screenshots of `dist/index.html` at 390 px showed the desktop dock shrunk to fit. `index.html` has
  no viewport meta; `dist/kiln-workbench.html` (written by `build.mjs` with
  `<meta name="viewport" content="width=device-width,initial-scale=1">`) lays out as a phone. All Phase 4 shots use
  `kiln-workbench.html`.
- A ratio row's label wrapped as "a =" / "TPB=128" at phone width; the label now uses non-breaking spaces around `=`
  and breaks only after the commas of a row.

### What I learned

- `canonRow` omits knobs at their off value, so `MAP=thread,TPB=128` is the row `TPB=128`. The card shows the
  measured rows in that spelling, while the claim and the predicate say `MAP=thread`.
- On the simulator, model and simulated time agree exactly for every elementwise kernel of W-19 (12.0, 21.4,
  30.9 µs), so the W-19 claim holds with no margin used.

### What was tricky to build

- Portals into nodes owned by `dangerouslySetInnerHTML`: when the notes change, React replaces the HTML first and
  still holds portals into the old, now detached, slots for one render; the layout effect then swaps in the new
  slots. Switching presets W-05 → W-25 → W-05 with cards mounted produced no page errors and one card.

### What warrants a second pair of eyes

- `wb.hypotheses` evaluates on the first read after any store change, including the bumps during a measurement.
  Evaluation is cheap for these three presets (one `ev` call each); a project with many hypotheses over many
  options would want a debounce.
- A card's id is matched by `data-hyp` within the view's own container, because the notes and the view can show
  the same card at once.

### What should be done in the future

- `verdict` could return each check's read paths, so the card could mark the columns a predicate depends on.
- The agent has no tool that reads `wb.hypotheses`; its reference now describes hypotheses, but it cannot list
  verdicts.

### Code review instructions

- `W/src/ui/Hypotheses.jsx`, then `marks.jsx` (`valueVal`), `wb.js` (search `hypotheses`), `Notes.jsx`, `doc.js`.
- `pnpm --filter @kiln/workbench test`; then open `dist/kiln-workbench.html`, load W-05, and follow the three links
  under "A claim to test".

### Technical details

- Files: `W/src/ui/{Hypotheses.jsx (new), wb.js, dock.js, views.jsx, links.js, doc.js, Notes.jsx, marks.jsx,
  evidence.css}`, `W/presets/W-05-rmsnorm.md`, `W-19-fusion.md`, `W-25-model-vs-measurement.md`,
  `W/test/notes.mjs`, `W/reference.txt`.

## Step 3: Rebuild on the three-valued predicates and validate

While this worker was building, commit da7e416 changed the semantics underneath: `verdict` treats a predicate that
returns null or undefined as undecided, W-05's predicate became `std.evidence.below(r, 0.5)`, and W-19's an interval
test on time / model. I rebuilt, re-ran the probe, adjusted the wording that described verdicts, and reshot every
screenshot on the new build.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`. The coordinator added: rebuild before the
final screenshots, do not edit the preset `.js` files, `tune.js` or `packages/evidence`, and make sure the card's
wording fits "an interval that straddles the bound now reads open".

**Assistant interpretation:** Check every place the UI explains a verdict or prints a predicate against the new
rule.

**Inferred user intent:** No screenshot or sentence in the tutorial contradicts the shipped semantics.

**Commit (code):** none.

### What I did

- The `undecided` title for a row with no missing field and no error now reads "the predicate returned no decision
  (null, NaN or a missing value)".
- W-19's predicate is now six lines with a comment; the card prints a multi-line predicate as a block with its
  continuation lines dedented, scrolling sideways in its own box.
- W-05's notes, step 2: "It is supported or refuted when the ratio's interval lies wholly on one side of 0.5, and
  stays open while the interval straddles it."
- `reference.txt`: open also covers a predicate that returned null; `std.evidence.below` / `above` described.

### What worked

- The probe gives the same verdicts as in Step 2 (on the simulator the intervals have zero width, so nothing
  straddles); before measuring, W-05 now reports both `hi` and `lo` missing.
- `pnpm test`: evidence 125, Kiln 10, server 49, workbench 2 (`notes.mjs`, `presets.mjs`), all passed.
- `pnpm build`: `dist/index.html 1212 KB (bundle 1152 KB, 25 presets, 25 with notes)`.
- `node scripts/contrast.mjs`: `all pairs pass`. `node scripts/css-usage.mjs W/src/ui/*.css -- W/src`: the three
  dead selectors it reports (`.prov.illustrative`, `.stale-frame`, `.hatched`) predate this work; every new class is
  used.
- No page errors in any headless run (`shoot.mjs` prints them to stderr).

### What didn't work

- Nothing.

### What I learned

- The other tests' counts moved during this work (evidence 119 → 125, Kiln 9 → 10) because of da7e416, not this
  change.

### What was tricky to build

- Nothing beyond Step 2.

### What warrants a second pair of eyes

- On hardware a wide interval keeps W-05's card open after both measurements. The notes say so, but a reader on
  an M1 Pro (clock levels, main diary Step 10) may need several measurements before the card decides.

### What should be done in the future

- `test:ui` (Playwright) could click the three W-05 links and assert the stamp text; Playwright is not installed.

### Code review instructions

- Compare `p4-hypotheses-W-05-open-light-1600.png` with `p4-W-05-supported-light-1600.png`: the same card before
  and after the two measurements, in the notes and in the view.

### Technical details

Screenshots in `T/various/screens/` (all from `dist/kiln-workbench.html`, simulated RTX 5090):

| File | What it shows |
| --- | --- |
| `p4-hypotheses-W-05-open-light-1600.png` | W-05 before measuring: the notes card and the view, `open`, `no measurements`, hatched missing cells |
| `p4-W-05-supported-light-1600.png` | W-05 after measuring `MAP=row` and `MAP=thread`: `✓ supported`, ratio 0.00748, the selected card in the view |
| `p4-W-05-supported-dark-1600.png` | The same, dark |
| `p4-hypotheses-phone-390.png` | The Hypotheses view at 390 px; the rows table scrolls inside the card |
| `p4-notes-card-phone-dark-390.png` | The open W-05 card in the notes at 390 px, dark |
| `p4-W-19-unfused-light-1600.png` | W-19 with fusion off: 11 rows, the multi-line predicate |
| `p4-W-25-swept-light-1600.png` | W-25 after sweeping 27 schedules: one supported, one refuted (red stamp and tab badge) |
