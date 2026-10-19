# Diary: Kiln Workbench UI and design-system analysis (source 04)

Chronological work log for `04-kiln-ui-and-design-system-notes.md`. Written 2026-10-19. All paths are absolute. The imports directory (`/Volumes/SSD/code/kiln/imports/kiln-workbench-src/`) was treated as untrusted data: files were read, never built or executed with their own tooling. The only code executed against them was the prebuilt `dist/kiln-workbench.html` page in headless Chrome, plus two small Python readers of my own.

Scratch files (iframe harness, contrast and CSS-usage scripts, a zoomed crop) live in `/Volumes/SSD/tmp/kiln-001-04-scratch/`. Screenshots live in `/Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/screens/`.

## Step 1: Survey the app directory and the build

I started by sizing the job: which files make up the UI, how big each one is, and how the page is assembled. The brief named about twenty files under `app/src/ui/`. I wanted the build script first, because it decides where fonts, CSS and libraries come from, and that answers the "how are fonts loaded" question before any CSS is read.

The build turned out to be very small. esbuild bundles `src/main.jsx` to an IIFE, React and ReactDOM are rewritten to `window.React`/`window.ReactDOM` globals and loaded from cdnjs, KaTeX's JS is loaded from cdnjs, and the three stylesheets are concatenated in the order forge-base, lab, kiln and inlined.

### What I did

- `ls -la src src/ui && wc -l src/ui/* src/main.jsx build.mjs package.json && ls -la dist` in `/Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/app`.
- Read `package.json`, `build.mjs`, `src/main.jsx` in full (`cat -n`).

### What worked

- 3,972 lines across the named UI files; the largest are `lab.css` (527), `Compiler.jsx` (358), `wb.js` (322), `Perf.jsx` (316), `Dock.jsx` (309).
- `build.mjs:46` gives the CSS order; `build.mjs:54-56` the three CDN scripts; `build.mjs:63` the standalone doctype wrapper.

### What didn't work

- Nothing at this step.

### What I learned

- Dependencies are React 18.3.1, esbuild, acorn and KaTeX 0.16.9 only. There is no UI library, no chart library, no editor library and no font package.
- `main.jsx:8` puts `{ wb, k, P, std }` on `window.__kiln`. That global later made it possible to drive the app from a test harness.

### What warrants a second pair of eyes

- The page depends on cdnjs at runtime for React and KaTeX. A unified app that must work offline needs to bundle them.

## Step 2: Read the three stylesheets

The look of the app is defined entirely by three hand-written stylesheets. I read all of them with line numbers so the notes could cite token definitions and component rules exactly.

The comments name the lineage. `forge-base.css` is "Porous Forge — Swiss style: white ground, #1a1a1a ink, Arial in two weights, 1 px rules, no tinted panels". `lab.css` is "Octavo Lab: everything the FORGE base does not cover". `kiln.css` is "Kiln Workbench additions to Porous Forge: the same tokens, 1 px rules, red only for errors and selection". Kiln reuses two earlier projects' stylesheets wholesale.

### What I did

- `cat -n src/ui/kiln.css`, `cat -n src/ui/forge-base.css`, and `cat -n src/ui/lab.css` in two halves (lines 1-270 and 270-527).

### What worked

- All tokens are in `forge-base.css:4-20`, plus three device-shell tokens in `lab.css:2-4` and one in `kiln.css:2`.

### What didn't work

- Nothing at this step.

### What I learned

- `--mono` and `--display` are both Arial (`forge-base.css:9`); the real monospace family is `--code` (`forge-base.css:10`). This naming will collide with Perf Lab, where `--mono` really is IBM Plex Mono.
- Every control sets `border-radius: 0`. There are no elevation shadows: `box-shadow` appears only as inset rules (a 2 px red selection bar, a 1 px active-tab underline).
- `forge-base.css` begins with a literal `<style>` tag. `build.mjs:46` strips it.

### What warrants a second pair of eyes

- `lab.css:437-442` defines `.gutter` for the dock resize gutters. That reuses the class name of the editor's line-number gutter (`forge-base.css:97`, `Ide.jsx:82`). See Step 6.

## Step 3: Read the shell, the dock and the store

Next I read the app shell (`App.jsx`), the view registry (`views.jsx`), the pure layout-tree model (`dock.js`), the tiled-workspace UI (`Dock.jsx`), the store (`wb.js`) and the shared components (`common.jsx`). Together these are the architecture a unified app would copy, so I read every line.

