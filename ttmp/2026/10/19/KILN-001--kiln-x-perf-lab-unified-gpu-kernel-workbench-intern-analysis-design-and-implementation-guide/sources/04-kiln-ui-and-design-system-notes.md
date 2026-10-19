# Kiln Workbench: UI architecture and design-system notes (source 04)

Source notes for KILN-001, written 2026-10-19. They describe the Kiln Workbench web UI so that a unified Kiln × Perf Lab workbench can **adopt Kiln's look**: its typography, tokens, layout model and component vocabulary. They also explain how Perf Lab's provenance and "illustrative" concepts can be drawn in Kiln's visual language.

Abbreviations used throughout:

- `K/` = `/Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/app/`
- `UI/` = `K/src/ui/`
- `PL/` = `/Volumes/SSD/code/kiln/lab-workbench/`

Citations are `file:line`. Screenshots are in `/Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/screens/` and are listed in the appendix. The work log is in the sibling file `04-kiln-ui-and-design-system-diary.md`.

Method. I read every named file in full and grepped the built `K/dist/kiln-workbench.html` for fonts and external resources. I rendered the built page in headless Chrome: the default layout in light and dark, four layouts driven through `window.__kiln.wb` from an iframe harness, and a phone width. I rendered Perf Lab's `dist` from a short-lived localhost server. Contrast ratios were computed with a small WCAG relative-luminance script. Nothing in the imports directory was built, installed or modified.

---

## 0. Summary for the guide author

- **The look is "Swiss" (International Typographic Style).** White ground, near-black ink (`#1a1a1a`), one grey for secondary text (`#737373`) and **one** signal colour, red `#e2001a`. Red is used only for errors, selection and live links. Type is Arial in two weights (400/700). Code is in the system monospace. Every structure is a 1 px rule, there is no radius anywhere, and there are no elevation shadows. The stylesheet comments say so (`UI/forge-base.css:2-3`, `UI/lab.css:1`, `UI/kiln.css:1`).
- **No fonts are shipped.** The built page has 0 `@font-face` and 0 `data:font` URIs. React 18.3.1 and KaTeX 0.16.9 load from cdnjs, and KaTeX renders math as **MathML**, so no KaTeX CSS or fonts are needed (`K/build.mjs:54-56`, `UI/doc.js:11`).
- **Layout is a persisted tree of tiles** (`UI/dock.js`). Splits run in rows or columns with fractional sizes; each tile holds a tab strip of views. Tabs can be dragged onto other tabs or onto a tile edge, gutters are keyboard-resizable, a tile can be maximised (⌘\\), four preset layouts are offered, and phones collapse to one strip of tabs (`UI/Dock.jsx`). The layout is saved under `localStorage["kiln-wb:layout"]`.
- **Thirteen views** are registered in one table (`UI/views.jsx:15-29`): Notes, Code, Agent, Reference, IR, Graph, Trace, Kernels, Perf, Knobs, Tune, Devices, Events. Most views share the same frame: a `.stagewrap` (toolbar plus scroll area) beside a 288 px `.side` column of `.block`s.
- **State is one mutable store with named channels** (`UI/wb.js`). `wb.bump("compile")` notifies, and the `useLab("compile", …)` hook force-renders the subscribers (`UI/common.jsx:5-9`). Ten localStorage keys are prefixed `kiln-wb:`.
- **No UI, chart or editor libraries are used.** The editor is a transparent `<textarea>` over a highlighted `<pre>`, with hand-written tokenizers. Every chart is hand-written SVG: roofline, tuning scatter, sparkline and a layered DAG. Perf Lab already uses the same editor technique.
- **For the unified app:** keep Kiln's tokens and rename the misleading `--mono` (it is Arial). Express Perf Lab's provenance through glyph **shape and fill** and dashed rules, never through new hues. Add only one optional amber, and only if "stale" cannot be carried by dashes plus a word. Section 6 has the concrete token table, the glyph mapping and the stamp CSS.
- **Fix before reuse:** two cascade collisions are visible in the screenshots (the `.gutter` and `.dtabs` duplicates). About 120 inherited classes are dead device-simulator CSS. Comments and borders fail contrast. Animations ignore `prefers-reduced-motion`. Phone widths clip content horizontally.

---

## 1. Design tokens

### 1.1 Where the tokens live and how the CSS is assembled

The page's CSS is three files concatenated **in this order** and inlined in a `<style>` tag: `forge-base.css`, then `lab.css`, then `kiln.css` (`K/build.mjs:46`). `forge-base.css` begins with a literal `<style>` line (`UI/forge-base.css:1`) that the build strips with a regex. All core tokens are on `:root` in `UI/forge-base.css:4-12`. Dark values are applied twice, so that both the OS preference and an explicit user choice work:

- `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` (`UI/forge-base.css:13-16`)
- `:root[data-theme="dark"] { … }` (`UI/forge-base.css:17-20`)

The theme button cycles auto → explicit light/dark (`UI/App.jsx:112`). An effect writes or removes `data-theme` on `<html>` (`UI/App.jsx:20-23`). The choice persists as `kiln-wb:theme` (`UI/wb.js:38,51`). `color-scheme: light|dark` is set inside the token blocks, so native controls (selects, scrollbars, range inputs) follow the theme.

### 1.2 Colour tokens (`UI/forge-base.css:5-8`, dark `:14-16` and `:18-20`)

The "uses" column counts `var(--x)` references across the three stylesheets and the UI JS. Counts were taken with grep and are approximate.

| Token          | Light                   | Dark                     | Role, with representative uses                                                                                                                                                                               | Uses |
| -------------- | ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| `--bg`         | `#ffffff`               | `#1a1a1a`                | Page and pane ground (`forge-base:23`); text colour on inverted controls (`.btn.on`, `.seg > button.on`, `.irchip.on`)                                                                                        | many |
| `--fill`       | `#f6f6f6`               | `#222222`                | Hover rows (`.rt tr.clickable:hover td`, `.trow-h:hover`), inline code background (`.doc code`), callout ground (`kiln:224`), diff "add" lines (`lab:288`)                                                    | many |
| `--fill-2`     | `#e6e6e6`               | `#3a3a3a`                | Only the sparkline area fill (`lab:246`)                                                                                                                                                                      | 1    |
| `--ink`        | `#1a1a1a`               | `#f2f2f2`                | Text; primary and active control fill; emphasis rules (`.params` top border `forge-base:114`, doc `h2` top rule `kiln:199`); focus outline (`forge-base:28`)                                                  | many |
| `--ink-2`      | `#737373`               | `#9a9a9a`                | Secondary text, labels, units, axes, inactive tabs                                                                                                                                                            | many |
| `--hair`       | `#d6d6d6`               | `#3d3d3d`                | Control borders, pane and tile dividers, dock gutters, table header rule (`.rt th`)                                                                                                                           | 93   |
| `--rule`       | `#ededed`               | `#2a2a2a`                | Table row rules (`.rt td`), list separators, sub-header rules                                                                                                                                                 | 24   |
| `--code-bg`    | `#fbfbfb`               | `#1d1d1d`                | Editor, code blocks (`.src`), text inputs (composer, pastebox)                                                                                                                                                | 12   |
| `--accent`     | `#e2001a`               | `#ff3b4a`                | **The only hue.** Errors, the selection bar (`inset 2px 0 0`), lab-link underline and ▸, the selected roofline point, the editor caret (`forge-base:103`), `.btn.danger`, drop hints                           | many |
| `--sel`        | `rgba(226,0,26,.10)`    | `rgba(255,59,74,.16)`    | Red wash: editor text selection, error-line background (`.ln-err`), "Try" callout (`kiln:226`), step banner (`kiln:45`), bad graph-node fill, drop-hint fill                                                  | 7    |
| `--good`       | `#1a1a1a`               | `#f2f2f2`                | Equals ink, so success is **not** coloured. Never referenced.                                                                                                                                                 | 0    |
| `--warn`       | `#8c8c8c`               | `#9a9a9a`                | A **grey**, used only by the unused console widget (`forge-base:279`)                                                                                                                                         | 1    |
| `--grid`       | `#f2f2f2`               | `#222222`                | Machine-stage grid paper (`lab:81`); unused in Kiln                                                                                                                                                           | 2    |
| `--grid-major` | `#e4e4e4`               | `#2d2d2d`                | Never referenced                                                                                                                                                                                              | 0    |
| `--stage`      | `#ffffff`               | `#1a1a1a`                | `#stage`, `.diagram`, `.machine-stage`; all unused in Kiln                                                                                                                                                    | 3    |
| `--panel`      | `#ffffff`               | `#1a1a1a`                | `.ovl-box` overlay ground; unused in Kiln                                                                                                                                                                     | 1    |
| `--tok-key`    | `#1a1a1a`               | `#f2f2f2`                | Keywords, drawn **bold** (`forge-base:105`)                                                                                                                                                                   |      |
| `--tok-str`    | `#6b6b6b`               | `#a6a6a6`                | Strings                                                                                                                                                                                                       |      |
| `--tok-num`    | `#1a1a1a`               | `#f2f2f2`                | Numbers; builder calls (`.tk-b`) are bold ink                                                                                                                                                                 |      |
| `--tok-expr`   | `#e2001a`               | `#ff3b4a`                | The `=>` arrow, and CUDA/WGSL builtins (`threadIdx`, `__syncthreads`, `@compute`) in bold red (`UI/highlight.js:33,52`)                                                                                       |      |
| `--tok-com`    | `#a3a3a3`               | `#6e6e6e`                | Comments (italic), editor line numbers (`forge-base:97`), IR `#` comments (`kiln:17`), pass-chip arrows                                                                                                       |      |
| `--tok-punc`   | `#a3a3a3`               | `#6e6e6e`                | Punctuation                                                                                                                                                                                                   |      |

Additional tokens:

| Token         | Light       | Dark        | File          | Notes                                                                                     |
| ------------- | ----------- | ----------- | ------------- | ----------------------------------------------------------------------------------------- |
| `--scr-bezel` | `#1a1a1a`   | `#0d0d0d`   | `UI/lab.css:2-4` | Octavo device-screen bezel. Only used by `.scrwrap`/`.pscreen`, which are unused in Kiln |
| `--shell`     | `#ffffff`   | `#222222`   | `UI/lab.css:2-4` | Device shell ground. Unused in Kiln                                                      |
| `--shell-2`   | `#f6f6f6`   | `#1d1d1d`   | `UI/lab.css:2-4` | Never referenced                                                                         |
| `--code-ink`  | `var(--ink)`| (inherits)  | `UI/kiln.css:2`  | Declared, never referenced                                                               |

How to read the palette:

1. Neutrals carry everything. Hierarchy comes from weight (700 vs 400), from ink vs ink-2, and from rule weight (`--hair` vs `--rule` vs a 1 px `--ink` rule for strong section breaks).
2. Inversion (ink fill, bg text) means "on / primary / chosen". It is used by `.btn.primary`, `.btn.on`, `.seg > button.on`, the active `.irchip` and the device `.dot.live`.
3. Red means exactly three things: **failure** (`.bad`, `.errbar`, `.pill.bad`, ✕ glyphs), **current selection** (2 px inset left bar on `.trow.on`, `.devrow.on`, `.ev.sel`, `.hrow.on`, `.rt tr.sel`, the selected roofline point and graph node) and **live action** (lab-link underline and ▸, the caret, the drop target). Success is never coloured; it is ink plus "✓".

### 1.3 Typography tokens (`UI/forge-base.css:9-11`)

| Token       | Value                                                           | What it really is                                                                                |
| ----------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `--mono`    | `Arial, "Helvetica Neue", Helvetica, sans-serif`                | **Misnamed:** the UI sans. The body is set in it (`forge-base:23`), as are `.doc` (`kiln:196`) and `kbd` |
| `--display` | `Arial, "Helvetica Neue", Helvetica, sans-serif`                | Headings, the brand and big numbers. Identical to `--mono`                                        |
| `--code`    | `ui-monospace, Menlo, Consolas, "Courier New", monospace`       | The real monospace: editor, IR text, diffs, events, `code`                                        |
| `--fs-xs`   | `10.5px`                                                        | Meta labels, units, table headers, badges. **97 uses.** This is the dominant size                 |
| `--fs-s`    | `12px`                                                          | Body (`forge-base:23`: `font: 400 var(--fs-s)/1.45 var(--mono)`), buttons, table cells. 49 uses   |
| `--fs-m`    | `13px`                                                          | Tab labels (`.ptabs`, `.dtab .lbl`), block `h2`. 9 uses                                           |
| `--fs-l`    | `18px`                                                          | Detail headings (`.detail-h h2`, `lab:179`). 1 use                                                |
| `--fs-xl`   | `30px`                                                          | The Perf big number (`.bignum b`, `kiln:108`). 1 use                                              |

Weights: only **400 and 700** appear in Kiln's own rules. That is the "Arial in two weights" rule (`forge-base:2`).

Literal sizes outside the scale (from grep):

