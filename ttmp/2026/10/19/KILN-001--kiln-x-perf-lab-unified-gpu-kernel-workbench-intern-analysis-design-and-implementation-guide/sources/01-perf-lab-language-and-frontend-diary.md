# Perf Lab language and frontend analysis: work diary

This is the chronological diary for the analysis written to
`sources/01-perf-lab-language-and-frontend-notes.md` in this ticket. It covers the `lab.js` language,
the evidence contract, the Redux store and the React frontend of
`/Volumes/SSD/code/kiln/lab-workbench`.

The coordinator asked for the diary after the work was already well under way, and the session's context was
compacted once in the middle. Steps 1 to 10 were therefore rebuilt afterwards from the compaction summary and
from the session transcript
(`~/.claude/projects/-Users-manuel-odendahl-code-tulip-playback--worktrees-docs-ml-perf-001-perf-explorer/1c73c6bc-a214-4d38-9a93-226b876a1c68/subagents/agent-ac55c0d0004f72502.jsonl`).
The failing commands quoted below were taken from that transcript. Steps 11 onward were written as the work
happened.

All paths without a leading `/` are relative to `/Volumes/SSD/code/kiln/lab-workbench`.

## Step 1: Orientation, task constraints, output location

The task is a read-only analysis of the frontend and the language of the Perf Lab workbench. It is meant as
source material for an intern guide in KILN-001. Before reading any code I checked where the output would go,
what else already existed in the ticket, and what the imports memo claims. That memo is
`/Volumes/SSD/code/kiln/imports/Untitled.md`, and one of its claims has to be verified.

### What I did

- `ls -la /Volumes/SSD/code/kiln/imports` and the ticket's `sources/` directory, which was empty at the time.
- Read `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` and `pnpm-workspace.yaml`.
- Located the memo claim that "two Redux files (features/build/) are missing so the prototype does not build".

### What worked

- The configuration files are small and gave the whole toolchain at once:
  - Vite 8 on port 5199, with `/api` proxied to 127.0.0.1:5198
  - Vitest 4 in the `node` environment
  - strict TypeScript 5.9 with the `@/*` alias
  - React 19 with Redux Toolkit 2

### What didn't work

- Nothing failed in this step.

### What I learned

- `lab-workbench` is a standalone pnpm root with its own `pnpm-workspace.yaml`. It is not part of the Playback
  monorepo.
- `node_modules` already exists, so the two permitted commands (`tsc --noEmit`, `vitest run src`) could run without
  installing anything.

### What warrants a second pair of eyes

- None yet.

## Step 2: Baseline type-check and tests

I ran the two commands the task allows. The goal was to settle the "does not build" claim with evidence before
reading the code.

### What I did

- `cd /Volumes/SSD/code/kiln/lab-workbench && pnpm exec tsc --noEmit -p .`
- `cd /Volumes/SSD/code/kiln/lab-workbench && pnpm exec vitest run src --reporter=verbose 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings | head -120`

### What worked

- `tsc` exited 0 and printed no diagnostics.
- Vitest reported `Test Files  7 passed (7)` and `Tests  71 passed (71)`.

### What didn't work

- Nothing failed. The only stderr noise was
  `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.`

### What I learned

- Both `src/features/build/buildSlice.ts` and `src/features/build/thunks.ts` exist, and eight modules import them.
  The memo's claim is false for this copy.

### What warrants a second pair of eyes

- The memo may describe a different snapshot of the archive. Someone who has the original archive should confirm
  which copy the memo author looked at.

## Step 3: Language core types and builders

I read the IR types, the builder classes, the environment contract and the utilities. The builders are the
language's surface, so I listed every method with its signature and line numbers.

### What I did

- `nl -ba src/lang/ir.ts`
- `nl -ba src/lang/builders.ts`
- `nl -ba src/lang/env.ts && nl -ba src/lang/refs.ts && nl -ba src/lang/util.ts`

### What worked

- The recorder Proxy (`builders.ts` L17-34) explains how unknown methods are tolerated: they are recorded and later
  linted, not rejected.

### What didn't work

- Nothing failed.

### What I learned

- Three declared IR kinds are never emitted: NodeKind `lambda` and `compare`, and EdgeKind `binds`.
- There is no lab-level `.import()` builder. Imports are IR nodes created for evidence and cached captures.
- The content hash is cyrb53. It is 53 bits and not cryptographic.

### What warrants a second pair of eyes

- Whether 53 bits is enough as a content identity once the catalog holds real artifacts.

## Step 4: The compiler, build.ts