### What I did

- `cat -n` on `App.jsx`, `views.jsx`, `dock.js`, `Dock.jsx`, `wb.js` (two halves) and `common.jsx`.
- `grep -n "lsGet\|lsSet\|localStorage"` across `src/agent`, `src/core`, `src/std` and `src/ui`, to list every persistence key.

### What worked

- localStorage keys found: `mine`, `device`, `evidence`, `theme`, `layout`, `last`, `draft`, `draftNotes` (in `wb.js`) and `agentSettings`, `convs` (in `agent/agent.js`). All carry the `kiln-wb:` prefix (`wb.js:17`).

### What didn't work

- Nothing at this step.

### What I learned

- The store is one mutable class instance with named "channels". `bump(...chs)` bumps a version counter and calls subscribers; `useLab(...chs)` is a `useReducer` force-update hook (`common.jsx:5-9`). There is no immutable state and no Redux.
- Dock operations are pure tree transforms with a `normalize()` that cleans persisted trees (`dock.js:37-65`). `wb.js:41` holds a migration that inserts the Notes view into layouts saved before it existed.

### What warrants a second pair of eyes

- `Notes.jsx:14` memoizes on `wb.version("katex")`, but nothing ever bumps a `katex` channel. It is harmless because KaTeX loads synchronously before the bundle (`build.mjs:56-58`), but it is dead.

## Step 4: Read every screen

I read the views with three questions in mind: what each one shows, what it reads from `wb`, and what each interaction calls. I also read the two Markdown renderers and the `lab:` link router, because "links that drive the workbench" is the feature that best distinguishes Kiln's notes.

### What I did

- `cat -n` on `Ide.jsx`, `highlight.js`, `Compiler.jsx`, `Perf.jsx` (two parts), `Knobs.jsx`, `Kernels.jsx`, `Notes.jsx`, `links.js`, `doc.js`, `md.js`, `Events.jsx` and `Agent.jsx`.
- Skimmed `src/agent/agent.js`: the header, `sed -n 285,313p` for snapshot and revert, and `sed -n 586,594p` for the suggestions.
- `grep -rn "_phase"` in core, std, ui and agent, plus `grep -n "phase" ../../reference.txt`, to understand the build and run phases of parameters.

### What worked

- The editor is a transparent `<textarea>` over a highlighted `<pre>` with a separate line-number gutter, all scroll-synced (`Ide.jsx:50-89`). There is no CodeMirror or Monaco.
- All charts are hand-written SVG: the roofline (`Perf.jsx:127-160`), the tuning scatter (`Perf.jsx:231-251`), the sparkline (`common.jsx:60-73`) and the layered DAG (`Compiler.jsx:198-285`).
- The `lab:` link verbs are in `links.js:10-54`.

### What didn't work

- `grep -n "katex" -r src --include=*.js --include=*.jsx` failed with `(eval):1: no matches found: --include=*.js`. zsh expands the unquoted glob. I re-ran it without the `--include` globs: `grep -rn "katex" src/ui src/agent src/main.jsx`.

### What I learned

- A parameter's phase is `"build"` (the default) or `"run"`. Changing a run-phase parameter only bumps `params`; it does not recompile (`wb.js:190`). The Knobs and Code views mark run-phase parameters with an italic "run" (`Knobs.jsx:37`).
- The notes math uses KaTeX with `output: "mathml"` (`doc.js:11`). No KaTeX CSS or fonts are needed; the browser's native MathML rendering draws it.

### What warrants a second pair of eyes

- The agent's `eval` tool runs model-written JavaScript inside the page, with a scope that reaches the store (`agent/agent.js:1-4`, `makeAgentScope` at line 335). That is a design choice to keep in mind if the unified app adopts the agent panel.

## Step 5: Check fonts in the built page

The brief asked whether fonts are embedded (fontsource, inline base64). I checked the 742 KB built page directly instead of inferring from source.

### What I did

- `grep -o "@font-face" dist/kiln-workbench.html | wc -l`, then grepped for `data:font`, `woff`, `font-family:` declarations, `fonts.googleapis` and `<script src=` / `<link` tags.

### What worked

- Zero `@font-face`, zero `data:font`, zero woff references, zero Google Fonts. The only external resources are the three cdnjs scripts.