- 9 px: `#title label`, `.tiny`, `.board .hdr`
- 9.5 px: `.tag`, `.otag`, graph `.ns`/`.elabel`, roofline `.ax` axis text
- 10 px: roofline point labels, `.msg .usage`, `.hk`, graph column heads
- 11-11.5 px: code blocks, IR text (`.irtext` is `400 11.5px/1.6`)
- 12 px/18 px: the editor, a fixed 18 px line height so the gutter lines up (`forge-base:98,101`)
- 13.5 px/1.65: Notes body (`.doc`, `kiln:196`)
- 22, 16, 13.5 and 12 px: Notes `h1`-`h4` (`kiln:197-201`)
- 14 px: `.projbtn .ptitle`, `.pill b`
- 15 px: `.brand`

Line heights: 1.45 for the body; 1.2 for headings and buttons; 1.5-1.6 for code; 1.65 for long-form notes.

Case and letter-spacing: Kiln is **mixed case almost everywhere**. Uppercase with letter-spacing appears only in Notes `h4` (`kiln:201`, 0.05em) and graph column heads (`lab:208`, 0.06em). Numbers use `font-variant-numeric: tabular-nums` in every table, pill, kv list and meter row.

### 1.4 Fonts actually used and how they are loaded

- **No web fonts.** The built `K/dist/kiln-workbench.html` (742 KB) contains 0 `@font-face` rules, 0 `data:font` URIs, 0 `woff` references and no Google Fonts link. Arial or Helvetica come from the OS, and code uses `ui-monospace` (SF Mono on macOS), then Menlo or Consolas. The screenshots show Arial UI with SF Mono/Menlo code.
- **External scripts** (`K/build.mjs:54-56`): `react@18.3.1` UMD, `react-dom@18.3.1` UMD and `katex@0.16.9` `katex.min.js`, all from cdnjs. React is aliased into the esbuild bundle as `window.React` by a tiny plugin (`K/build.mjs:32-38`).
- **Math:** `tex()` calls `katex.renderToString(src, { output: "mathml", … })` (`UI/doc.js:9-13`). The browser draws native MathML, so no KaTeX stylesheet or font files are needed. If KaTeX is missing, TeX falls back to `<code class="tex">` or `<pre class="tex">`.
- `package.json` lists `katex` only as a devDependency (`K/package.json:23-25`). It is never bundled.

### 1.5 Spacing, sizes and borders (de facto scales)

There are **no spacing tokens**; every value is a literal. Counting across the three files gives the de facto scale:

| Property       | Most common values (count)                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `gap`          | 6px (33), 8px (32), 10px (15), 4px (10), 2px (6), 3px (5), 12px (5), 14px (3)                                                  |
| `padding`      | `0 8px` (8), `8px 10px` (7), `2px 0` (6), `0 4px` (6), `6px 8px` (5), `6px 12px` (5); blocks use `12px 16px 14px` (`forge-base:87`) |
| Control height | 30px (10: `.seg` buttons, `.tog`, `.pill`, `.devpill`, `.irchip`, `.filter`, selects), 24-28px (small variants), 32px (`.ibtn`)  |
| Chrome heights | header `.bar` 52px (`forge-base:50`); dock tab strip `.dstrip` 40px (`lab:444`); `.toolbar` min 46px (`forge-base:160`); `.hint` 30px |
| Columns        | `.side` 288px (`forge-base:191`), 232px at ≤900px (`forge-base:236`); `.doc` max 76ch (`kiln:196`)                             |

Radius, shadow and rule values:

| Property        | Values (count)                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `border-radius` | `0` (35, set explicitly on nearly every control), `50%` (5: `.dot`, `.led`, `.hk.round`, `.mirror.round`, `.cam`), `8px` (1, device), `0 0 28px 0` (1, device). **Rule: square corners; circles only for status dots** |
| `box-shadow`    | `inset 2px 0 0 var(--accent)` (7: the selection bar), `inset 0 -1px 0 var(--ink)` (4: the active-tab underline), `inset 0 -2px 0 var(--ink)` (1), `0 0 0 1px var(--ink)` (1). **No drop shadows anywhere**; floating menus are separated by a 1 px **ink** border (`forge-base:64`) |
| Border widths   | 1 px everywhere. 2 px is reserved for the left accent bars (callouts `kiln:224`, `.fail`, `.boot-screen p`) and the drop hint (`lab:472`)                                               |
| Dashed rules    | `.callout.caveat` (`kiln:228`), `.graph .node.device` (input nodes, `lab:214`), graph edges `.dash`/`.dot` (`lab:224-225`)                                                                |

Motion: one keyframe, `@keyframes bl { 50% { opacity: 0; } }` (`forge-base:63`), a 0.8 s `steps(2)` hard blink. It is used on the busy pill (`forge-base:62`), waiting pips (`lab:263`), "thinking…" (`lab:337`) and running or ask tool cards (`lab:348,350`). Other transitions: only `.drop-hint` position tweens over 0.08 s (`lab:472`).

### 1.6 The aesthetic, grounded in the CSS

Kiln describes itself as **Swiss**: "white ground, #1a1a1a ink, Arial in two weights, 1 px rules, no tinted panels. Red marks errors, selection, and the lambda arrow in code." (`UI/forge-base.css:2-3`). In practice:

- **Paper and ink, no planes.** Every pane is `--bg`. There is no card elevation, no tinted sidebar and no background pattern; the default and perf screenshots are uniformly white. Panels are separated by 1 px `--hair` rules, and sections inside a column by `.block { border-bottom: 1px solid var(--hair) }` (`forge-base:87`).
- **Ruled tables as the main data display.** `.rt` has a `--hair` header underline, `--rule` row lines, left-aligned text and right-aligned last column and `.num` cells, with tabular numerals (`forge-base:198-203`, `lab:167-174`). Selection is a red underline plus a red left bar on the row (`lab:170-171`).
- **Inversion for state.** Primary and chosen controls are solid ink with white text: the Save button, the active segment, the current IR chip and the Measure button in the Perf toolbar.
- **Square glyph controls.** Toggles draw a 9 px square that fills when on (`.tog::before`, `forge-base:45-46`). Device dots are 8 px circles: hollow for simulated, filled for live, red-ringed for offline (`kiln:8-11`). Pips are squares that are empty, half-filled, filled or red (`lab:259-265`).
- **Typographic arrows and symbols instead of icons.** ▾ ▸ ◂ ⤢ ⤡ ⋯ × ✓ ✕ ★ ⚑ ↺ ◐ ▦ ⤓ → are all text characters. There is no icon font and no SVG icon set.
- **Mixed case, small type, dense.** Body text is 12 px and meta text 10.5 px, with almost no uppercase. Section headings are 13 px bold, never large.
- **Long-form reading mode in Notes.** A 76ch column, 13.5 px/1.65 Arial, `h2` with a 1 px ink rule above (`kiln:199`), and left-barred callouts ("Try" in red wash, "Exercise" boxed, "Caveat" dashed; `kiln:224-228`). See `kiln-default-light-1600.png`.

Dark mode is a straight inversion with the same structure (`kiln-default-dark-1600.png`). The red brightens to `#ff3b4a`, and the "Try" callout becomes a dark maroon wash.

---

## 2. Layout

### 2.1 App shell (`UI/App.jsx`, `K/src/main.jsx`)

- `main()` renders `<App/>` into `#root`, starts `wb.start()` and, in parallel, waits up to 3 s for `window.claude.use`. That is the host's "sample" capability for the agent (`K/src/main.jsx:10-26`). It also exposes `window.__kiln = { wb, k, P, std }` (`main.jsx:8`).
- `App` (`UI/App.jsx:8-32`) renders `#app`, a full-height flex column (`forge-base:25`):
  - `<Header/>`: `.bar`, 52 px.
  - `<div id="work"><Dock/></div>`. `#work` is overridden to `display: flex` (`lab:430`); the older grid version is dead.
  - `<Toasts/>`: a fixed bottom-centre stack, `aria-live="polite"` (`App.jsx:34-37`, `lab:42-44`). Toasts disappear after 3.4 s (`wb.js:49`).
- Before `wb.ready`, the app shows a boot screen with a left-barred message, "Compiling the first project…" (`App.jsx:24`, `lab:32-33`).
- Global shortcuts (`App.jsx:10-19`): **⌘/Ctrl+\\** maximises or restores the focused tile, **⌘B** compiles, **⌘Enter** measures. Editor-local: Tab inserts two spaces and **⌘S** saves the preset (`UI/Ide.jsx:70-78`). Agent composer: Enter sends, Shift+Enter adds a newline (`UI/Agent.jsx:90`).

### 2.2 Header anatomy (`UI/App.jsx:39-115`)

Left to right, as in every 1600 px screenshot:

1. **Brand**: "Kiln Workbench" in 15 px bold, with an `<i>` subtitle "source → passes → kernels → device" in 10.5 px ink-2 and a hairline right divider (`forge-base:51-52`).
2. **Project button** (`.projbtn`): a grey preset code ("W-18"), the bold 14 px title and a ▾ caret (`forge-base:54-58`). It opens `.menu.presets`, grouped by `GROUP_ORDER` (`wb.js:20`): Basics, GPU optimization, ML compiler, Write programs, Extend the compiler, Other compilers, Mine. Rows show code, title and an `about` line. Below them: "New project with the agent…", "Duplicate into My presets" and "Import from file…" (`App.jsx:69-85`).
3. **Compile** and **Measure ▸** (`.defbtns`). Measure shows progress "Measuring 3/7…". At ≤640 px it shortens to "Run" (`App.jsx:87-90`).
4. **Device pill** (`.devpill`): a status dot and the device label. Clicking it opens the Devices view (`App.jsx:91-94`, `kiln:5-12`).
5. Spacer (`.sp { flex: 1 }`).
6. **Status pills** (`.pill`: 1 px ink border, bold 14 px number, 10.5 px grey label; `forge-base:59-62`), each a button that opens the relevant view:
   - kernels ("2 kernels · 0 ms compile") → Kernels
   - total time ("76.7 µs measured", or "last measure (stale)") → Perf
   - tuning progress (blinking) → Tune
   - error count (red) → Code
   - failing checks (red) → Code or Perf
   (`App.jsx:96-100`)
7. **Save ▾**: primary, ink-filled. Menu: save, save as new, Download .js, Download notes .md, Delete (`App.jsx:101-110`). Downloads use `window.claude.use("downloads")` with a clipboard fallback.
8. **Layout ▦** menu: the four preset layouts, "Show the current tile alone ⌘\\" and a short help note (`App.jsx:117-132`).
9. **Theme ◐** (`App.jsx:112`).

### 2.3 The dock model: `UI/dock.js` (pure tree transforms)

The data model is stated at the top of the file (`dock.js:1-4`): "a tree of tiles. A split lays its children out in a row or a column, with fractional sizes. A tile holds an ordered list of views, one of them active. Each view appears at most once; a view that appears nowhere is closed… Every operation here is pure."

```text
Node  = Tile | Split
Tile  = { t: "tile",  id: "t…", views: ViewId[], active: ViewId | null }
Split = { t: "split", id: "s…", dir: "row" | "col", kids: Node[], sizes: number[] /* sum 1 */ }
```

- View sets: `IDE_VIEWS = notes, code, agent, reference` and `SYS_VIEWS = ir, graph, trace, kernels, perf, knobs, tune, devices, events` (`dock.js:6-8`). The split matters to `reveal()`, which opens a closed view in the tile that already holds its kin.
- Constructors `tile()` and `split()` use random ids (`dock.js:10-12`).
- **Preset layouts** (`dock.js:14-19`):

| id         | Label                       | Shape                                                                                         |
| ---------- | --------------------------- | --------------------------------------------------------------------------------------------- |
| `default`  | Code beside the compiler    | row[0.4 IDE, col[0.56 (ir,graph,trace,kernels), 0.44 (perf,knobs,tune,devices,events)]]       |
| `compiler` | IRs, passes and knobs       | row[0.32 IDE, 0.38 (ir,graph,kernels), col[(trace,events),(knobs,perf,tune,devices)]]         |
| `perf`     | Measure and tune            | row[0.36 IDE, col[0.55 (perf,tune,knobs), 0.45 (kernels,devices,ir,graph,trace,events)]]      |
| `one`      | Everything in one tile      | one tile, all views, `ir` active                                                              |

- **`normalize(root)`** (`dock.js:37-65`) runs on every set and on load. It drops unknown and duplicated views, dead tiles and empty splits. It flattens a split into a parent that runs the same direction (multiplying sizes), collapses one-child splits and renormalises sizes to sum to 1. An empty tree becomes one empty tile. This is what makes persisted layouts forward-compatible.
- Operations, all `clone → mutate → normalize`:
  - `moveToTab(root, view, tileId, index)`: reorder within a tile or move across tiles, then activate (`:79-96`).
  - `moveToSide(root, view, tileId, side)`: put the view in a new tile left, right, top or bottom of a tile. A tile's only view cannot split its own tile (`:99-107`).
  - `splitTile(root, tileId, side)`: insert an empty tile, which shows a picker (`:110-112`).
  - `insertBeside()`: if the parent already runs in that direction, halve the target's share; otherwise wrap the target in a new 50/50 split (`:114-130`).
  - `closeView`, `closeTile`, `activate`, `resize` (`:132-154`).
  - `reveal(root, view, prefTileId)`: activate the view where it is, or open it after the active tab of the tile holding its kin, else in an empty tile, else the focused tile (`:157-167`).
  - `flatViews(root)`: open views in reading order, then closed views, for the phone strip (`:170-173`).