`build.ts` is 1030 lines long, so I read it in four chunks. I mapped each named pass, the parameter registration
that happens between passes, the IR graph construction and every lint code.

### What I did

- `nl -ba src/lang/build.ts | sed -n 1,260p`, then the same for `260,560p`, `560,820p` and `820,1030p`.

### What worked

- Each pass is wrapped in `pass(name, fn, detail)` (L167). The passes are: structure (L174), expand · resolve
  (L313), trace (L635), validate (L748), lower (L830) and plan (L838).

### What didn't work

- Nothing failed.

### What I learned

- The `lower` pass only copies `spec` out of each instance. The real lowering happens inside `makeInstance`
  during expand.
- The `trace` pass has an empty loop over hypotheses (L732-734).

### What warrants a second pair of eyes

- Binding inference runs a "dry run" of live lambdas and derives. If a lambda reads a parameter only on some
  branches, that read can be missed. I inferred this and did not test it.

## Step 5: Library, runtime, parameters

These three files define the free names a program sees, how derives and live lambdas run, and how parameters are
checked and encoded in the URL.

### What I did

- `nl -ba src/lang/library.ts`, `nl -ba src/lang/runtime.ts`, `nl -ba src/lang/params.ts`

### What worked

- `readDerive` (runtime.ts L113-147) memoizes each derive on its name plus the values of the parameters it read.
  That is how a DATA parameter recomputes without a rebuild.

### What didn't work

- Nothing failed.

### What I learned

- `$.set` throws outside handlers and effects (runtime.ts L225). However, `board.effect()` is only collected
  (builders.ts L371) and nothing ever runs it.

### What warrants a second pair of eyes

- The `persist` and `debounce` parameter modifiers are accepted but never read.

## Step 6: Query, rows, values, stats, compare, algo, detections

This step covered the data side of the language and the evidence contract: provenance, missing values, sealing
and the paired-ratio estimator.

### What I did

- `nl -ba src/lang/query.ts && nl -ba src/lang/values.ts`
- `nl -ba src/lang/rows.ts`
- `nl -ba src/lang/stats.ts && nl -ba src/lang/compare.ts`
- `nl -ba src/lang/algo.ts`, and `src/lang/detections.ts` together with its test

### What worked

- `values.ts` L20-31 states the rule that a missing value is NaN. `values.ts` L77-89 is the sealing Proxy.

### What didn't work

- Nothing failed.

### What I learned

- `pairedRatio` accepts a `seed` option and ignores it. Its RNG is seeded from the ratios themselves
  (stats.ts L69).

### What warrants a second pair of eyes

- None beyond what is recorded in the notes.

## Step 7: Finding where hypothesis verdicts are computed

I expected the verdict logic to live in `lang/`. It does not. Searching for it with grep failed twice before it
worked.

### What I did

- `grep -rn ... --include=*.ts src server`, which failed (see below).
- `grep -rn ... src server`, run again without `--include`.
- `nl -ba src/components/organisms/views/HypothesisView/HypothesisView.tsx`

### What worked

- The plain recursive grep without `--include` found `evaluateHypothesis` in the UI module
  `HypothesisView.tsx` (L19-48). `LabTab.tsx` reuses it.

### What didn't work

- Under zsh, an unquoted `--include=*.ts` is glob-expanded before grep sees it. The command failed with:
  `(eval):1: no matches found: --include=*.ts`
- A variant with `--include=*` failed the same way: `(eval):1: no matches found: --include=*`

### What I learned

- Quote glob arguments under zsh (`--include='*.ts'`), or leave the flag out.
- Verdicts are a UI concern in this prototype. No test file exercises `evaluateHypothesis` directly.
  `evidence.test.ts` comes closest.

### What warrants a second pair of eyes

- Moving the verdict logic into `lang/` is a design decision for the Kiln merge, not a refactor to do in passing.

## Step 8: Redux store, slices, thunks, server sync, agent runtime

I read the store, every slice and thunk file, the server thunks with the SSE stream, and the assistant runtime.
I also read the server's assistant service, because the four-execution limit is enforced there.

### What I did

- Read `src/app/store.ts`, `src/app/registry.ts`, `src/app/board-context.tsx`, `src/app/UrlSync.tsx` and `src/App.tsx`.
- Read every `src/features/*/…Slice.ts` and `thunks.ts`.
- `nl -ba src/features/agent/runtime.ts | sed -n 330,639`, which failed (see below), then the same command
  with `p`.
- Grepped `server/assistant/service.ts` and `server/assistant/prompt.ts` for `MAX_STEPS`.

### What worked