### What didn't work

- Nothing at this step.

### What I learned

- Kiln uses system fonts only: Arial for UI and display text, `ui-monospace, Menlo, Consolas, "Courier New"` for code. That is a large practical difference from Perf Lab, which bundles Archivo Variable and IBM Plex Mono (`lab-workbench/src/main.tsx:1-4`).

### What warrants a second pair of eyes

- Nothing at this step.

## Step 6: Render screenshots

Headless Chrome rendered the standalone page straight from `file://` because React and KaTeX come from cdnjs over https. To capture views other than the default layout, I wrote an iframe harness. It loads the page, waits for `window.__kiln.wb.ready`, then calls store actions (`load`, `useLayout`, `showView`, `measure`, `tune`, `select`). Same-origin access between `file://` frames needs `--allow-file-access-from-files`. Each run used a fresh throwaway `--user-data-dir`, so the user's real Chrome profile and localStorage were never touched. After every run I checked with `pgrep -f chrome-prof` that no Chrome process was left; the count was 0 each time.

Perf Lab's `dist/index.html` references `/assets/...` by absolute path, so it cannot load from `file://`. I served `dist/` briefly with `python3 -m http.server 47811 --bind 127.0.0.1`, took one screenshot and killed the server. A `curl` afterwards returned `000`.

### What I did

- Default layout, light: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=<tmp> --hide-scrollbars --window-size=1600,1000 --virtual-time-budget=15000 --screenshot=.../screens/kiln-default-light-1600.png file:///.../dist/kiln-workbench.html`
- Dark: the same command with `--force-dark-mode --blink-settings=preferredColorScheme=0`.
- Harness scenarios `#perf`, `#trace`, `#graph` and `#knobs` via `/Volumes/SSD/tmp/kiln-001-04-scratch/harness/drive.html`, with `--allow-file-access-from-files` and a 40-90 s virtual time budget.
- Phone: `--window-size=390,844`.
- Perf Lab: served `dist/` and captured `perflab-default-light-1600.png`.
- Zoomed the dock tab strip: `sips -c 70 660 --cropOffset 50 0 ...kiln-default-light-1600.png`, then `sips -z 210 1980` (saved as `/Volumes/SSD/tmp/kiln-001-04-scratch/crop-strip-x3.png`).

Screenshots (all in `/Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/screens/`):

- `kiln-default-light-1600.png`: default "Code beside the compiler" layout; Notes (W-18 roofline tutorial with MathML), IR, Perf.
- `kiln-default-dark-1600.png`: the same in dark mode.
- `kiln-perf-light-1600.png`: W-09 MLP, "Measure and tune" layout, after Measure. Code editor, Parameters and Checks; Perf with big number, kernel table, meters and roofline; Kernels with CUDA source.
- `kiln-trace-light-1600.png`: Trace with an expanded rewrite diff, Passes table, Knobs fork table and fork detail.
- `kiln-graph-light-1600.png`: W-10 Attention, "IRs, passes and knobs" layout. Agent panel (not connected), Graph DAG, Events log, Tune after a 16-program sweep.
- `kiln-knobs-light-1600.png`: W-21 matmul ladder. Reference view, Graph, Knobs with 645 options.
- `kiln-phone-390.png`: phone width (PhoneDock).
- `perflab-default-light-1600.png`: Perf Lab "Hello, Perf Lab" board, for comparison.

### What worked

- Every capture rendered, including MathML math, the hand-drawn roofline and the tuning chart.

### What didn't work

- Chrome printed harmless stderr noise on every run, for example `ERROR:ui/display/mac/cv_display_link_mac.mm:188] CVDisplayLinkCreateWithCGDisplay failed. CVReturn: -6670` and `Trying to load the allocator multiple times. This is *not* supported.` The screenshots were still written.
- In `kiln-trace-light-1600.png` the header still shows "W-18 The roofline: three regimes" and "1 kernel · 16 ms compile", while the editor shows W-09 and the Kernels badge says 2. The other harness scenarios, which also ran `measure` or `tune`, show the right header. I did not investigate the cause; the store was driven from a parent frame. Treat that header as a capture artifact, not a confirmed product bug.

### What I learned