### 2.4 The dock UI: `UI/Dock.jsx`

- **`Dock`** (`:14-26`) renders the tree, or only the maximised tile (`wb.maxTile`), plus a portal `DragLayer`. When `matchMedia("(max-width: 640px)")` matches it renders `PhoneDock` instead (`:12,16-18`).
- **`Split`** (`:44-56`) is a flex row or column of `.dcell`s with `flex: <size> 1 0px`, with a `Gutter` between each pair.
- **`Gutter`** (`:58-95`) is a 1 px `--hair` line with a ±4 px invisible hit area (`lab:437-442`) that turns ink on hover or focus.
  - Pointer drag resizes the two neighbours, clamped to a 140 px minimum. Moves use `setLayout(…, { save: false })` and the final pointerup persists (`:74,80`).
  - Double-click evens the two neighbours (`:85`).
  - It is focusable, `role="separator"` with `aria-orientation` and a label. Arrow keys resize in 2 % steps, 10 % with Shift (`:86-94`).
  - `body.resizing-x|y` sets a global cursor and disables pointer events on canvases and iframes during the drag (`lab:469-471`).
- **`Tile`** (`:100-110`) is a `<section class="tile" aria-label=…>`. Pointer-down records `wb.focusTile`, which is where ⌘\\ and `reveal` aim. The body is a `.tilebody` with `container: tile / inline-size` (`lab:459`), so views respond to **tile** width, not window width. Each view body is a memoised `ViewBody` keyed by view id, so a layout change does not re-render view contents (`:97-98`).
- **`Strip`** (`:112-149`): `.dstrip` (40 px) holds a `role="tablist"` of `DTab`s, then **+** ("Show here": a FloatMenu of the other views, with "· moves it here" when the view is open elsewhere), a spacer, **⤢/⤡** maximise, and **⋯** (Split right, Split down, Show alone, Close tile). Double-clicking empty strip space toggles maximise.
- **`DTab`** (`:151-163`) is a `role="tab"` button with `aria-selected`. Label: 13 px ink-2, bold ink when active, with a 1 px ink underline via inset shadow (`lab:448-451`). An optional badge comes from `VIEWS[v].badge()`: `.count`, a 1 px currentColor box, red when bad (`lab:455-456`). The × close button is invisible until hover or active (`lab:452-454`).
- **Tab drag** (`startDrag`/`hitTest`/`DragLayer`, `:210-295`):
  - It starts after 6 px of movement (`:216`).
  - Over a tab strip it computes an insertion index from tab midpoints and shows a 3 px red **marker** (`.drop-hint.marker`).
  - Over a tile body, the outer 25 % on any side (`EDGE`, `:11`) means "split here", shown as a red-bordered, red-washed half-tile hint labelled "new tile on the left/right/above/below". The centre of another tile means "add as tab".
  - A black `.drag-ghost` label follows the pointer (`lab:472-476`). Escape or pointercancel aborts (`:243-248`), and the click that ends a drag is swallowed (`:235-240`).
- **`Picker`** (`:165-181`): an empty tile shows "An empty tile. Pick a view for it, or drag a tab here." over a grid of view cards (`.pgrid`, 170 px min columns, title, about and "moves it here"; `lab:477-484`).
- **`FloatMenu`** (`:184-207`) is a portal menu positioned from the anchor's rect and flipped above when there is no room, so narrow tiles never clip it. It closes on outside pointerdown or Escape.
- **`PhoneDock`** (`:298-309`): one `.ptabs` strip with **every** view (open views first), showing `wb.phoneView`.

### 2.5 Layout persistence and migration

- `wb.layout` is loaded from `kiln-wb:layout` through `Dock.normalize`, falling back to `defaultLayout()` on error (`wb.js:39`).
- **Migration:** if a saved layout lacks `notes`, Notes is inserted at index 0 of the tile holding `code` (`wb.js:40-41`).
- `setLayout(root, { save })` normalises, clears a stale `maxTile` and writes localStorage unless `save: false` (`wb.js:55`).
- `maxTile`, `focusTile`, `phoneView` and `drag` are **not** persisted (`wb.js:42`).

### 2.6 The view registry (`UI/views.jsx:15-29`)

Each entry is `{ title, about, col?, el(), badge?() }`. `col: true` views stack vertically; the others are "main area + side panel" in a row, which stacks in narrow tiles (`views.jsx:13-14`, `lab:461-466`). `badge()` returns `[content, isBad]`.

| id          | Title     | col | Badge                                                       | Component                          |
| ----------- | --------- | --- | ----------------------------------------------------------- | ---------------------------------- |
| `notes`     | Notes     | yes | none                                                        | `NotesView` (`Notes.jsx`)          |
| `code`      | Code      | yes | number of error diagnostics, red                            | `CodePane` (`Ide.jsx`)             |
| `agent`     | Agent     | yes | "…" while the agent is busy                                 | `AgentPanel` (`Agent.jsx`)         |
| `reference` | Reference | yes | none                                                        | `Reference` (`Ide.jsx`)            |
| `ir`        | IR        | no  | "!" red when the run failed                                 | `IrView` (`Compiler.jsx`)          |
| `graph`     | Graph     | no  | none                                                        | `GraphView`                        |
| `trace`     | Trace     | no  | number of rewrites                                          | `TraceView`                        |
| `kernels`   | Kernels   | yes | number of kernels                                           | `KernelsView` (`Kernels.jsx`)      |
| `perf`      | Perf      | no  | number of failed kernels, red                               | `PerfView` (`Perf.jsx`)            |
| `knobs`     | Knobs     | no  | number of forks (decisions)                                 | `KnobsView` (`Knobs.jsx`)          |
| `tune`      | Tune      | no  | programs measured so far while tuning                       | `TuneView` (`Perf.jsx`)            |
| `devices`   | Devices   | no  | none                                                        | `DevicesView` (`Perf.jsx`)         |
| `events`    | Events    | no  | none                                                        | `EventsView` (`Events.jsx`)        |

### 2.7 A view's internal frame

The recurring skeleton, which a new app should copy:

```text
.page (row)                                   forge-base:226
├── .stagewrap  (container: stage)            forge-base:159
│   ├── .toolbar   min-height 46, wraps       forge-base:160  (Seg / Tog / select / Btn, .sp spacer, .lbl meta on the right)
│   ├── [.stepbanner | .errbar]               kiln:45-46      (red-ruled context strips)
│   └── .scroll    overflow-y: auto           forge-base:86   (tables, IR text, charts)
└── aside.side  288px, border-left hair       forge-base:191
    └── .block × n  (header h2 + .sub, then Kv / tables / notes)   forge-base:87-92
```

In a tile narrower than 640 px, the side column moves below the main area (`@container tile (max-width: 640px)`; `lab:462-466`, `kiln:173-177`). The graph screenshot shows this: "Ops at this level" sits under the DAG.

### 2.8 The IDE: Code and Reference (`UI/Ide.jsx`, `UI/highlight.js`)

- **Editor technology:** there is **no CodeMirror or Monaco**. `Editor` (`Ide.jsx:50-89`) stacks three layers:
  - a line-number `.gutter` (`forge-base:97-99`)
  - a `<pre aria-hidden>` with one `<div>` per highlighted line
  - a full-size `<textarea>` with `color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--accent)` (`forge-base:100-104`)

  Scroll sync translates the `<pre>` and the gutter by the textarea's scroll offset (`Ide.jsx:65-69`). Lines with error diagnostics get a red wash (`.ln-err`) and a bold red gutter number; warnings get a bold ink number (`Ide.jsx:54-55,82-84`, `lab:62`). `wb.gotoLine` selects a line and scrolls to it (`Ide.jsx:56-64`), and diagnostics, `lab:line?n=` links and the agent use it.
- **Highlighting** (`UI/highlight.js`): two small hand-written tokenizers.
  - `highlightLines()` handles JS: bold keywords, grey strings including multi-line template literals, italic light comments, red `=>`, and bold "builder" names such as `project(`, `pass(` and `fork(` (`:3-48`).
  - `highlightC()` handles CUDA/WGSL: bold qualifiers and types, red builtins such as `threadIdx` and `@compute` (`:51-69`).

  Output is HTML strings injected with `dangerouslySetInnerHTML`; the tokenizers escape text first (`:5`).
- **CodePane** (`Ide.jsx:8-48`), top to bottom:
  - the editor
  - a `.diags` list of up to 6 diagnostics with a red top rule (`lab:56-61`); clicking one jumps to its line
  - **Parameters** (`.params`, an ink top rule, a sticky header "Parameters · changes recompile"), grouped into program, pipeline and knobs `ParamControl`s
  - **Checks**: a collapsible end-to-end check against the reference ("reference ✓/✕", per-check `.srow`s with red left bars on failure, sampled output values)
  - an `.ed-foot` status line: "28 lines · 50 rewrites · 2 forks · 2 kernels … saved/edited/N errors"

  See `kiln-perf-light-1600.png`, left column.
- **Reference** (`Ide.jsx:134-150`): `REFERENCE` (the kiln API text) split at `## ` into `h3` sections, plus the agent's `GUIDELINES`, in `.ref` (11.5 px code font, pre-wrap; `forge-base:153-154`). See `kiln-knobs-light-1600.png`, left.

### 2.9 How views are switched

All navigation goes through `wb.showView(v)` (`wb.js:57`). It calls `Dock.reveal`, un-maximises if the view lands in another tile, records `phoneView` and persists. It is called from:

- dock tabs (`activateTab`), the **+** menu and the empty-tile picker (`dropView`)
- header pills (`App.jsx:96-100`) and the device pill (`App.jsx:91`)
- cross-view links: pass chip → Trace (`Compiler.jsx:87`), node "Open in Kernels" (`:169`), fork row → Knobs (`:175`), history step → Trace (`:186`), event row → Trace (`Events.jsx:51`), "Graph here" (`Compiler.jsx:332-333`)
- **`lab:` links** in Notes and agent answers (`UI/links.js`; see §3.1)
- the agent, through its eval scope

---

## 3. Screens and panels

Each entry covers what the panel shows, which `wb` state it reads (with its `useLab` channels) and what its interactions call.

### 3.1 Notes: the tutorial beside the code (`UI/Notes.jsx`, `UI/doc.js`, `UI/links.js`)

**Shows.** The current preset's Markdown notes (`wb.notes`), rendered by `renderDoc()` into `article.doc`. A table of contents of `h2`s appears when there are more than two (`Notes.jsx:44`). The toolbar holds the preset code and title, a Read/Edit `Seg` and "Ask the agent to write them" or "Ask about this" (`Notes.jsx:27-32`). Edit mode is a plain full-height code-font textarea with an `.ed-foot` ("N lines of Markdown · saved/edited · download .md"; `Notes.jsx:33-37`). Channels: `notes`, `preset`, `platform`.

**`renderDoc()` dialect** (`UI/doc.js:31-111`), a hand-written Markdown subset:

- Headings `#`-`####` with slug ids. `h2`s feed the TOC.
- Paragraphs, and nested ordered or unordered lists with indented continuation lines (`:36-50`).
- Tables with `:--`/`--:` alignment, rendered as `table.rt.doc-t` inside `.tablewrap-x`, so they use the same ruled-table look as data views (`:93-103`).
- Blockquotes become **call-outs**. The first bold word picks the class, matched by `CALLOUT = **(Try|Try it|Note|Why|Exercise|Check|Watch|Math|System|Caveat|Takeaway)…**` (`:29,86-92`). Styled call-outs (`kiln:224-228`): default (ink left bar, fill ground), `.try` (red bar, red wash), `.exercise` (boxed), `.caveat` (dashed bar).
- Code fences: `math`/`tex` are display math; `cuda|c|cpp|wgsl|cu` use `highlightC`; `text|txt|ir|plain` are unhighlighted; anything else uses the JS highlighter (`:53-65`).
- Math: `$…$` inline and `$$…$$` display, converted to MathML by KaTeX (`:9-26,66-76`).
- Links are allowed only to `https:` (opened with `target=_blank rel=noopener`), `lab:` (class `lablink`) and `#anchor` (`:23`). Bold is `**`, italic is `*` or `_`.

**`lab:` links drive the workbench.** `Notes.jsx:16-22` intercepts clicks on `a[href^="lab:"]` and calls `followLabLink(href)`. The agent panel does the same for agent answers (`Agent.jsx:59-64`). Visually a lab link has a **red** 1.5 px underline and a red "▸" after it (`kiln:211-212`, `lab:334`), which is what makes "measure now ▸" in the screenshot read as an action. The grammar is `lab:<verb>?<query>` (`links.js:11-13`):