- The limit is `MAX_STEPS = 4` in `server/assistant/service.ts` L14, enforced at L213. The client loop in
  `liveTurn` is capped at 6 iterations.

### What didn't work

- `nl -ba src/features/agent/runtime.ts | sed -n 330,639` failed with:
  `sed: 1: "330,639": command expected`
  BSD sed needs a command after the address, here `330,639p`.

### What I learned

- Assistant code runs in the page through `new AsyncFunction` (runtime.ts L443). It is not a sandbox.

### What warrants a second pair of eyes

- The human-approval boundary. Step 12 below tests it against the server code.

## Step 9: Data layer and synthetic generation

The data layer decides what is synthetic and what is measured, which the title block and the evidence contract
both depend on.

### What I did

- Read `src/data/env.ts`, `source.ts`, `bundles.ts`, `capabilities.ts`, `datasets.ts` and `generate.ts` (724 lines).

### What worked

- `appEnv(catalog)` reads measured hashes from bundles and generates everything else.

### What didn't work

- Nothing failed.

### What I learned

- Synthetic kernel metrics are built with `val()`, so each value carries prov `observed`. The synthetic label is
  only on the run (`run.synthetic`, `manifest.synthetic`), not on the Value.

### What warrants a second pair of eyes

- Whether a synthetic metric should carry its own provenance class. This is a contract question for Kiln.

## Step 10: Components

I read the page, the layout template, the board sheet, the view renderer and every view, the inspector tabs, the
IDE pane and the editor.

### What I did

- Read `WorkbenchPage.tsx`, `WorkbenchLayout.tsx`, `BoardSheet.tsx`, `ViewRenderer.tsx`, `Panel.tsx` and every
  `organisms/views/*`.
- Read `Inspector.tsx` and the Graph, Plan, Runs, Inspect, Lab and Agent tabs, then `IdePane.tsx`,
  `CodeEditor.tsx` and `IdePane/reference.ts`.

### What worked

- The `VIEWS` map in `ViewRenderer.tsx` (L41-64) is the full list of renderable kinds. Comparing it with
  `VIEW_METHODS` in `builders.ts` (L38-65) shows the gaps.

### What didn't work

- Nothing failed.

### What I learned

- `jobList` is declared in `library.ts` L159 and `builders.ts` L62 but has no renderer. Using it renders
  `no renderer for view kind "jobList"`.
- `CodeEditor` is a textarea laid over a highlighted mirror. It is not CodeMirror.

### What warrants a second pair of eyes

- None beyond the notes.

## Step 11: Resumed after compaction; ParamBar, TopBar, tokens, provenance atoms, README

After the context compaction I picked up the remaining reading list: visual design, the parameter bar and the
README. Two shell mistakes cost a retry each.

### What I did

- `nl -ba src/components/organisms/ParamBar/ParamBar.tsx`, and a grep survey of `ParamControl.tsx`.
- `nl -ba src/components/organisms/TopBar/TopBar.tsx`, and a grep of `BoardStrip.tsx` and `PresetPicker.tsx`.
- `nl -ba src/styles/tokens.css` and `src/styles/base.css`.
- Read `ProvenanceGlyph.tsx`, `BindingBadge.tsx`, `ValueCell.tsx` and `StatTile.tsx`, then `lib/format.ts`
  L1-95 and the matching CSS.
- `nl -ba README.md`

### What worked

- `PROV_GLYPH` (format.ts L66-72) is the single map from provenance to glyph:
  - observed ●
  - derived ◐
  - heuristic ◌
  - illustrative ◇
  - unknown ▨

### What didn't work

- `... ; echo ===; ...` failed under zsh with `(eval):1: == not found`. zsh treats a leading `=` as `=cmd` path
  expansion. Using `echo '---'` instead worked.
- `nl -ba src/presets/dino-pr1005.lab.js` failed with `nl: src/presets/dino-pr1005.lab.js: No such file or directory`.
  The presets live in `src/presets/programs/`.