- Seen in the captures, not inferred: the editor's line-number gutter is painted mid-grey. That comes from the `.gutter` class collision noted in Step 2 (`lab.css:437`). The dock tab strip also shows a second grey rule under the tab labels. That comes from the duplicate `.dtabs` rule (`lab.css:183` for detail tabs, reused by the dock at `lab.css:445`). The zoomed crop confirms it.
- Phone width clips content horizontally: header actions, the pipeline map, the right column of the key-value lists. `body` has `overflow: hidden` (`forge-base.css:23`).

### What warrants a second pair of eyes

- The harness drives the app through `window.__kiln`. If the unified app keeps a debug global like that, the same technique gives cheap visual regression tests.

## Step 7: Read Perf Lab's tokens and look

For the comparison section I read Perf Lab's token and base stylesheets, its grid shell, the sheet styles, and the provenance and illustrative-stamp code.

### What I did

- `cat -n src/styles/tokens.css src/styles/base.css`, `WorkbenchLayout.css`, `BoardSheet.css`, `Panel.css`, `ValueCell.css`, `ProvenanceGlyph.tsx` and `.css`, and `Chip.css` (head) in `/Volumes/SSD/code/kiln/lab-workbench`.
- `grep -n -A12 PROV_GLYPH src/lib/format.ts`, `grep -n "export type Prov" src/lang/values.ts`, `sed -n 1,40p BoardSheet.tsx` for `dataOrigin()`, `package.json`, `main.tsx` imports, and the head of `CodeEditor.tsx`.

### What worked

- Provenance has five classes, `observed ● / derived ◐ / heuristic ◌ / illustrative ◇ / unknown ▨` (`format.ts:66-72`). The ILLUSTRATIVE stamp text comes from `BoardSheet.tsx:21-29`. `.panel__stamp` is a dashed, letter-spaced mono label (`Panel.css:23-29`).

### What didn't work

- `grep -rniE "illustrative|provenance|stamp" src --include=*.css --include=*.tsx --include=*.ts -l` failed with `(eval):1: no matches found: --include=*.css`, the same zsh glob problem. I re-ran it without `--include`.

### What I learned

- Perf Lab's editor uses the same transparent-textarea-over-highlighted-mirror technique as Kiln (`CodeEditor.tsx:5`), so the two apps already agree on editor technology.
- Perf Lab's charts use d3-scale and d3-shape (`ChartView.tsx`, `TimelineView.tsx`); Kiln's are hand-drawn SVG.

### What warrants a second pair of eyes

- Nothing at this step.

## Step 8: Quantify the CSS and check contrast

To make the de facto spacing, radius and type scales evidence-based, I counted values with grep. I also wrote a heuristic: a class is "unused" if its name never appears as a word in Kiln's JSX/JS. It estimates how much of the inherited Forge/Octavo CSS is dead weight. I computed WCAG contrast ratios for the token pairs that matter.

### What I did

- `grep -ohE "border-radius: ..." | sort | uniq -c`, and the same for `box-shadow`, `gap`, `padding`, `height`, literal `font-size`/`font:` values and `var(--fs-*)` usage, across the three stylesheets.
- `python3 -I /Volumes/SSD/tmp/kiln-001-04-scratch/tools/cssuse.py <ui dir>` (the unused-class heuristic).
- `python3 -I /Volumes/SSD/tmp/kiln-001-04-scratch/tools/contrast.py` (WCAG 2.x relative-luminance contrast).
- `grep -n "reduced-motion\|animation"`, `@container`, `@media` and ARIA attribute counts.

### What worked

- Radius: 35 × `0`, 5 × `50%` (dots), 1 × `8px`, 1 × `0 0 28px 0` (both device-shell leftovers). Gaps cluster at 6 and 8 px (33 and 32 uses), then 10 and 4. `--fs-xs` is used 97 times and `--fs-s` 49 times, so the UI is overwhelmingly 10.5-12 px.
- Unused-class estimate: forge-base about 33 of 125 classes, lab about 86 of 269, kiln 0 of 123. The two kiln.css "unused" hits (`caveat`, `exercise`) are built dynamically by `doc.js:89`.
- Contrast: `--ink-2` on white is 4.74 (passes AA); `--accent` on white is 4.94. Code comments (`--tok-com #a3a3a3`) are 2.52 on white and 1.74 on the mis-painted gutter. `--hair` borders are 1.45. Dark `--tok-com` is 3.41.

### What didn't work