| Verb          | Example                                     | Effect (`links.js` line)                                                                  |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `param`       | `lab:param?name=degree&value=64[&measure]`  | `wb.setParam(p, value)`, a toast, optionally measure (`:26-33`)                           |
| `pin`         | `lab:pin?TPB=128&STAGE=all[&measure]`       | `wb.pin({...})` on pipeline knobs, optionally measure (`:34-39`)                          |
| `unpin`       | `lab:unpin?name=TPB` or `lab:unpin`         | Unpin one, or every non-program pin plus kernel pins; recompile (`:40-47`)                |
| `measure`     | `lab:measure`, `lab:measure?all=sim`        | Measure on the current device, or every simulated GPU; show Perf (`:48-51`)               |
| `tune`        | `lab:tune?strategy=sweep&budget=16`         | Show Tune and run `wb.tune` (`:52`)                                                       |
| `compile`     | `lab:compile`                               | `wb.compile()` (`:25`)                                                                    |
| `device`      | `lab:device?id=sim:h100[&measure]`          | `wb.setDevice`, optionally measure (`:24`)                                                |
| `preset`      | `lab:preset?id=W-21`                        | `wb.load(id)` (`:22`)                                                                     |
| `view`/`tab`  | `lab:view?name=perf`                        | `wb.showView` (`:21`)                                                                     |
| `ir`, `graph` | `lab:ir?name=loop`                          | Select an IR level and show IR or Graph (`:16-17`)                                        |
| `node`        | `lab:node?id=n12&ir=loop[&view=graph]`      | Select a node (and IR) and show it (`:15`)                                                |
| `step`        | `lab:step?i=4`                              | Select a trace step, show Trace (`:18`)                                                   |
| `kernel`      | `lab:kernel?name=k_x`                       | Select a kernel, show Kernels (`:19`)                                                     |
| `fork`        | `lab:fork?i=0`                              | Select a decision, show Knobs (`:20`)                                                     |
| `line`        | `lab:line?n=12`                             | Show Code and go to the line (`:23`)                                                      |

Why it matters for the unified app: a lab link is a **declarative, URL-shaped command** over the store. Perf Lab's board narratives could reuse exactly this mechanism, for example `lab:capture?…` or `lab:board?id=B-01`.

### 3.2 IR (`UI/Compiler.jsx:112-195`)

**Shows.**