- `ls ../../design` (checking the README's relative design-doc links) gave
  `ls: ../../design: No such file or directory`. This is a finding, not a mistake: the README's links are broken in
  this copy.

### What I learned

- The README is stale in three places:
  - L27 says "running entirely on synthetic data", but L126-135 describe measured and imported runs.
  - L100 says "the nine programs", but there are 11.
  - L103 calls `services/labApi` "the seam where the real backend replaces the synthetic data", but most server
    traffic goes through `services/server.ts` thunks.

### What warrants a second pair of eyes

- The ILLUSTRATIVE stamp. `BoardSheet.dataOrigin` (L24) returns `ILLUSTRATIVE DATA` when a board shows no
  experiments, not when its values have prov `illustrative`.

## Step 12: Re-verifying the load-bearing claims

Before writing, I re-read the code behind the claims an intern would build on: the estimator, sealing, the verdict
function, the assistant's job path, and the server's handling of `proposedBy`.

### What I did

- `nl -ba src/lang/stats.ts` and `nl -ba src/lang/values.ts | sed -n '20,89p'`
- `nl -ba src/lang/rows.ts | sed -n '100,125p'` (makeEnt sealing)
- `nl -ba src/presets/programs/dino-pr1005.lab.js` (all 243 lines)
- `nl -ba src/features/agent/runtime.ts | sed -n '338,358p;430,458p'`
- `nl -ba src/features/jobs/thunks.ts | sed -n '25,75p'` and `nl -ba server/app.ts | sed -n '150,180p'`
- `grep -rn "budgetGpuMin\|approval" src server`
- `pnpm exec vitest run src` (twice: plain, and with `--reporter=verbose` piped to a per-file count)

### What worked

- Per-file test counts:

  | Test file | Tests |
  | --- | --- |
  | build.test.ts | 26 |
  | detections.test.ts | 28 |
  | evidence.test.ts | 6 |
  | replies.test.ts | 3 |
  | tex.test.ts | 3 |
  | yaml.test.ts | 3 |
  | tokenize.test.ts | 2 |

  The total is 71 and matches the summary line.

### What didn't work

- `grep -n "budgetGpuMin\|TIMEOUT_MS\s*=\|approval" -r src server --include=*.ts` failed again with
  `(eval):1: no matches found: --include=*.ts`. This is the same zsh glob mistake as Step 7.

### What I learned

- `server/app.ts` L160 takes `proposedBy` from the request body. L171-172 auto-approve when `approve === true`
  and `proposedBy === 'user'`.
- Assistant code has the page's globals, including `fetch`. It could therefore post a job with
  `proposedBy: 'user', approve: true` and skip the human. I inferred this from the code and did not try it.
- `ASSISTANT.run.approval: 'human'` (builtins.ts L8) is never read as a policy.
- The 30 gpu-min budget is checked per `lab.start` call (runtime.ts L349-350). It is not cumulative.
- `evaluateHypothesis` treats a predicate that throws as a failed check (HypothesisView.tsx L30-32). With no
  missing fields, that becomes `refuted`.
- `stats.offered` turns a missing `scheduledArrival` into 0 (stats.ts L100). That contradicts the rule that
  missing never means zero.

### What warrants a second pair of eyes

- The approval bypass and the throw-means-refuted rule. Both should be checked by running them, which this
  read-only task did not allow.

## Step 13: Writing the analysis

I wrote the notes file from everything above. Each claim is marked as observed (read in code or seen in command
output) or inferred (reasoned from code and not executed).

### What I did

- Wrote `sources/01-perf-lab-language-and-frontend-notes.md`.

### What worked

- The structure follows the task's eight topics, then adds the memo verification and an index of inferences.

### What didn't work

- No command failed. A self-check after the first draft found seven statements I had written from memory that
  the code contradicts. I corrected each one:
  - The Dollar interface has no `$.call` (`refs.ts` L7-16).
  - `self.focus` takes an entity, not a view id. `self.find(sel)` returns a view by name or kind (`runtime.ts`
    L421-427).
  - `skip()` takes no arguments and skips the current matrix cell (`builders.ts` L285-289).
  - The `matrix` callback is `(e, cell)`. `each` passes `(lab, item, i)`. `data` accepts either a name or an
    object.
  - The program-save subscriber sends DELETE when the edit is removed (`source === undefined`), not when the
    source "equals the preset" (`store.ts` L67-89).
  - The radio control is a native `<input type="radio">`, and multiselect is one Checkbox per option.
  - Every pre-validate lint code (L208 to L643) was confirmed as level `error`. `layout-area` (L797) is a
    `warning`.
- The notes ran to about 1750 lines, longer than the 800-1500 target, mostly because of the tables. I left them
  in because the guide writer needs the line references.

### What I learned

- The prototype's strongest parts are the language and evidence contract in `lang/`, which are well tested. Its
  weakest are the surfaces that were declared but never wired up:
  - effects
  - `jobList`
  - several view methods
  - the `lambda`, `compare` and `binds` IR kinds
  - annotation persistence

### What warrants a second pair of eyes

- Section 9 of the notes, the weaknesses list. Each entry cites evidence, but its severity labels are my judgement.