- `grep -c "title=" ui/*.jsx | paste -sd' '` failed with `usage: paste [-s] [-d delimiters] file ...`. macOS `paste` needs `-` as the file argument. I dropped that measurement; it was not needed.

### What I learned

- No `prefers-reduced-motion` rule exists. The single keyframe `bl` (a 0.8 s two-step blink) runs on the busy pill, waiting pips, "thinking…" and running or ask tool cards.
- The unused-class heuristic is noisy for ids and common words (`title`, `parts`, `split`), so I report class counts as estimates only.

### What warrants a second pair of eyes

- The contrast numbers come from my script, not an audit tool. Spot-check two or three with a standard checker before quoting them elsewhere.

## Step 9: Move scratch to /Volumes/SSD (coordinator request)

Mid-task, the coordinator asked for this diary and asked that screenshots and scratch files live on /Volumes/SSD because the boot disk is nearly full. Screenshots were already on SSD. My Chrome profiles and tools had been in the session scratchpad on the boot disk.

### What I did

- `df -h / /Volumes/SSD`: 17 GiB free on `/`, 1.5 TiB free on the SSD.
- Copied `harness/`, `tools/`, the crop and `httpd.log` to `/Volumes/SSD/tmp/kiln-001-04-scratch/`, then deleted my eight `chrome-prof-*` directories (about 2.2-3.0 MB each), `harness/`, `tools/`, the crops and the log from the boot-disk scratchpad. I deleted only files I had created.

### What worked

- About 20 MB freed on the boot disk; the scratch files are now on SSD.

### What didn't work

- Nothing at this step.

### What I learned

- Headless Chrome profiles are small (about 2 MB each) when created with `--no-first-run`.

### What warrants a second pair of eyes

- Nothing at this step.

## Step 10: Write the notes document and verify its citations

With the research finished, I wrote `04-kiln-ui-and-design-system-notes.md` in one pass. It has seven numbered sections in the order the task asked for, a summary for the guide author at the top, and two appendices (screenshots, and a UI file inventory with line counts). The token tables use the `var()` reference counts from Step 8 to flag dead tokens. The unified-token proposal keeps every existing Kiln value. New tokens are marked with a star, and aliases are given so Perf Lab components can compile against the Kiln tokens during a migration.

Afterwards I re-checked the citations I had written from my notes rather than re-reading: the ARIA roles, the container-query rules, where `.side` sits in the view markup, the `.gutter` collision and the file line counts.

### What I did

- Wrote `/Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/04-kiln-ui-and-design-system-notes.md` (972 lines; H1 on line 1).
- `wc -l` on the output and on all 21 UI files. The counts in Appendix B match exactly.
- `grep -n 'role="img"\|radiogroup\|role="radio"' *.jsx` confirmed `Compiler.jsx:255`, `Perf.jsx:144,243,273,275`.
- `grep -n 'container' forge-base.css lab.css kiln.css` confirmed `forge-base.css:159,193`, `lab.css:459,462,508,518`, `kiln.css:173`, and `lab.css:426` for the safe-area inset.
- `sed -n 121,137p Compiler.jsx` confirmed that `.side` (`NodeSide`) is a sibling of `.stagewrap`, not a child. So `@container stage (max-width: 560px) { .side { display: none } }` (`forge-base.css:193`) can never match.
- `grep` for `gutter` confirmed that `Ide.jsx:82` and `Dock.jsx:93` both use the bare class `gutter`, which `forge-base.css:97` and `lab.css:437` style differently.

### What worked

- Every spot-checked citation held.

### What didn't work

- Nothing at this step.

### What I learned

- The dead `stage` container rule is a third cascade or structure bug alongside `.gutter` and `.dtabs`. It is harmless (the side column stacks through the `tile` container query instead), but anyone porting the CSS should drop it.

### What warrants a second pair of eyes

- Section 6.3 (unified tokens) is a proposal, not an observation. The most debatable choices:
  - collapsing Perf Lab's blue `--sig` into ink, and `--bad` into Kiln red;
  - making `--caution` amber optional;
  - replacing the six categorical data hues with dash and marker-shape encoding.
  A designer should sign off before these become the guide's rules.
- Section 6.4 draws the provenance marks as 8 px CSS shapes. They have not been rendered side by side with the real `.dot` classes; a quick visual check is worthwhile.
- The ~120 "dead" classes come from a name-grep heuristic (Step 8). Confirm before deleting any CSS in a port.