- The **pipeline map** (`PipeMap`, `:67-95`): `.irchip` buttons for each IR checkpoint (name and node count; the active one is ink-filled, unreached ones dimmed, the failure point red), interleaved with `.passchip` labels ("→ d 16": a pass's short letter and its rewrite count). This is the strip "torch 26 → d 16 tensor 35 → o 17 …" in the screenshots.
- `Tog`s for **Bodies** and **Types**.
- An optional `StepBanner` ("After step 26: loop/fusion/merge_loop_ops at n53", with ◂ ▸ and "Back to the IRs"), and an `.errbar` when the run failed.
- `IrText` (`:37-65`): the printed graph in 11.5 px code font. Every `nN` id is a `.nid` underline button; comment lines are light, and `inputs:`/`outputs:` headers bold. Nodes touched by the selected step get a fill and a red left bar (`.hl`).
- Side panel `NodeSide` (`:139-195`): with nothing selected, "Ops at this level" (op counts as a `Kv`). With a node selected:
  - its type, attributes, knobs, identity and output names
  - "uses" and "used by" as clickable `.nid`s
  - "Open … in Kernels"
  - **Forks here** (`linkrow`s to Knobs)
  - **History**: the last 14 trace steps that made, changed or removed the node, linking to Trace

**Reads.** `wb.run` (checkpoints, steps, decisions, passStats), `wb.pipe.steps`, `wb.sel.{ir,step,node}`, `wb.prog`. Channels: `compile`, `sel`, `measure`. **Writes.** `wb.select({ir, step, node, tracePass, decision, kernel})` and `wb.showView`.

### 3.3 Graph (`UI/Compiler.jsx:197-286`)

**Shows.** The selected IR, or the graph after the selected step, as a hand-laid-out **SVG DAG**.

- Layout (`:199-222`): longest-path depth columns. Leaf constants and weights are pulled next to their first user, and nodes in each column are ordered by the barycentre of their arguments' y positions. Node boxes are 158 × 42 px, with column gap 54, row gap 14 and padding 16.
- Edges are cubic Béziers with an arrow marker (`:256-264`).
- Node styles (`lab:208-237`):
  - inputs: a **dashed** box with fill (`.device`)
  - kernels: filled (`.group`)
  - leaves: grey stroke (`.cell`)
  - the selected node: a 2 px red stroke
  - nodes touched by the step: a 2 px stroke (`.busy`)
  - nodes not adjacent to the selection: dimmed
  - outputs: a small corner tick (`:273`)
- Zoom `Seg`: 50 %, 75 %, 100 %, Fit (`:250`). More than 500 nodes are truncated with an `.errbar` note (`:241-253`).

**Interactions.** Clicking a node calls `selectNode(id)`; the side panel is `NodeSide`. See `kiln-graph-light-1600.png` (W-10 attention: inputs q/kk/v → `k_matmul_reduce` → `k_matmul_ew_softmax_r…`).

### 3.4 Trace (`UI/Compiler.jsx:288-358`)

**Shows.** Each pass step as a row (`.trow`, `kiln:65-75`). A row shows `#i` (tabular, right-aligned 40 px), the pass's short letter, the bold rule name, `@node` in code font, an optional fork `.tag` ("fork 645 · BM=… · model") and a delta "+1 −1 ~1" on the right.

- Declined matches ("skip") are hidden unless the **Declined** toggle is on; when shown they are grey and carry their reason on a second line.
- Clicking a row expands a **unified diff** (`Diff`, `:355-358`) of the before and after IR. Added lines are bold on `--fill`; deleted lines are red with a strikethrough (`lab:285-290`). See `kiln-trace-light-1600.png`.
- Toolbar: a pass filter `Seg` (All plus each pass's short letter), Declined `Tog`, a filter input and "50 of 63 steps · 42 ms" (`:305-311`).
- Side panel: the step's `Kv` (pass, rule, at, time, fork, picked), with "Graph text here", "Graph here" and "Clear". Then the **Passes** table (pass, rewrites, declined, forks, ms; clicking a row filters) and a Warnings block.

**Reads.** `wb.run.steps`, `run.passStats`, `wb.pipe.passes`, `wb.sel.{step,tracePass}`. The selected row scrolls into view (`:295`).

### 3.5 Kernels (`UI/Kernels.jsx`)

**Shows.**

- A top table (`.ktable`, at most 38 % of the height): kernel, schedule row, grid × block, smem, model µs, measured µs on the current device, check ✓/✕ (`:39-54`).
- A `Tabs` strip: **CUDA**, **WGSL**, **Kernel IR**, **Tile**, **Loop IR**, **Launch**, with Copy and Download on the right (`:55-56`).
- The body: CUDA and WGSL are `highlightC` source; the IR tabs use `IrText` with `g.printNode(kern.id)`; Launch is a `Kv` (grid, block, smem, inputs, output, unique bytes, registers, occupancy, time, bound) plus a note on how inputs are seeded (`:57-71`).
- Empty states explain *why* there are no kernels (`:22-26`).

**Reads.** `wb.prog.kernels` (`name`, `row`, `K.{grid,block,smemBytes}`, `cuda`, `wgsl`, `inShapes`, `shape`, `bytes`), `wb.measures[deviceId]`, `wb.run.decisions`, `wb.sel.kernel`. **Writes.** `wb.select({kernel, node})`. `saveText` and `copyText` (`:8-16`) are the shared download and copy helpers: they use `window.claude.use("downloads")`, then fall back to the clipboard, with toasts.

### 3.6 Perf: timing, metrics, roofline (`UI/Perf.jsx:21-160`)

**Shows** (see `kiln-perf-light-1600.png`):

- Toolbar: a device `<select>` grouped Simulated/Real, the primary **Measure** button, "Every simulated GPU" and the measurement time on the right ("· the program changed since" when stale).
- `.perfhead`: a **big number** (`.bignum b`: 30 px bold tabular, e.g. "76.7 µs") with "2 kernels on RTX 5090 · simulated", and a `Spark` of this project's last N totals on this device (`:50-53`).
- The **kernel table** (`table.rt.perft`): kernel, time, share (a `Meter` bar), bound, occupancy, GB/s, GFLOP/s, sectors per request (red when > 8), bank (red when > 0.5), divergence and check (`:54-70`). Clicking selects a kernel.
- **Roofline** (`:127-160`): a hand-drawn log-log SVG, 520 × 220 viewBox.
  - X axis is flop per DRAM byte, 1/32…512; Y axis is GFLOP/s (P = flops/µs/1e3).
  - The roof is a polyline (bandwidth slope to the ridge, then a compute plateau) labelled "compute roof". The header gives "RTX 5090: 104.8 TFLOP/s fp32, 1792 GB/s; ridge at 58.5 flop/B".
  - Kernels are hollow ink circles with labels; the **selected kernel is a solid red dot with a red bold label**.
  - CSS classes: `.roof .gl` gridlines (`--rule`), `.ax` axis text 9.5 px ink-2, `.rl` roof 1.5 px ink, `.rp` points (`kiln:113-123`).
- **Across devices**: a table of this project's last total on each device, with a `Meter` relative to the fastest (`:72-80`).
- Side panel `KernelMetrics` (`:92-125`): the kernel name and schedule row, a check sentence ("✓ 512 sampled outputs match the reference"), and a long `Kv` (time, fastest run, timing kind, bound by, occupancy with limiter, waves, threads × blocks, smem, registers, DRAM bytes, L2 traffic, flops, intensity, achieved GB/s, sectors per request (marked "(uncoalesced)" when > 4.5), smem wavefronts, barriers, sampled blocks, and any raw `ncu_*` metrics). Then **"Where the time goes · model lower bounds"**: `.partrow` meters per component, with the bounding component's bar in **red** (`:116-122`).

**Reads.** `wb.measures[deviceId]` (`{t, device, deviceName, total, kernels: [{name, identity, row, us, metrics, check, error}], imported?}`), `wb.history`, `wb.summary()`, device targets (`peakTflops`, `bwGBs`). Channels: `measure`, `compile`, `device`, `sel`. **Writes.** `wb.measure()`, `wb.setDevice()`, `wb.select({kernel})`.

### 3.7 Tune and Devices (`UI/Perf.jsx:162-316`)

- **Tune** (`:163-229`):
  - Toolbar: a strategy `Seg` (SP-MCTS, Sweep top 6, Sweep all, each with a tooltip), a budget select (8…256 programs), **Tune on <device>** or a red **Stop**, and a status line.
  - **Search** chart (`TuneChart`, `:231-251`): one dot per measured program on a log-time Y axis, a best-so-far step line in ink and the best program as a **red** dot. Each dot has an SVG `<title>` tooltip listing its schedule rows.
  - **Best program**: a list of schedule rows.
  - **Evidence**: a table of the evidence store (kernel, schedule, time with ★ on the best, by, check, and an "in use" `.tag` on the row the current compile uses), a "This program" `Tog`, and Export, Import and **Forget <device>** (danger) actions.
  - Reads `wb.tuning`, `wb.store`, `wb.run.decisions`.
  - See `kiln-graph-light-1600.png`, bottom right.
- **Devices** (`:254-316`):
  - A `role="radiogroup"` list of `.devrow`s: a dot, the name, a spec line ("Blackwell · 170 SMs · 1792 GB/s · simulated" style) and the last measured total. The selected row has a red bar and red name (`kiln:130-136`).
  - **A real CUDA GPU** block: four numbered steps (download `kiln_runner.py`, export the bundle with an optional Nsight toggle, a `.cmd` command line with Copy, import `results.json`), a paste box and a note on live mode (`kiln_runner.py serve`).
  - Side panel: the device's `describe()` Kv and "Target the compiler sees" (max threads per block, smem per block, SMs, FP32 peak, bandwidth).

### 3.8 Knobs: forks, options, parameters and phases (`UI/Knobs.jsx`)

**Shows** (see `kiln-trace-light-1600.png` and `kiln-knobs-light-1600.png`):

- Toolbar text: "2 forks · decided by pins, then evidence on RTX 5090 · simulated, then the cost model", plus "Clear N kernel pins" (`:90-94`).
- **Fork table** (`table.rt.knobt`): fork (kernel name, rule and @node), options count, picked row (⚑ if kernel-pinned), **by** as a `.tag` (solid border for `evidence`/`pinned`, dim border for `model`/`ladder` etc.), model µs, measured µs (`:97-114`).
- **ForkDetail** (`:149-189`): an 18 px heading with the kernel name, then "schedule at n49 · 645 options · picked by model". A sort `Seg` (Model, Measured, Order), "Tried first and rejected: …" and the **options table**, showing up to 80 rows. Each row has the option (▸ on the chosen one), model µs (or "infeasible"), a **meter** bar scaled to best-model ÷ this-model, the simulated or measured µs, the check, and row actions `pin` / `pin + measure` as borderless `.tabact` buttons. `pin + measure` pins the row for this kernel identity and then measures (`:156`).
- Side panel (`:119-144`): **Program** params ("re-traces the program"), **Pipeline** params, **This project's knobs**, **Schedule knobs for every kernel** (MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN; `STD_KNOBS`, `:47`) and **Kernel pins** with ✕ to unpin.

**`ParamControl`** (`:9-43`) is the single parameter widget, laid out as a 4-column `.prow` grid: name | control | value | reset (`kiln:78-87`). The control depends on the parameter:

| Parameter                         | Control                                                                                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| knob (fork parameter)             | `<select>` with "auto" plus the values. "auto" calls `wb.unpin`; a value calls `wb.pin` (`:16-23`)                         |
| int/float with min and max        | `<input type=range>` with `accent-color: var(--ink)`; `scale: "log"` maps through log2 (`:24-27`)                          |
| enum                              | a `Seg` when there are ≤ 5 values, else a `<select>` (`:28-29`)                                                            |
| bool                              | a `Tog` labelled on/off (`:30-31`)                                                                                         |
| anything else                     | a text input that commits on blur or Enter (`:32-33`)                                                                      |

The value column shows the number to 5 significant digits, or "pinned" for knobs. A ↺ button returns a pinned parameter to its default (`:40`).

**Phases (build vs run).** A parameter is declared with `.phase("build" | "run")` (`K/src/core/kiln.js:462-463`; the reference line reads `param.bool(...) .phase("build" | "run") .group(g) .help(text)`). The default is `build`. `wb.setParam` recompiles for build-phase parameters, but for **run-phase** parameters it only bumps `params` and does not recompile (`wb.js:190`). The UI marks run parameters with an italic grey "run" after the name (`Knobs.jsx:37`, `.prow .pn i`). Parameter groups come from `paramGroups()` (`:48-57`): the program's own parameters, the pipeline's parameters, the project's own pass knobs and the standard schedule knobs.

**Reads.** `wb.run.decisions` (`{rule, node, key, size, options[{knobs, original}], knobs, by, failed, tried, score}`), `wb.store` evidence, `wb.kernelPins`, `wb.params`, `wb.device.target`. Model estimates come from `analyze`/`estimate` in `std/tile.js`, cached per node, knob set and device (`:59-71`).

### 3.9 Events (`UI/Events.jsx`)

**Shows.** A monospace log (`.evlist`, 11.5 px code font) in a 5-column grid, overridden to 3 columns in Kiln (`kiln:151`): time (right-aligned, tabular), kind and text. Selected rows get the red bar; bad rows have a red kind and text (`lab:500-507`). Narrow tiles drop columns (`lab:508-512`). The toolbar holds:

- a source `Seg`: **Workbench** (`wb.events`: compile, measure, tune, pin and agent entries from `wb.log()`, capped at 600 with the oldest 100 dropped; `wb.js:50`) or **Last compile** (`wb.run.events`)
- for Last compile, a kinds `Seg`: All, Passes, Rewrites, Declined, Forks, Errors (`:7,44`)
- a filter input
- a **Follow** `Tog` that auto-scrolls and switches itself off when the user scrolls up (`:47-49`)

Compile events with a `step` are clickable and jump to Trace (`:51`). `evText()` turns each compile event kind into one sentence (`:8-21`).

### 3.10 Agent (`UI/Agent.jsx`, `UI/md.js`, `K/src/agent/agent.js`)

**Shows** (see `kiln-graph-light-1600.png`, left):

- `.agent-head`: the conversation title, "New chat", and ⤓ to export the conversation as Markdown.
- `.subtabs`: **Agent** and **History**.
- Chat settings (`.agent-set`): a Model `Seg` (Fast/Balanced/Deep), Thinking (Low/Med/High, disabled for Fast) and Run (Auto/Ask/Read-only, each with a tooltip). Settings persist as `kiln-wb:agentSettings` (`agent.js:35,40`).
- When the host provides no `sample` capability: an ink-bordered `.agent-off` box, "Claude is not connected here…" (`Agent.jsx:77-79`).
- With an empty conversation: an explanation and suggestion buttons (`.sugg`, bordered left-aligned text buttons, from the preset's `try` lines plus `SUGGESTIONS`; `agent.js:588-594`).
- Messages: the user's in an ink-bordered box (`forge-base:137`). The agent's are Markdown rendered by `md.js` (a smaller renderer than `doc.js`: no math, no tables, `https:` and `lab:` links only; `UI/md.js:1-45`), interleaved with:
  - **tool cards** (`details.tool`, `lab:344-360`): a summary row with a 7 px status square (ink, blinking while running, red for ask or error), "eval", the first code line highlighted, and ms or "waiting for you". The body holds the code, result (YAML) and logs, Run / Run all / Decline buttons in Ask mode, and "revert to before step N".
  - **parts**: tables (`.ptable`), code snippets, and **proposals** with "Open in editor" and "Open and measure" (`Agent.jsx:207-243`).
- Finished answers fold their steps into "Worked through N steps · 3.2 s" (`details.fold`; `Agent.jsx:130-141`). The footer shows copy, retry… (a menu: same settings, Fast, Balanced, Deep, Read-only), **undo this answer**, and a usage line "Balanced · medium · auto · 4 evals · 12.3 s".
- The composer: a code-bg textarea and a meta line ("Balanced · medium thinking · auto · Enter sends"); Send becomes a red Stop while busy (`Agent.jsx:88-95`).
- **History**: a filterable list of saved conversations with a two-click delete ("delete" → "delete?"). Up to 30 conversations are kept in `kiln-wb:convs`, each trimmed to about 300 KB (`agent.js:44-54`).

**Reads and writes.** The `agent` object (`settings`, `conv`, `busy`), `wb.sample`, `wb.platformReady`, `wb.agentDraft` (other views prefill the composer through it and bump `agentDraft`), and `wb.preset.tries`. Revert restores a **snapshot** of script, preset, mine, notes, params, kernel pins, device and the evidence store, taken before each eval step (`agent.js:286-313`).

---

## 4. State management: `UI/wb.js`

### 4.1 The pattern

- One class instance, `export const wb = new Workbench()` (`wb.js:321`). Fields are **mutated in place**.
- **Channels:** `on(ch, fn)` subscribes and returns an unsubscribe function; `bump(...chs)` increments `ver[ch]` and calls the subscribers; `version(ch)` reads the counter, which is useful as a `useMemo` or `useEffect` dependency (`wb.js:46-48`).
- React binding: `useLab(...chs)` subscribes in an effect and force-renders through `useReducer` (`common.jsx:5-9`). A component lists the channels it depends on, for example `useLab("compile", "sel", "measure")`. `ViewBody` is `React.memo`'d so that layout changes do not re-render view contents (`Dock.jsx:97-98`).
- The comment names the lineage: "React views subscribe to named channels (the Octavo Lab pattern)" (`wb.js:1-2`).

### 4.2 Store shape (`wb.js:23-44`, plus fields set later)

| Group             | Fields                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plumbing          | `ver`, `subs`, `toasts[]`, `events[]`, `ready`, `error`, `platformReady`, `sample` (the host LLM capability), `narrow`                                        |
| Presets           | `builtins` (from `presets.gen.js`), `mine` (persisted), getter `presets`, `preset`, `script`, `savedScript`, `notes`, `savedNotes`                             |
| Compile           | `project`, `graph`, `pipe`, `run` (`ok`, `steps`, `decisions`, `checkpoints`, `irOrder`, `passStats`, `events`, `warnings`, `ms`, `at(ir)`, `stepGraph(i)`), `prog` (kernels), `compileMs`, `diags[]`, `e2e`, `outputs` |
| Parameters        | `params` (a `ParamSet`: `get`, `set`, `pin`, `unpin`, `isPinned`, `pinned()`), `kernelPins` (`{identity: row}`)                                               |
| Devices and data  | `devices[]`, `deviceId` (persisted), getter `device`, `store` (the evidence `Store`, persisted), `measures{deviceId: rec}`, `history[]` (≤ 300), `measuring`, `tuning` |
| Selection         | `sel = { ir, node, step, kernel, decision, src, tracePass }`                                                                                                 |
| UI                | `ui.theme`, `layout`, `maxTile`, `focusTile`, `phoneView`, `drag`, plus ad hoc `gotoLine`, `agentDraft`                                                       |

### 4.3 Channels in use

From `bump(...)` calls and `useLab(...)` subscriptions across `UI/` and `agent/`:

`ready`, `ui`, `preset`, `code`, `notes`, `diags`, `compile`, `sel`, `params`, `device`, `measure`, `tune`, `store`, `events`, `toast`, `layout`, `drag`, `platform`, `agent`, `agentDraft`, `convs`, `gotoLine`. One more, `katex`, is **read** by `Notes.jsx:14` but never bumped.

### 4.4 Actions

| Area      | Methods                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plumbing  | `toast(text, tone)`, `log(kind, text, extra)`, `setUI(patch)`, `select(patch)`                                                                                                                           |
| Layout    | `setLayout`, `showView`, `activateTab`, `dropView`, `closeView`, `splitTile`, `closeTile`, `toggleMax`, `isVisible`, `useLayout`, `noteActive` (`wb.js:55-65`)                                           |
| Lifecycle | `start()`: last preset or W-18, with draft restore (`:71-78`); `load(id, {draft, draftNotes})` (`:79-88`); `setScript` (persists the draft and debounces compile by 350 ms, `:94-100`); `setNotes`         |
| Compile   | `pipelineFor(project, device)` (adds the kernel-pin decide policy, `:103-108`); `tryCompile` (an isolated compile for the agent); `compile({fresh})` (`:125-154`); `checkEndToEnd` (a cached reference check, `:156-185`) |
| Params    | `pin`, `unpin`, `setParam` (run phase does not recompile), `pinKernel(identity, row)` (`:188-191`)                                                                                                       |
| Devices   | `setDevice(id)` (persists, probes real devices, recompiles; `:194-202`)                                                                                                                                  |
| Measure   | `measure({device, quiet})` (`:205-228`); `tune({strategy, budget})`, `stopTune()` (`:230-249`); `bundleJSON`, `importResults` (`:252-265`)                                                               |
| Presets   | `savePreset({asNew})` (allocates `U-NN` ids and rewrites the header comment), `deletePreset`, `newPresetFromText` (`:268-293`)                                                                           |
| Summary   | `summary()` returns `{kernels, total, stale, errors, failing}` and drives the header pills (`:295-301`)                                                                                                  |

### 4.5 localStorage keys (all prefixed `kiln-wb:`; `wb.js:17-19`; reads and writes are wrapped in try/catch)

| Key             | Value                                         | Written by                                                    |
| --------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `layout`        | dock tree JSON                                | `setLayout` (`wb.js:55`)                                      |
| `theme`         | `"auto" \| "light" \| "dark"`                 | `setUI` (`wb.js:51`)                                          |
| `last`          | last preset id                                | `load`, `savePreset` (`wb.js:85,279`)                         |
| `draft`         | `{id, script}` (the unsaved editor buffer)    | `setScript` (`wb.js:96`)                                      |
| `draftNotes`    | `{id, notes}`                                 | `setNotes` (`wb.js:91`)                                       |
| `mine`          | user presets `[{id, title, group, text, notes, …}]` | `savePreset`, `deletePreset`, `newPresetFromText`, agent revert |
| `device`        | selected device id (default `sim:rtx5090`)    | `setDevice` (`wb.js:197`), agent revert                       |
| `evidence`      | the evidence store `{rows}`, debounced 400 ms | `store.on` (`wb.js:33`)                                       |
| `agentSettings` | `{tier, effort, mode}`                        | `agent.js:40`                                                 |
| `convs`         | ≤ 30 conversations                            | `agent.js:52,65`                                              |

---

## 5. Component vocabulary to reuse

### 5.1 React primitives (`UI/common.jsx`)

| Component                                            | Markup and classes                                                    | Notes                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Btn {primary, danger, sm, on, disabled}`            | `button.btn[.primary|.danger|.sm|.on]`                                | Always `type="button"` (`:13-15`)                                              |
| `Seg {items: [value, label, title][], value, label, sm}` | `div.seg[.sm][role=group][aria-label]` > `button[aria-pressed]`   | Segmented control (`:16-25`)                                                   |
| `Tog {on}`                                           | `button.tog[aria-pressed]` with a square `::before`                   | Toggle (`:26-28`)                                                              |
| `Pill {big, small, bad, busy}`                       | `button.pill` > `b` + `span`                                          | Header status (`:29-31`)                                                       |
| `Tabs {items: [v, label, count, bad][], right}`      | `div.ptabs[role=tablist]` > `button[role=tab][aria-selected]` + `.count` | Inner tab strips (Kernels), PhoneDock (`:32-44`)                            |
| `Kv {rows: [k, v, bad][]}`                           | `dl.kv` > `dt`/`dd`                                                   | Two-column key-value list; values bold, right-aligned (`:45-53`)               |
| `Meter {f, bad}`                                     | `div.meter > i[style=width]`                                          | 8 px outlined bar with an ink fill (red when bad) (`:54-56`, `forge-base:269`)  |
| `Code {text, max}`                                   | `pre.src.hl` (highlighted JS)                                         | (`:57-59`)                                                                     |
| `Spark {values, w, h, bad}`                          | `svg.spark` with area, line and end dot                               | (`:60-73`, `lab:245-249`)                                                      |
| `Menu {open, right, className}`                      | `div.menu[role=menu]`                                                 | Closes on outside pointerdown or Escape (`:75-87`)                             |
| `Empty`                                              | `p.empty.padded`                                                      | Empty states always say what to do next                                       |

### 5.2 CSS class vocabulary, grouped

**Buttons and links**

- `.btn` is outlined: 1 px `--hair`, ink on hover, 5×10 padding, 12 px (`forge-base:31-36`). `.primary` and `.on` are inverted ink; `.danger` has red text and border; `.sm` is 3×8 at 10.5 px; disabled is 40 % opacity.
- `.ibtn`: a 32 px square glyph button with a transparent border (`forge-base:37-38`).
- `.tabact`: a borderless text action with a left hairline, used for tab-strip actions and row actions such as "pin" (`lab:39-41`).
- `.link`: a 10.5 px grey underlined text button (`.strong`, `.bad`; `lab:12-15`).
- `.linkrow`: a full-width text row link (`kiln:50-53`). `.linkhd`: a header used as a button (`lab:16-17`).
- `.nid`: an underlined node-id button, red bold when selected (`kiln:22-26`).

**Selectors and inputs**

- `.seg`: one outer hairline box with internal hairline separators; the active button is ink-filled; buttons are 30 px high, 24 px with `.sm` (`forge-base:39-43`, `lab:21-24`).
- `.tog`: a square check glyph (`forge-base:44-47`).
- `.filter` and `.evsearch`: 30 px hairline text inputs that turn ink on focus (`lab:19-20,498`).
- `select`s are hairline-bordered at 24-30 px with radius 0. Range inputs use `accent-color: var(--ink)`, so the native slider turns black.

**Tabs (four variants, one look: grey label, bold ink when active, 1 px ink underline)**

- `.dstrip`/`.dtab` (dock)
- `.ptabs` (inner and phone)
- `.subtabs` (agent)
- `.dtabs` (detail; this is the duplicate name, see 5.4)
- `.count` badges are a 1 px currentColor box, red when `.bad`.

**Status and badges**

- `.pill` (header) and `.devpill`.
- `.dot` (`.sim` hollow, `.live` filled, `.off` red-ringed).
- `.tag`: a 9.5 px hairline-boxed label (`.dim`; `lab:25-26`).
- `.pips`/`.pip` (`.done`, `.run` half, `.wait` blinking red, `.fail` red, `.skip`/`.todo` faint; `lab:259-266`).
- ✓ and ✕ glyphs; `.ok` (ink) and `.bad` (red).
- `.kbdhint` and `kbd`.

**Containers**

- `.toolbar`, `.scroll`, `.side`, `.block > header > h2 + .sub`, `.note` (10.5 px grey), `.empty`.
- `.detail-h` (an 18 px h2 with a sub line).
- `.errbar` and `.warn-row` (red-ruled), `.stepbanner` (red wash).
- `.callout` (doc).
- `.ask`, `.agent-off`, `.prop` (ink-bordered boxes).
- `.menu` with `.grp` group headings, `small` descriptions, `hr`; `.floating`.
- `.toast`, and `.toast.bad`, which uses red ground with white text.
- `.picker` and `.pgrid` cards.

**Data displays**

- `.rt` ruled table, with modifiers:
  - `th`: 10.5 px grey with a hairline under it
  - `td`: a `--rule` line
  - `.num`: right-aligned tabular
  - `.nm`: bold, no wrap
  - `.mcol`: a 64 px meter column
  - `tr.clickable` (hover fill), `tr.sel` (red underline and left bar), `.badrow` (red text), `.dimrow`
  - `.lastmsg`
  - (`forge-base:198-203`, `lab:165-176`)
- `.kv`; `.prow`/`.partrow` (grid rows of label, control or meter, value).
- `.irtext`; `.diff` (`.add`/`.del`); `.src`, `.res`, `.cmd`; `.evlist .ev`; `.trow`.

**Agent and log cards**: `details.tool` (`.run`, `.ask`, `.err`, `.reverted`), `details.fold`, `.msg.user`/`.msg.agent`, `.composer`, `.sugg`, `.hrow`.

**Dock**: `.dock`, `.dsplit.row|col`, `.dcell`, `.gutter.row|col`, `.tile`, `.tilebody`, `.dstrip`, `.drop-hint` (`.marker`), `.drag-ghost`; body classes `dragging-view`, `resizing-x`, `resizing-y`.

### 5.3 How charts are drawn

**Every chart is hand-built SVG in JSX, with no chart library and no d3.** Scales are inline lambdas, and styling comes entirely from CSS classes, so charts follow the tokens and dark mode automatically:

| Chart        | Where                         | Technique                                                                                                                                       |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Roofline     | `Perf.jsx:127-160`            | `viewBox 520×220`, `width=100%`; log10 X and Y lambdas; `<line class=gl>` grid; `<path class=rl>` roof; `<g class=rp>` clickable points       |
| Tuning search| `Perf.jsx:231-251`            | log-time Y; dots `.td` (red `.on` for best); best-so-far `path.rl`; `<title>` tooltips                                                        |
| Sparkline    | `common.jsx:60-73`            | `preserveAspectRatio="none"`, `vector-effect: non-scaling-stroke` line, area at 60 % opacity `--fill-2`, end dot                               |
| Meters       | `common.jsx:54-56`            | HTML: an outlined 8 px box with an absolutely positioned fill `<i>`                                                                           |
| DAG          | `Compiler.jsx:198-285`        | Custom layered layout (depth columns + barycentre); `<rect>` nodes; cubic-Bézier `<path>` edges; `<marker>` arrowhead; zoom via SVG size      |

Chart visual rules, consistent across all of them:

- data marks are ink; axes and labels are ink-2 at 9.5-10 px
- gridlines use `--rule`
- **the selected or best mark is red and bold**
- there is no colour legend, because series are distinguished by label text placed beside the mark
- the font is the UI sans (`.roof { font-family: var(--mono) }`, which is Arial)

### 5.4 Hazards to fix rather than copy

1. **`.gutter` collision.** The dock resize gutter rule (`lab:437-442`: `background: var(--hair); z-index: 3`, and `:hover` → ink) also matches the editor's line-number column (`Ide.jsx:82`, styled in `forge-base:97`). In `kiln-perf-light-1600.png` and `kiln-trace-light-1600.png` the line-number column is painted mid-grey. Line-number contrast drops to 1.74:1, and hovering the numbers would paint the column ink. Namespace the classes (`.dock-gutter` vs `.ed-gutter`).
2. **`.dtabs` defined twice.** Once for detail tabs (`lab:183-185`, which includes `border-bottom: 1px solid var(--hair); padding: 0 12px`) and once for dock tabs (`lab:445`). The dock tab list inherits the first rule's bottom border, which draws a second grey line under the tab labels above the strip's own rule. This is visible in the default screenshot and confirmed in the zoomed crop `/Volumes/SSD/tmp/kiln-001-04-scratch/crop-strip-x3.png`.
3. Other duplicate selectors with different meanings: `.prow` (`forge-base:117` vs `kiln:78`), `.clock` (`forge-base:274` vs `lab:35`), `.steps` (`lab:74` vs `kiln:137`), and `.dim`/`.bad`/`.empty` defined several times.
4. **Dead CSS.** By a heuristic (a class name never appears in Kiln's JSX/JS), about 33 of 125 classes in forge-base and about 86 of 269 in lab are unused. Most are Octavo device-simulator widgets: `.dpad`, `.abxy`, `.octavo`, `.pocket`, `.board`, `.hk`, `.led`, `.lanes`, `.serialmini`, `.machine-stage`, `#stage`, `#title`, `#parts`, `#banner`, `.dial`, `.pad`, `.keyb`, `.navx`, `.heat`, `.mirror`, `.pips`, `.ledger`, `.osagents`, `.legend`, `.timeline`. kiln.css is fully used. Unused tokens: `--good`, `--grid-major`, `--shell-2`, `--code-ink`; effectively unused: `--stage`, `--panel`, `--grid`, `--warn`.
5. **`--mono` means sans.** Any merge with Perf Lab, where `--mono` is IBM Plex Mono, would silently swap fonts. Rename it.
6. **The Notes TOC links have the class `anchor`, but Notes intercepts `#` links itself** (`Notes.jsx:21`); there is no CSS for `.anchor`. Harmless.

---

## 6. Comparison with Perf Lab and a unified token recommendation

### 6.1 Perf Lab's look (`PL/src/styles/tokens.css`, `base.css`, `WorkbenchLayout.css`, `BoardSheet.css`)

The `tokens.css` header says it is "adapted from Lattice Deck… Colour is a signal: chrome stays neutral; sig/warn/bad/ok carry meaning and always pair with a word or glyph" (`tokens.css:1-2`). See `perflab-default-light-1600.png`.

| Aspect      | Perf Lab                                                                                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grounds     | Two planes: `--paper #fafaf8` (the drafting table) and `--sheet #fff` (boards, panels, rails) (`tokens.css:4-5`)                                                                                               |
| Ink         | `--ink #111417`, `--muted #5d646a`, `--faint #a9aeb2`, `--hair #b7bcc0`, `--hair-soft #e3e6e8` (cool, slightly blue greys)                                                                                     |
| Signal      | Blue `--sig #1f4fd1` (focus outline `base.css:31`, links, selection `::selection`, selected board card) with `--sig-l`/`--sig-w` tints; `--accent #2e57c4` for stencil labels and numbering                    |
| Semantic    | `--warn #b87100`, `--bad #d23b1e`, `--ok #2e7d57`, each with a `-w` wash (`tokens.css:17-22`)                                                                                                                  |
| Data        | Six categorical series `--d1…--d6`, plus `--d-candidate` (= d1) and `--d-baseline #9a8a70` (`tokens.css:27-34`); stipple tint                                                                                  |
| Patterns    | `--dither`, `--dither-l` (radial dot screens), `--hatch`, `--hatch-warn`, `--hatch-bad` (45° line hatches) (`tokens.css:45-49`)                                                                                |
| Type        | Body Arial 13 px (`base.css:13`); **display Archivo Variable at 800 weight, stretched 88 %** (sheet h1 30 px; `BoardSheet.css:51-56`); **mono IBM Plex Mono** for code, numbers (`.num`) and labels. All bundled with `@fontsource` (`PL/src/main.tsx:1-4`) |
| Labels      | `.stencil`: 600 10 px mono, **uppercase, 0.12em letter-spacing** (`base.css:77-81`). Tabs, rails and breadcrumbs are all stencilled ("LAB · GRAPH · PLAN…", "BUILD")                                           |
| Frames      | The centre is a **drafting grid** (24 px minor and 96 px major lines; `WorkbenchLayout.css:45-58`). The board is a `.sheet` with an ink border, **registration marks** at the corners (`BoardSheet.css:30-50`) and an engineering **title block** (`:81-102`) |
| Elevation   | A `--shadow` token exists; off-canvas panes use flat offset shadows (`box-shadow: 6px 0 0 var(--shadow)`; `WorkbenchLayout.css:133`)                                                                           |
| Layout      | A fixed CSS grid: top, ide, center, insp, strip, with collapsible rails and vertical labels (`WorkbenchLayout.css:1-121`). No user-arranged tiles                                                              |
| Charts      | d3-scale and d3-shape (`ChartView.tsx`, `TimelineView.tsx`)                                                                                                                                                    |
| Math        | MathJax 4 with the newcm font (`package.json`)                                                                                                                                                                 |
| Editor      | **The same technique as Kiln**: a textarea over a highlighted mirror, with gutter and error line (`CodeEditor.tsx:5`); coloured tokens `--hl-*` (purple keywords, green strings, amber numbers)               |
| Provenance  | Five classes with glyphs: observed ●, derived ◐, heuristic ◌, illustrative ◇, unknown ▨ (`PL/src/lib/format.ts:66-72`, `values.ts:1`). `.prov` is 10 px mono; observed in ink, unknown faint (`ProvenanceGlyph.css`). `ValueCell` shows the glyph only when not observed, gives derived values a dotted underline, illustrative values a dashed outline, and missing values a **hatch** with a reason (`ValueCell.css:17-29`) |
| Stamps      | `.panel__stamp`: 9 px mono uppercase, 0.14em, 1 px **dashed** muted border (`Panel.css:23-29`). The sheet title block's last cell states the data origin: "ILLUSTRATIVE DATA", "SYNTHETIC DATA", "MEASURED ON <HOST>" or "NO RUNS IMPORTED" (`BoardSheet.tsx:21-29`) |
| Staleness   | `.sheet.is-stale`: a 2 px **dashed warn outline**; `.panel.is-stale`: a dashed warn border; a warn-barred banner (`BoardSheet.css:26-29,62-67`, `Panel.css:6-9`)                                              |

### 6.2 The differences that matter

| Dimension         | Kiln                                              | Perf Lab                                                          | Keep for the unified app                                                       |
| ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Ground            | One plane, pure white or `#1a1a1a`                | Paper plus sheet, grid paper in the centre                        | **Kiln**: one plane, no grid                                                   |
| Neutrals          | Pure greys (`#1a1a1a`, `#737373`, `#d6d6d6`)      | Cool blue-greys                                                   | **Kiln**                                                                       |
| Signal hue        | Red only                                          | Blue signal plus warn, bad and ok, plus six data hues             | **Kiln red**; semantic states by glyph, shape and dash                         |
| Display font      | Arial 700                                         | Archivo 800, condensed                                            | **Kiln** (no web fonts)                                                        |
| Mono              | System `ui-monospace`                             | IBM Plex Mono (bundled)                                           | **Kiln** system stack (optionally add Plex as the first fallback)              |
| Labels            | Mixed case, no tracking                           | Uppercase stencil with tracking                                   | **Kiln** mixed case; reserve uppercase for `h4`-style micro headings           |
| Corners           | 0                                                 | 0 (also square)                                                   | Same                                                                           |
| Shadows           | None                                              | Flat offset shadows for overlays                                  | **Kiln**: 1 px ink border for floating layers                                  |
| Frames            | Rules between panes; blocks                       | Sheet with crop marks and title block                             | **Kiln** blocks; map the title block to a `Kv`/`#title`-style cell grid         |
| Layout            | User-arranged dock, persisted                     | Fixed grid with rails                                             | **Kiln dock**; Perf Lab's panes become dock views                              |
| Charts            | Hand SVG, monochrome, red selection               | d3, multi-hue series                                              | Kiln's styling; d3-scale is fine for maths                                     |
| Code colours      | Monochrome, bold keywords, red `=>`/builtins      | Coloured `--hl-*`                                                 | **Kiln**                                                                       |
| Math              | KaTeX → MathML (no fonts)                         | MathJax 4 with a bundled font                                     | Either; KaTeX/MathML is lighter                                                |
| Focus ring        | 2 px ink                                          | 2 px blue                                                         | **Kiln** ink                                                                   |

### 6.3 Proposed unified token set (Kiln look; new tokens marked ★)

Values are light / dark. Kiln's existing values are kept wherever they exist. Aliases let Perf Lab components compile unchanged during migration.

**Colour: neutrals and signal**

| Token          | Light                  | Dark                    | Source and notes                                                                                     |
| -------------- | ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `--bg`         | `#ffffff`              | `#1a1a1a`               | Kiln. Alias Perf Lab `--sheet` and `--paper` → `var(--bg)`                                           |
| `--fill`       | `#f6f6f6`              | `#222222`               | Kiln. Hover rows, inline code, callouts, diff add                                                    |
| `--fill-2`     | `#e6e6e6`              | `#3a3a3a`               | Kiln. Areas, the half of a split glyph                                                               |
| `--ink`        | `#1a1a1a`              | `#f2f2f2`               | Kiln. Alias `--on-ink` → `var(--bg)`                                                                 |
| `--ink-2`      | `#737373`              | `#9a9a9a`               | Kiln (4.74:1 and 6.19:1). Alias Perf Lab `--muted`                                                   |
| ★ `--ink-3`    | `#a3a3a3`              | `#6e6e6e`               | Kiln's `--tok-com` value promoted to a named **non-text** grey (dividers in glyphs, disabled marks). Alias `--faint`. Not for text (2.52:1) |
| `--hair`       | `#d6d6d6`              | `#3d3d3d`               | Kiln. Dividers and control outlines (decorative; see 7.1)                                            |
| ★ `--hair-strong` | `#949494`           | `#707070`               | New, for **input** borders needing 3:1 (3.03 and 3.51). Optional; it darkens the look slightly       |
| `--rule`       | `#ededed`              | `#2a2a2a`               | Kiln. Table row lines. Alias `--hair-soft`                                                           |
| `--code-bg`    | `#fbfbfb`              | `#1d1d1d`               | Kiln                                                                                                 |
| `--accent`     | `#e2001a`              | `#ff3b4a`               | Kiln, the only hue. Alias Perf Lab `--bad` → `var(--accent)`                                         |
| `--sel`        | `rgba(226,0,26,.10)`   | `rgba(255,59,74,.16)`   | Kiln. Alias `--bad-w`                                                                                |
| ★ `--ok`       | `var(--ink)`           | `var(--ink)`            | Success is ink plus ✓ (Kiln's practice). Alias `--ok-w` → `var(--fill)`                              |
| ★ `--sig`      | `var(--ink)`           | `var(--ink)`            | Perf Lab's blue "signal" becomes ink (focus, links). Selection uses `--accent`                        |
| ★ `--caution`  | `#8a5a00`              | `#e0a23a`               | **Optional.** Only if "stale" must be visible at a glance beyond dashes plus a word (5.93 and 7.79:1). Alias `--warn` |
| ★ `--caution-w`| `#f7f1e6`              | `#2b2416`               | Optional wash for a stale banner                                                                     |

**Code tokens** (Kiln's monochrome scheme, with the comment colour fixed for AA)

| Token                     | Light      | Dark       | Notes                                                                                     |
| ------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------- |
| `--tok-key`, `--tok-num`  | `var(--ink)` | `var(--ink)` | Keywords bold                                                                          |
| `--tok-str`               | `#6b6b6b`  | `#a6a6a6`  | Kiln                                                                                      |
| `--tok-expr`              | `var(--accent)` | `var(--accent)` | `=>` and GPU builtins                                                            |
| ★ `--tok-com`             | `#737373`  | `#8c8c8c`  | Darkened from `#a3a3a3`/`#6e6e6e` (now 4.58 on code-bg, 5.01 dark); keep italic           |
| `--tok-punc`              | `var(--ink-3)` | `var(--ink-3)` | Decorative                                                                          |
| Perf Lab `--hl-c/s/n/f/k` | aliases → `--tok-com/str/num/key/key` |  | Perf Lab's highlighter keeps working in Kiln colours                          |

**Data series** (replace `--d1…--d6`; Kiln charts are monochrome)

| Token                            | Value                                 | Use                                                                                         |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| ★ `--series-1` / `--d-candidate` | `var(--ink)`                          | Candidate, current or primary: solid line, **filled** markers                              |
| ★ `--series-2` / `--d-baseline`  | `var(--ink-2)`                        | Baseline or reference: `stroke-dasharray: 4 3`, **hollow** markers (like `.dot.sim`)        |
| ★ `--series-3…6`                 | `var(--ink-2)`, with dash `1 3` and marker shapes ■ ▲ ◆ | More than two series: distinguish by dash pattern and marker shape, and label at line ends (Kiln never uses legends) |
| ★ `--series-hi`                  | `var(--accent)`                       | The selected, best or flagged mark only                                                     |
| ★ `--dash-2`, `--dash-3`         | `4 3`, `1 3`                          | From Kiln's graph edges `.dash`/`.dot` (`lab:224-225`)                                       |
| ★ `--hatch`                      | `repeating-linear-gradient(45deg, var(--hair) 0 1px, transparent 1px 4px)` | Missing or unknown values. Kiln-weight version of Perf Lab's hatch |

If a categorical palette is ever unavoidable (six or more series that must be told apart at a glance), confine it to the chart's marks. Never use it for chrome, and keep red reserved.

**Typography**

| Token              | Value                                                                  | Notes                                                                                     |
| ------------------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| ★ `--sans`         | `Arial, "Helvetica Neue", Helvetica, sans-serif`                       | Replaces Kiln's misnamed `--mono`. Alias Perf Lab `--body`                                 |
| `--display`        | `var(--sans)`                                                          | Bold 700 only; **no Archivo**                                                             |
| `--code`           | `ui-monospace, Menlo, Consolas, "Courier New", monospace`              | Alias Perf Lab `--mono` → `var(--code)` (Perf Lab's `--mono` is real mono, so this alias is correct) |
| ★ `--fs-2xs`       | `9.5px`                                                                | Tags, stamps, axis text (9.5 px is used 6× as a literal today)                             |
| `--fs-xs`          | `10.5px`                                                               | Meta (Kiln)                                                                               |
| `--fs-s`           | `12px`                                                                 | Body and controls (Kiln)                                                                  |
| `--fs-m`           | `13px`                                                                 | Tabs, block `h2` (Kiln)                                                                   |
| `--fs-l`           | `18px`                                                                 | Detail and board titles (Kiln)                                                            |
| `--fs-xl`          | `30px`                                                                 | Big numbers. Also Perf Lab's board `h1` (30 px), in Arial 700                             |
| ★ `--fs-code`      | `11.5px`                                                               | IR, events and code blocks                                                                |
| ★ `--lh`, `--lh-code`, `--lh-doc` | `1.45`, `1.6`, `1.65`                                   | Kiln values. The editor keeps a fixed 12 px/18 px                                         |
| ★ `--fw-regular`, `--fw-bold` | `400`, `700`                                                | The two-weight rule                                                                       |

**Spacing, sizes and shape**

| Token                                            | Value                                               | Notes                                                                    |
| ------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------ |
| ★ `--sp-1 … --sp-8`                              | `2, 4, 6, 8, 10, 12, 14, 16px`                      | The de facto scale from the counts in §1.5                               |
| ★ `--h-ctl`, `--h-ctl-sm`, `--h-ibtn`            | `30px`, `24px`, `32px`                              | Segments, toggles, pills, inputs                                         |
| ★ `--h-header`, `--h-strip`, `--h-toolbar`       | `52px`, `40px`, `46px` (min)                        | Chrome rhythm. Perf Lab's `--top-h: 44px` → 52                           |
| ★ `--w-side`                                     | `288px` (232 at ≤ 900px)                            | Side panel. Perf Lab's `--insp-w: 392px` becomes a dock tile instead     |
| ★ `--radius`                                     | `0`                                                 | Circles only for status dots                                             |
| ★ `--rule-w`, `--bar-w`                          | `1px`, `2px`                                        | Hairlines; accent bars                                                   |
| ★ `--sel-bar`                                    | `inset 2px 0 0 var(--accent)`                       | The selection affordance                                                 |
| ★ `--tab-on`                                     | `inset 0 -1px 0 var(--ink)`                         | The active-tab underline                                                 |
| ★ `--layer-border`                               | `1px solid var(--ink)`                              | Floating menus and popovers, instead of shadows. Alias `--shadow` → `transparent` |
| ★ `--blink`                                      | `bl 0.8s steps(2) infinite`                         | Set to `none` under `prefers-reduced-motion: reduce`                     |

### 6.4 Provenance glyphs in Kiln's visual language

Kiln already has a fill-state glyph grammar:

- device dot: hollow = simulated, filled = live, red ring = offline (`kiln:8-11`)
- pips: empty, half-filled, filled, red (`lab:259-265`)
- Tog: hollow or filled square
- graph input nodes: dashed boxes

Perf Lab's five provenance classes map onto it naturally. Draw them as **8 px CSS shapes**, the same size and stroke as `.dot`, rather than Unicode glyphs; Unicode glyph metrics vary by font and Kiln uses system fonts.

| Perf Lab class    | Perf Lab glyph | Kiln-language mark                                                                                                     | Why it fits                                                                                       |
| ----------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `observed`        | ●              | Filled ink circle (`.dot.live`)                                                                                        | Kiln already uses a filled dot for "a real device answered"                                       |
| `derived`         | ◐              | Half-filled ink circle, using the same gradient as `.pip.run` (`lab:262`)                                               | Half of the evidence is computed                                                                  |
| `heuristic` (model, simulated) | ◌ | Hollow ink circle (`.dot.sim`)                                                                                      | Kiln's "simulated" dot is exactly a model-produced number                                         |
| `illustrative`    | ◇              | Hollow ink-2 **diamond**: an 7 px square rotated 45° with a 1 px border                                                 | A different *shape* says "not data", with no hue needed                                           |
| `unknown`/missing | ▨              | An 8 px hairline square with a diagonal (`--hatch`), in ink-3; the value cell shows "—" with the reason in a `title`   | Kiln shows missing values as "—" in ink-2; the hatch adds the visual flag                         |

Sketch:

```css
.prov { display:inline-block; width:8px; height:8px; border:1px solid var(--ink); border-radius:50%; vertical-align:0; flex:none; }
.prov.observed     { background: var(--ink); }
.prov.derived      { background: linear-gradient(90deg, var(--ink) 50%, transparent 50%); }
.prov.heuristic    { background: var(--bg); }
.prov.illustrative { border-radius:0; width:7px; height:7px; transform:rotate(45deg); border-color: var(--ink-2); }
.prov.unknown      { border-radius:0; border-color: var(--ink-3); background: var(--hatch); }
.prov.bad          { border-color: var(--accent); background: var(--sel); }   /* = .dot.off: failed check / offline */
```

Placement rules, following Kiln's habits:

- Like Perf Lab's `ValueCell`, show a mark **only when the value is not observed**. In `.rt` tables, put it before the number in `.num` cells. A cell explains itself through `title` ("derived from 3 runs"), as Kiln already does with `title=` on `th`s.
- Derived values: keep Perf Lab's dotted underline (`text-decoration: underline dotted var(--ink-3)`). It matches Kiln's `.nid` underline vocabulary.
- **Pair every mark with a word somewhere visible**: a legend sentence in the block header `.sub` ("◌ model · ● measured"), or the pill label. Kiln already does this in its header ("76.7 µs · measured", "last measure (stale)").

### 6.5 The ILLUSTRATIVE stamp and staleness in Kiln's language

Perf Lab uses an uppercase, letter-spaced, dashed-border stamp. Kiln has no uppercase labels. Its nearest equivalents are the `.tag` (9.5 px hairline box), the `.pill` label and the **dashed** "caveat" call-out. A Kiln-native stamp:

```css
.stamp { font: 700 var(--fs-2xs)/1 var(--sans); padding: 2px 5px; border: 1px dashed var(--ink-2); color: var(--ink-2); white-space: nowrap; }
.stamp.bad { border-color: var(--accent); color: var(--accent); }   /* "no runs imported", failed */
```

- **Text is lowercase and plain**, matching Kiln's metadata voice ("simulated", "measured", "stale"): `illustrative data`, `synthetic data`, `measured on dgx-01`, `no runs imported`.
- **Where:**
  - in `.block > header` right after the `h2` (the `.sub` slot), wherever a block's numbers are illustrative
  - in the header **pill**, whose label changes to "illustrative" with a dashed border: `.pill.illus { border-style: dashed; }`
  - in charts, as an SVG `<text class="ax">illustrative</text>` at the top-right of the plot area (the roofline already labels its roof that way, `Perf.jsx:148`); illustrative series are hollow markers with dashed lines
- **Staleness** (Perf Lab's dashed warn outline): Kiln already marks staleness in words ("last measure (stale)", "the program changed since"; `App.jsx:97`, `Perf.jsx:44`). Unified: a dashed `--ink-2` 1 px frame on the stale block (`.block.stale { outline: 1px dashed var(--ink-2); outline-offset: -4px; }`) plus the word "stale" in `.sub`. Use `--caution` only if user testing shows dashes are missed.
- **Title block**: Perf Lab's `.sheet__titleblock` (lab, board, params, build, data origin) maps onto Forge's `#title` grid box, which is defined but unused in Kiln (`forge-base:180-185`): a 1 px ink border, hairline cells, 9 px grey labels over bold values. Re-home it as a `.titleblock` at the foot of a board view, with "data origin" as one cell. Its value is the `.stamp` text.
- **Missing values**: "—" in ink-2 with the reason as `title`, plus the optional `.prov.unknown` mark. Avoid full-cell hatching; Kiln avoids textured fills.

### 6.6 Other Perf Lab constructs, translated

| Perf Lab                                              | In Kiln's language                                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Drafting-grid centre, sheet with crop marks           | Drop them. A board is a `.page.col` view whose sections are `.block`s with `h2` headers, or a `.doc` column for narrative |
| Stencil uppercase tab and rail labels                 | Kiln dock tabs (13 px mixed case)                                                                                   |
| Blue selected board card (`--sig` border plus wash)   | `.pgrid` card with `--sel-bar` (2 px red inset) and bold title                                                     |
| `.chip--tint` (CACHED, PLAYBACK@DGX)                  | `.tag` (hairline box, 9.5 px); `.tag.dim` for low importance                                                        |
| Warn, bad and ok chips                                | `.tag` plus a glyph (✓ ✕ !), red only for bad                                                                       |
| Console with orange left rule                         | Kiln Events view (`.evlist`) with red `.bad` rows; or a `.res.logs` block                                           |
| BUILD primary button with ▶                           | `Btn primary` ("Build ▸", mirroring "Measure ▸")                                                                    |
| Breadcrumb "ML-PERF-001 › BASICS › …"                 | Kiln's project button: grey code plus bold title plus ▾ (`.projbtn`)                                                |
| Rails (collapsed panes, vertical labels)              | Dock: close the view, reopen from **+**; ⌘\\ to maximise                                                            |
| d3 charts with coloured series                        | Hand SVG or d3-scale maths, styled by `.roof`-like classes; monochrome series (§6.3)                                |

---

## 7. Accessibility and responsiveness

### 7.1 What Kiln does well

- **Visible focus everywhere:** `:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px }` (`forge-base:28`). Native `<button>`s are used for every action. 49 `role`/`aria-*` attributes appear across the views.
- **Dock semantics:** tiles are labelled `<section>`s, strips are `role="tablist"` with `role="tab"`/`aria-selected`, and the close buttons have labels. Gutters are focusable `role="separator"` elements with `aria-orientation` and arrow-key resizing (`Dock.jsx:86-94`). Drag-and-drop has a **keyboard-free alternative**: the **+** menu and the tile ⋯ menu can move and split views without a pointer.
- Segmented controls and toggles expose `aria-pressed` (`common.jsx:21,27`). Devices are a `role="radiogroup"` of `role="radio"` items (`Perf.jsx:273-275`). Toasts are `aria-live="polite"` (`App.jsx:36`). The editor textarea and filters have `aria-label`s. Charts have `role="img"` and an `aria-label` (`Perf.jsx:144`, `Compiler.jsx:255`).
- **Colour is rarely the only carrier.** Failures carry ✕ or "error" text, the bounding component also has its name in the row, and checks are ✓/✕. Selection is red **and** bold (`tr.sel` bold, the selected roofline label bold).
- Empty states are explanatory sentences, not blank panes.

### 7.2 Problems to fix in the unified app

Contrast (WCAG 2.x, computed):

| Pair                                                   | Ratio | Verdict                                                     |
| ------------------------------------------------------ | ----- | ----------------------------------------------------------- |
| `--ink-2 #737373` on `--bg` (light)                    | 4.74  | AA pass for text                                            |
| `--ink-2` on `--fill #f6f6f6` (hovered rows)           | 4.39  | Slightly below 4.5                                          |
| `--accent #e2001a` on white / `#ff3b4a` on `#1a1a1a`   | 4.94 / 4.95 | Pass                                                  |
| White on `--accent` (`.toast.bad`)                     | 4.94  | Pass                                                        |
| `--tok-com #a3a3a3` on `--code-bg` (comments)          | 2.44  | **Fail.** Fix with `#737373`                                |
| Line numbers on the mis-painted gutter (`#a3a3a3` on `#d6d6d6`) | 1.74 | **Fail.** Fix the `.gutter` collision                |
| Dark `--tok-com #6e6e6e` on `#1a1a1a`                  | 3.41  | **Fail.** Fix with `#8c8c8c`                                |
| `--hair #d6d6d6` control borders on white              | 1.45  | Fails 3:1 for input boundaries; use `--hair-strong` on inputs |
| Dark `--hair #3d3d3d`                                  | 1.60  | Same                                                        |
| Perf Lab `--faint #a9aeb2` on white                    | 2.24  | Fail (for comparison)                                       |

Other issues:

- **Tiny type:** 9-10.5 px for most metadata (`--fs-xs` is used 97 times, 9 px labels exist). That is legible on desktop but should not shrink further. Do not add uppercase tracking on top of it.
- **Motion:** the hard blink (`bl`) runs indefinitely on busy and waiting states, and there is **no** `prefers-reduced-motion` rule anywhere. Add `@media (prefers-reduced-motion: reduce) { * { animation: none !important } }` or a `--blink` token.
- **Menus:** `.menu` has `role="menu"`, but its children are plain buttons without `role="menuitem"`. There is no arrow-key navigation and no focus move into the menu on open. Escape closes it, but focus is not returned to the trigger (`common.jsx:75-87`, `Dock.jsx:184-207`).
- **Tabs:** there is no arrow-key roving `tabindex`; every tab is a tab stop. The tab panels have no `aria-controls`/`role="tabpanel"` linkage.
- **Hover-only affordances:** the dock tab × is `opacity: 0` until hover or active. It is still focusable and appears on `:focus-visible` (`lab:453`), which is good, but it is invisible to discovery on touch devices.
- **Tooltips through `title` only:** many explanations (roofline points, sectors per request, strategies) are `title` attributes, which are unavailable on touch and inconsistently announced.
- **HTML injection:** highlighted code and Markdown use `dangerouslySetInnerHTML`. Both renderers escape first and restrict links to `https:`, `lab:` and `#` (`doc.js:23`, `md.js:10`). That is acceptable, but the unified app should keep these renderers centralised.
- **Editor:** the transparent textarea keeps native screen-reader and IME behaviour, which is good. The highlighted `<pre>` is `aria-hidden`.

### 7.3 Responsiveness

- **Window breakpoints:**
  - 1180 px: pill labels hide (`lab:493`)
  - 900 px: the side column narrows to 232 px; the Compile button and the brand subtitle hide (`forge-base:233-237`, `lab:394-397,494`)
  - 640 px: phone mode (`forge-base:238-246`, `lab:398-422,523-527`, `kiln:155-161,178-186`)
- **Container queries** (the better mechanism) make each view respond to its **tile** width:
  - `@container tile (max-width: 640px)` stacks the side column under the main area (`lab:462-466`, `kiln:173-177`); this is visible in `kiln-graph-light-1600.png`
  - 560 px trims Events columns (`lab:508-512`)
  - `min-width: 700px` turns the I/O page into a grid (`lab:518-521`)
  - The forge rule `@container stage (max-width: 560px) { .side { display: none } }` (`forge-base:193`) cannot match, because `.side` is a sibling of the `stage` container, not a descendant.
- **Phone (≤ 640 px):** `Dock` swaps to `PhoneDock`, a single horizontally scrolling tab strip with every view (`Dock.jsx:298-309`). The header drops the device pill, pills, layout menu and runtime clock (`kiln:186`, `lab:399-403,524`). In `kiln-phone-390.png`, content **clips on the right**: the Save and theme buttons are off-screen, the pipeline map's `loop` chip and the Bodies toggle are cut, and the "Ops at this level" counts are missing. `body { overflow: hidden }` (`forge-base:23`) hides the horizontal overflow instead of letting it scroll. Fix: allow `.pipemap` and `.toolbar` to wrap or scroll inside their own `overflow-x: auto`, and move header actions into an overflow ⋯ menu below 640 px.
- `.toasts` respects the safe area (`lab:426`). Touch: tab dragging uses pointer events with `touch-action: none` on tab labels (`lab:448`); gutters have ±4 px hit areas, which is thin for fingers.

---

## Appendix A: Screenshots

All in `/Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/screens/`.

| File                              | What it shows                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiln-default-light-1600.png`     | First load: "Code beside the compiler" layout, W-18 roofline. Notes (TOC, MathML, red "Try" call-out with lab links, ruled doc table); IR with pipeline chips and IR text; Ops side panel; Perf empty state |
| `kiln-default-dark-1600.png`      | The same in dark mode                                                                                                                                                                                     |
| `kiln-perf-light-1600.png`        | W-09 MLP after Measure, "Measure and tune" layout. Editor (note the grey gutter collision), Parameters (Seg, range sliders), Checks; Perf big number, kernel table with meters, roofline with the red selected point, KernelMetrics side panel; Kernels table and CUDA source |
| `kiln-trace-light-1600.png`       | Trace with an expanded unified diff (red strikethrough deletions, bold additions), Passes table; Knobs fork table, ForkDetail with model meters and pin / pin + measure actions; side Program params. The header shows W-18, a capture artifact (see the diary) |
| `kiln-graph-light-1600.png`       | W-10 attention, "IRs, passes and knobs" layout. Agent panel (not connected, suggestions, Model/Thinking/Run segments); Graph DAG with dashed input nodes, side panel stacked under it by container query; Events (Workbench log); Tune Search chart and best program after a 16-program sweep |
| `kiln-knobs-light-1600.png`       | W-21 matmul ladder. Reference view; Graph; Knobs with 645 options; schedule knob selects                                                                                                                  |
| `kiln-phone-390.png`              | Phone width: PhoneDock, compressed header, clipped pipeline map and side panel                                                                                                                            |
| `perflab-default-light-1600.png`  | Perf Lab for comparison: stencil labels, drafting grid, sheet with crop marks, coloured series, title block "SYNTHETIC DATA", provenance ◐ in table cells                                                  |

The capture harness is `/Volumes/SSD/tmp/kiln-001-04-scratch/harness/drive.html`. It iframes the built page and calls `window.__kiln.wb` actions; run it with `--allow-file-access-from-files` and a fresh `--user-data-dir`.

## Appendix B: File inventory (UI)

| File              | Lines | Role                                                                    |
| ----------------- | ----- | ----------------------------------------------------------------------- |
| `UI/App.jsx`      | 132   | Shell, header, toasts, shortcuts, theme                                 |
| `UI/views.jsx`    | 29    | View registry                                                           |
| `UI/dock.js`      | 173   | Pure layout-tree model and presets                                      |
| `UI/Dock.jsx`     | 309   | Tiles, gutters, tab drag, menus, picker, phone dock                     |
| `UI/wb.js`        | 322   | The store (channels, compile, measure, tune, presets, persistence)      |
| `UI/common.jsx`   | 104   | `useLab`, primitives (Btn, Seg, Tog, Pill, Tabs, Kv, Meter, Spark, Menu) |
| `UI/Ide.jsx`      | 150   | Code pane (editor, diagnostics, parameters, checks), Reference          |
| `UI/highlight.js` | 69    | JS and CUDA/WGSL tokenizers                                             |
| `UI/Compiler.jsx` | 358   | IR, Graph, Trace, NodeSide, Diff                                        |
| `UI/Kernels.jsx`  | 74    | Kernels view and save/copy helpers                                      |
| `UI/Perf.jsx`     | 316   | Perf (roofline), Tune (search chart, evidence), Devices                 |
| `UI/Knobs.jsx`    | 189   | ParamControl, Knobs view, ForkDetail                                    |
| `UI/Notes.jsx`    | 52    | Notes read/edit                                                         |
| `UI/doc.js`       | 111   | Notes Markdown, math and call-outs                                      |
| `UI/md.js`        | 45    | Agent Markdown                                                          |
| `UI/links.js`     | 54    | `lab:` link router                                                      |
| `UI/Events.jsx`   | 58    | Workbench and compile logs                                              |
| `UI/Agent.jsx`    | 265   | Agent panel (chat, tool cards, history)                                 |
| `UI/forge-base.css` | 283 | Porous Forge base: tokens, controls, editor, tables, device widgets    |
| `UI/lab.css`      | 527   | Octavo Lab additions: tags, graph, diff, agent, dock, events            |
| `UI/kiln.css`     | 234   | Kiln additions: IR, pipeline map, trace, knobs, perf, devices, notes    |
