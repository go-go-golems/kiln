---
Title: Integration diary, KILN-006..011
Topics:
    - kiln
    - compiler
    - integration
DocType: reference
Intent: long-term
Summary: Chronological diary of merging the six KILN-006..011 implementation branches into integration/kiln-006-011, with conflicts, resolutions and test results after each merge.
LastUpdated: 2026-11-01
---

# Diary

## Goal

Merge six Kiln implementation branches (KILN-011, 009, 010, 008, 006, 007, in that order) into one integration branch `integration/kiln-006-011`, created from `research/passnet` at `373766b`. Each merge is one `--no-ff` merge commit, conflicts are resolved by keeping both features' semantics, and both test suites pass after every merge:

```
(cd packages/kiln && npm test) ; (cd integrations/passnet && python3 -m pytest -q)
```

Baseline at `373766b`: `npm test` all 48 passed; `pytest` 177 passed, 7 subtests passed.

Test logs live in the scratch directory `/tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/integration/` as `<tag>-npm.log` and `<tag>-py.log` (written by `runtests.sh <tag>` in the same directory).

## Step 1: Merge KILN-011 (integer floor division and modulo)

KILN-011 went first because it touches the shared typed-arithmetic core (exact int64 literals in the loop-level folder, the dtype of folded splat constants, the CUDA helper table) that KILN-010 also edits. The merge was clean: git's three-way merge reported no conflicts, and both suites passed without changes.

### Prompt Context
**User prompt (verbatim):** "yes, still free" (in reply to the coordinator proposing: merge in the order 011, 009 → 010 → 008, 006 → 007 with tests at every step on an integration branch, then GPU jobs on bling serially).
**Assistant interpretation:** The coordinator delegated the merges to this agent: merge the six branches in the stated order, resolve conflicts preserving both sides, keep tests green after each merge, keep a diary, local commits only, no GPU work.
**Inferred user intent:** Get one branch carrying all six features, with confidence that no feature was lost in conflict resolution, so the GPU validation jobs can run against a single integrated tree.
**Commit (code):** `704cf8f` — "Merge KILN-011: integer floordiv/mod".

### What I did
- Read the KILN-011 design-doc Section 13 (implementation notes) and the diary step index (Steps 7-12).
- `git merge --no-ff --no-commit impl/kiln-011-floordiv-mod` — no conflicts. Touched `fx_import.py`, `emit.js` (`cudaHelpers` collection from `FNS[*].helper`), `fns.js` (`CUDA_HELPERS`, division functions), `kernel.js`, `loop.js` (exact literals, `foldSplatView`/`foldSplatEw` keep dtype), `tensor.js` (`resolveEw` and the N API), new tests `integer-division.mjs`, `float-division.mjs`, `integer-constant-folding.mjs`.
- Ran both suites.

### Why
- 011 has no overlap with 009 in source and is the base that 010's duplicated foldSplat fix gets reconciled against in Step 3.

### What worked
- `npm test`: all 51 passed (48 + 3 new). `pytest`: 180 passed, 7 subtests passed.

### What didn't work
- No failures observed.

### What I learned
- KILN-011's Phase 0 also fixed `Math.fround` rounding every literal operand in the serial evaluator; this matters for the KILN-010 constant index-value fold later (its ±2^24 guard).

### What was tricky to build
- Nothing in this merge.

### What warrants a second pair of eyes
- N/A for this merge (unchanged branch content).

### What should be done in the future
- N/A.

### Code review instructions
- `git show --stat <merge>`; `packages/kiln/src/std/loop.js` foldSplatView/foldSplatEw, `packages/kiln/src/std/fns.js` CUDA_HELPERS.

### Technical details
- Logs: `m011-npm.log`, `m011-py.log`.

## Step 2: Merge KILN-009 (direct writes of mutated inputs)

KILN-009 adds `inplace.js` (the same-index and store-injectivity proofs, `planMutation`, `retargetProducer`, `compactBuffers`), `program-sim.js` (the launch-order program oracle and `AliasWatch`), the `toCuda(K, { alias })` signature, a third argument to the simulator's `M.gmem`, the `mutationStrategy` export option, and the family-162 importer fixes (`fx_normalize` dunder aliases, kept in-place results in `generate_pass`/`corpus`). One textual conflict, in `emit.js` around the `toCuda` header, where KILN-011 had inserted its `cudaHelpers` collector right above the line KILN-009 rewrote.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Merge the second branch, keep KILN-011's helper collection and KILN-009's alias signature.
**Inferred user intent:** No feature lost in the merge.
**Commit (code):** `36c1a20` — "Merge KILN-009: direct writes of mutated inputs".

### What I did
- Read KILN-009 diary Steps 7-10 (there is no design-doc Section 13 change on this branch; the implementation notes are in the diary).
- `git merge --no-ff --no-commit impl/kiln-009-mutated-inputs` → `CONFLICT (content): Merge conflict in packages/kiln/src/std/emit.js`.
- Resolution: kept KILN-011's `cudaHelpers` arrow function verbatim and replaced the base `export function toCuda(K) {` with KILN-009's commented `export function toCuda(K, { alias = [] } = {}) {`. The rest of the hunk auto-merged: KILN-011's `for (const h of cudaHelpers(K.body)) lines.push(CUDA_HELPERS[h]);` and KILN-009's `shared`/`restrict` parameter-list spelling are on different lines.

### Why
- The two sides were adjacent insertions, not competing changes: one adds a module-level helper, the other changes the signature of the function after it.

### What worked
- `npm test`: all 52 passed (adds `inplace.mjs`). `pytest`: 183 passed, 7 subtests passed.

### What didn't work
- No test failures observed.

### What I learned
- KILN-009's task-45 oracle errors (`F_v1 is not defined`) come from `toSim` not declaring a `bool` value; that is a candidate to re-check after KILN-010 (Step 7).

### What was tricky to build
- Nothing beyond the adjacent-insertion conflict.

### What warrants a second pair of eyes
- With aliases, a kernel that also needs a CUDA helper (e.g. an in-place `floordiv` producer) now gets both: the helper lines come before the `extern "C"` line, the alias spelling only touches the parameter list. Not covered by a dedicated test.

### What should be done in the future
- N/A beyond Step 7.

### Code review instructions
- `git show <merge> -- packages/kiln/src/std/emit.js` (combined diff).

### Technical details
- Logs: `m009-npm.log`, `m009-py.log`.

## Step 3: Merge KILN-010 (index values, factories, slice assignment)

KILN-010 is the largest overlap with KILN-011 and KILN-009: it adds `E.ix` through every stage, `tensor.ixval`, the factories, integer and bool values in the SIMT simulator (`toSim`), per-dtype `s_red`, integer `nn.concat`, `nn.assign`, the factory-preserving tracer and `fx_assign.py`, and it fixed `foldSplatView`/`foldSplatEw` independently of KILN-011. Five files conflicted. The resolution keeps both sides everywhere except the two splat-fold rules, where KILN-011's version is kept and KILN-010's `splatFold` helper is dropped, as KILN-010's own diary (Step 9) asked.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Merge the third branch; for the duplicated splat-fold fix keep one coherent implementation and make both branches' tests pass.
**Inferred user intent:** No feature lost, no duplicate implementations of the same rule.
**Commit (code):** `62ca4cb` — "Merge KILN-010: index values, factories and slice assignment".

### What I did
- Read KILN-010 diary Steps 6-10, in particular the Step 9 merge note for KILN-011.
- `git merge --no-ff --no-commit impl/kiln-010-index-values` → conflicts in `integrations/passnet/corpus.py`, `integrations/passnet/fx_import.py`, `packages/kiln/src/std/emit.js`, `packages/kiln/src/std/loop.js`, `packages/kiln/src/std/tensor.js`. Hunks were resolved with a small script (`bin/resolve.py` in the scratch dir) that replaces each conflict block, in order, with a hand-written resolution.
- `corpus.py` `eliminate_dead_code`: KILN-009 had moved the in-place set into a shared `inplace_node(node)` (also used by `expose_inplace_results`); KILN-010 added `operator.setitem` to that set and an observability walk through views (`storage(target)`, auto-merged). Resolution: keep `inplace_node`, keep the local `import operator` (KILN-010's `is_view` uses `operator.getitem`), and keep `setitem` with `if inplace_node(node) or node.target is operator.setitem:`. `setitem` is deliberately **not** added to `inplace_node`: a traced `setitem` node never has users (it returns `None`), so `expose_inplace_results` would append every one of them to the graph's outputs.
- `fx_import.py` `UNARY`: union of KILN-011's `torch.floor` and KILN-010's `torch.abs`/`aten.abs.default`/`torch.log`/`aten.log.default`.
- `emit.js` `toSim` store: KILN-010 wraps the stored value as `into(outDtype, …)` (BigInt for int64 storage); KILN-009 added the `"out"` slot argument to `M.gmem(A, "st", "out")`. Both kept.
- `loop.js`, six hunks:
  - `schedule` names: KILN-010's `x` names and `checkIxRange` plus KILN-011's exact-literal operand `{ num, exact }`.
  - KILN-011's `jsLiteral` and KILN-010's `ixValue` are both kept (separate helpers).
  - `compileSerial` / `compilePoint` `let`: KILN-010's `s.e.k === "ix"` branch plus KILN-011's `op(o, f)` (integer-context literals unrounded) and KILN-011's "throw before use" ordering for an unknown fn.
  - `liftEw`: KILN-011's `splatLiteral(a)` plus KILN-010's `tensor.ixval` operand as `E.ix`.
  - `liftSplatOut`: KILN-011's `splatLiteral(n)`; KILN-010's `liftIxval` rule and its registration in `lift`.
- `tensor.js`:
  - `foldSplatView`: KILN-011's (`dtype: dtypeOf(x)`, same semantics as KILN-010's `x.type.dtype` with the f32 default), plus KILN-010's new `foldViewOfIxval` rule that followed it.
  - `foldSplatEw`: KILN-011's (`F(fn).js(...values)`, `dtype: dtypeOf(e)`), and KILN-010's `splatFold` helper removed, with a comment explaining the choice.

### Why
- `foldSplatEw`: KILN-010's `splatFold` converted i64 results to `Number` and refused the fold when the result was not a safe integer. KILN-011's typed i64 functions (`fns.js` `big`/`wrap64`) take number or BigInt operands and return exact BigInts, and the rest of KILN-011 (`splatLiteral`, `E.num(bigint)`, `constText`) carries a BigInt splat value to CUDA exactly; so KILN-011's version strictly covers KILN-010's (dtype kept; exact rather than refused past 2^53).

### What worked
- `npm test`: all 53 passed (adds `index-values.mjs`; `integer-arithmetic.mjs` auto-merged both edits, incl. `s_red_i64`). `pytest`: 192 passed, 7 subtests passed (adds `test_fx_factories.py`, causal/argmax tests).
- KILN-010's "typed splats keep their dtype" block (`index-values.mjs`) passes against KILN-011's fold rules, as KILN-010's diary predicted.

### What didn't work
- No test failures after the resolution.

### What I learned
- KILN-010 code paths that read a splat `attrs.value` now may see a BigInt (int64 splats folded by KILN-011's rule). No test hit a `Math.trunc(BigInt)`-style TypeError, but that is the class of bug to watch for.

### What was tricky to build
- The `setitem` keep rule: putting it into the shared `inplace_node` predicate looks natural but would interact with KILN-009's `expose_inplace_results`, which treats every kept in-place node without users as a hidden result. The two branches never saw each other's predicate.

### What warrants a second pair of eyes
- KILN-009 `expose_inplace_results` + KILN-010 view-observability: an in-place method on a view (`x[:, 0].add_(1)`) with no users is now kept (KILN-010) *and* exposed as an extra output (KILN-009). KILN-010's importer lowers such a call to a `view_write`; whether exposing that node as a program output imports correctly was not exercised by any test. PassBench patterns of this shape are rare (families 124/162 are `masked_fill_` on whole tensors).
- The `generate_pass` AST side and the FX side must agree on exposed results; neither treats `x[i] = v` as a result, so they agree.

### What should be done in the future
- Lift the ±2^24 bound of the constant `E.ix` fold now that KILN-011 carries exact literals (Step 7).

### Code review instructions
- `git show <merge> -- packages/kiln/src/std/loop.js packages/kiln/src/std/tensor.js integrations/passnet/corpus.py` (combined diff).
- `cd packages/kiln && node test/index-values.mjs && node test/integer-constant-folding.mjs && node test/integer-division.mjs`.

### Technical details
- Logs: `m010-npm.log`, `m010-py.log`. Resolution inputs: `bin/r010-emit.py`, `bin/r010-loop.py`, `bin/r010-tensor.py` in the scratch dir.

## Step 4: Merge KILN-008 (cumsum as a scan primitive)

KILN-008 replaces the masked n×n cumsum lowering with `tensor.scan` / `E.scan`, a carried loop in the scheduler, two scan materializers (`matScanThread`, `matScanRow`), per-operand `tv` temporaries in `matTiled`, and the `CUMULATIVE` table (cumprod, cummax, cummin values). Four files conflicted, mostly because KILN-010 had added `E.ix` cases next to the lines where KILN-008 added `E.scan` cases. The merge itself was green, but a probe of the *combination* found two real defects where KILN-008's new code did not know KILN-010's `ix` expression kind or KILN-011's exact literals; they are fixed in a follow-up commit (Step 4b below).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** At this merge the scan lowering wins over KILN-010's index-value-mask cumsum; KILN-010's index-value concat mask stays.
**Inferred user intent:** One cumsum lowering (the scan), with every other KILN-010 lowering kept.
**Commit (code):** `1dc2762` — "Merge KILN-008: cumsum as a scan primitive"; follow-up `47b1472` — "Integrate KILN-008: index values and exact literals in scan kernels".

### What I did
- Read KILN-008 design-doc Section 13 and diary Steps 5-8.
- `git merge --no-ff --no-commit impl/kiln-008-cumsum-scan` → conflicts in `integrations/passnet/fx_import.py`, `packages/kiln/src/std/loop.js`, `packages/kiln/src/std/tensor.js`, `packages/kiln/test/integer-arithmetic.mjs`.
- `fx_import.py` `lower_getitem`: KILN-010 had deleted the "indices is not lowered" refusal because max/min(dim) now return real indices; KILN-008 reworded the same line because its `cummax`/`cummin` return `[values, None]`. The `None` case is reachable again (cummax/cummin indices), so the refusal is kept, worded for what is still unlowered: `(cummax/cummin indices) is not lowered`.
- `loop.js`: `E` gets both `ix` (KILN-010) and `scan` (KILN-008); `IX_DTYPES`/`PREDICATES` and `hasScan` both kept; `workOf` counts `ix` as 1 and `step` like `acc`; `lift` registers `liftEw, liftReduce, liftScan, liftView, liftGather, liftSplatOut, liftIxval` and `liftSplatOut` keeps KILN-011's `splatLiteral`.
- `tensor.js`: `constText` (KILN-011) and the `CUMULATIVE` op loop (KILN-008) both kept; `N` gets KILN-010's argmax/assign/repeat/repeatInterleave/argmin and KILN-008's cumprod/cummax/cummin; in `decompositions` KILN-010's index-value-mask `nn.cumsum` decomposition is **dropped** and replaced by KILN-008's `CUMULATIVE` scan decompositions, while KILN-010's `nn.argmax`, `nn.assign`, `nn.repeat`, `nn.repeat_interleave` stay. KILN-010's concat index-value mask lives in `concat.js` and auto-merged unchanged.
- `integer-arithmetic.mjs`: KILN-008's version (cumsum is a scan, so the int64 tree combine only appears under a pinned `MAP=row` compile), with KILN-010's renamed array: `/__shared__ long long s_red_i64\[/`.

### Why
- The cumsum choice is the coordinator's instruction and matches KILN-008's design (n steps per row instead of n² masked terms).

### What worked
- `npm test`: all 55 passed. `pytest`: 195 passed, 7 subtests passed.

### What didn't work
- Green tests hid two cross-feature defects, found with a probe (`probes/scan-ix.mjs` in the scratch dir) that fuses an `arange` into a cumsum and puts a 2^60 + 1 literal into a scan body:
  - `cumsum(x + arange(8))` (i64): `RuleError: loop/fusion/merge_loop_ops at n8: Cannot read properties of undefined (reading 'k')`, stack `substE (loop.js:111)` ← `rb (loop.js:180)` ← `schedule (loop.js:184)` ← `scanFusionLegal` ← `inlineInto`. KILN-008's carry rewrite `rb` in `schedule` handles `num`/`in`/`op`/`red` and treats everything else as a scan, so an `ix` node was rewritten as if it were a scan (`y.body` undefined).
  - After that fix: `simulateKernel` → `EvalError: bad expression ix` from KILN-008's `pointExpr` (the definitional point reference for scan kernels), and `cumsum(x + (2^60 + 1))` → `8 of 8 integer values differ (first at 0: 1152921504606846978 vs 1152921504606…)`: `pointExpr` spelled every literal as `Math.fround(v)`, ignoring KILN-011's exact literals.

### What I learned
- KILN-010 and KILN-011 each audited every expression-kind switch that existed when they branched; KILN-008 added two new switches (`rb`, `pointExpr`) that neither of them could see. Expression-kind switches are the place to look after any merge of IR-extending branches.
- KILN-008's own follow-up ("simulate integer scan kernels after KILN-010") is closed by the merge: `toSim` now runs integer scan kernels under both `MAP=thread` and `MAP=row`, exactly.

### What was tricky to build
- Nothing in the textual resolution; the defects were semantic and only visible to a probe that combines the features.

### What warrants a second pair of eyes
- `tile.js` auto-merged KILN-010's "an `ix` node disqualifies `MAP=tiled`" with KILN-008's per-operand `tv` temporaries and scan analysis; no conflict and the tests pass, but no test fuses an index value into a tiled epilogue *and* a scan program.

### What should be done in the future
- N/A beyond the follow-up below.

### Code review instructions
- `git show <merge> -- packages/kiln/src/std/tensor.js` (the cumsum decomposition choice), then the follow-up commit.

### Technical details
- Logs: `m008-npm.log`, `m008-py.log`. Resolution inputs: `bin/r008-*.py`.

## Step 4b: Follow-up, index values and exact literals in scan kernels

Two small fixes in `packages/kiln/src/std/loop.js`, plus tests:

- `schedule`'s carry rewrite `rb`: `if (y.k === "num" || y.k === "in" || y.k === "ix") z = y;` — an index value is a leaf like a load (its substitution of the scanned variable already happened in `substE`, which has an `ix` case).
- `pointExpr`: `case "ix": return ixValue(y, js);` and literals spelled through KILN-011's `jsLiteral` with the parent function's spec (`g(a, FNS[y.fn])`), the same spelling `compilePoint`'s nest walk uses.
- `test/scan.mjs`: the Phase 7 block now simulates the integer kernels too (it filtered `outDtype === "f32"` because integer simulation did not exist); a new block checks `cumsum(arange)`, `cumsum(x + arange)`, `cumsum(x + 2^60 + 1)` and an i64 cumsum under `MAP=thread` and `MAP=row`: Loop IR equals the frontend reference and every kernel simulates exactly.

After the follow-up: `npm test` all 55 passed, `pytest` 195 passed, 7 subtests passed (logs `m008b-*`). Probe output before/after is in the "What didn't work" bullets of Step 4.

## Step 5: Merge KILN-006 (tensor-core matrix products)

KILN-006 adds `mma.js` (atom table, fragment layouts, warp emulator), the warp-collective `mma` Kernel IR statement with CUDA/WGSL/simulator spellings, `MAP=mma` with `mmaPlan` legality and the `matMma` materializer, `estimateMma`, the `costPrior` refusal of `mma` without a measured tensor rate, `expandFork` accepting `undefined` knob levels, `program.js` `operandInputs`, and block-mapped `mma` in `export.js`. Four files conflicted, all at places where KILN-008 (scans), KILN-010 (typed simulator storage) or KILN-011 (CUDA helper table) had changed the same function headers or dispatch lines.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Merge the fifth branch keeping MAP=mma beside the scan maps and the integer simulator.
**Inferred user intent:** No feature lost.
**Commit (code):** `62a2b68` — "Merge KILN-006: tensor-core matrix products".

### What I did
- Read KILN-006 design-doc Section 13 and diary Steps 7-11.
- `git merge --no-ff --no-commit impl/kiln-006-tensor-cores` → conflicts in `packages/kiln/src/std/emit.js`, `kernel.js`, `program.js`, `tile.js`.
- `emit.js`:
  - imports: `FNS, CUDA_HELPERS, fill` (KILN-011) and `MMA_OPS, runAtom, ORDERS` (KILN-006).
  - `toCuda` includes: KILN-006's `mmaOperands`-aware `cuda_fp16.h`/`cuda_bf16.h` includes and `CUDA_PACK` lines, then KILN-011's `for (const h of cudaHelpers(K.body)) lines.push(CUDA_HELPERS[h]);`. KILN-006's inline `kiln_round_tf32` line (the base's spelling, which KILN-011 moved into `CUDA_HELPERS`) is **dropped**: keeping both would define `kiln_round_tf32` twice in any kernel that rounds to TF32 — a CUDA compile error that no CPU test catches.
  - `toSim`: KILN-010's `SIM_STORAGE` and its comment, with KILN-006's signature `toSim(K, { instrument = false, mmaOrder = "sequential" } = {})` and `ORDERS` check.
  - simulator prelude: KILN-006's `MMAFAIL` helper and KILN-010's typed shared arrays (`new ${SIM_STORAGE[s.dtype ?? "f32"]}(…)`).
- `program.js`: both imports (`IX` for KILN-010's `dataIndexedInputs`, `roundOperand` for KILN-006); both helper blocks (`simInputs`/`outputStorage`/`checkExact` and `operandInputs`); `simulateKernel` composes them: `const ins = operandInputs(kern, simInputs(kern, seed))`, `out = outputStorage(kern.outDtype, …)`. `operandInputs` only rewrites the A/B inputs of an `mma` kernel, which are floating, so integer inputs are untouched.
- `kernel.js`: header comment lists the `mma` statement and KILN-010's `ix` float-expression kind; KILN-008's scan materializers and KILN-006's `mmaAccumulators`/`mmaWarpStep`/`mmaAccElements`/`matMma` both kept; `materialize` computes `plan` (KILN-006), calls `launch(an, kn, plan)`, then dispatches scans first (`an.scan ? matScanRow/matScanThread`) and `MAP=mma` to `matMma`.
- `tile.js`, six hunks: the MAP header comment lists both the scan reading of MAP and `MAP=mma`; imports `FNS, reducer` (KILN-008) and the `mma.js` names; `operandPrecision`/`operandChain`/`mmaPlan`/`warpsOf` kept and `legalMaps(an, plan = null)` starts with KILN-008's scan early return; `forkTree` uses `legalMaps(an, plan)` with KILN-008's scan-aware `TPB` level; `launch(an, kn, plan = null)` with KILN-008's scan geometry first; `estimate(an, kn, t, plan = null)` dispatches `an.scan` to `estimateScan` and then `MAP=mma` to `estimateMma`.

### Why
- A scan kernel never has a contraction-only map (its `legalMaps` returns before `mma` could be pushed), so dispatching scans first in `materialize`, `launch` and `estimate` is equivalent to either order and keeps each feature's own code path intact.

### What worked
- `npm test`: all 59 passed (adds `mma-cost`, `mma-kernel-ir`, `mma-kernel`, `mma-layout`). `pytest`: 195 passed, 7 subtests passed.

### What didn't work
- No test failures. The duplicate `kiln_round_tf32` definition would have been invisible to every CPU test (the simulator does not compile CUDA); found by reading the combined hunk. Checked with `probes/mma-tf32-helper.mjs`: a 32×32·32×16 TF32 product pinned to `MAP=mma` fuses its rounding into `k_ew_matmul_reduce` and its CUDA has `kiln_round_tf32 defs: 1 uses: 3`.

### What I learned
- When a branch rewrites a line another branch moved into a table, git shows the moved line as unchanged context on one side; the conflict is the only place where the duplication can be seen.

### What was tricky to build
- Nothing beyond reading which side's version of the include block already contained the other side's change.

### What warrants a second pair of eyes
- No test exercises a KILN-009 in-place mutation whose producer is a `MAP=mma` kernel (`x += a @ w` with MAP=mma pinned): `sameIndexSlots` will either refuse it (write-back) or prove it; the program oracle would catch a wrong proof but nothing runs it on an mma producer.
- `matMma` epilogues with a KILN-010 index value (e.g. `a @ w + arange`) are not tested; `mmaPlan` only constrains the contraction body, so such an epilogue is accepted.

### What should be done in the future
- NVRTC compile of a TF32 `MAP=mma` kernel from this branch on the GPU host (it is the one path where the helper table and the mma includes meet).

### Code review instructions
- `git show <merge> -- packages/kiln/src/std/emit.js packages/kiln/src/std/tile.js packages/kiln/src/std/kernel.js packages/kiln/src/std/program.js`.
- `cd packages/kiln && node test/mma-kernel.mjs && node test/mma-cost.mjs && node test/scan.mjs`.

### Technical details
- Logs: `m006-npm.log`, `m006-py.log`. Resolution inputs: `bin/r006-*.py`.

## Step 6: Merge KILN-007 (fused attention)

KILN-007 adds the attention recognizer (`attention.js`), the `loop/attention` pass, `MAP=flash` (`flash.js` geometry/cost, `flash-kernel.js` `matFlash` with the `products` seam), `N.safeSoftmax` (used by `fx_compose.lower_sdpa`), and `--attention` plumbing through `kiln_eval.mjs`, `corpus.py`, `evaluate_tasks.py`, `prepare_study.py`, `kiln-export.mjs` and the workbench. Six files conflicted; all were "both sides added an item to the same list" conflicts (MAP enum, knobs, dispatch chains, CLI arguments) plus the JSON encoding of non-finite test inputs, which KILN-010 and KILN-007 had solved differently. Green after the merge; a probe then found that a KILN-010 causal mask crashes the flash materializer (Step 6b).

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Merge the last branch; MAP=flash beside MAP=mma and the scan maps; one encoding for non-finite inputs.
**Inferred user intent:** No feature lost.
**Commit (code):** `c732046` — "Merge KILN-007: fused attention"; follow-up `f31a317` — "Integrate KILN-007: index-value masks in flash kernels".

### What I did
- Read KILN-007 design-doc Section 13 and diary Steps 7-11.
- `git merge --no-ff --no-commit impl/kiln-007-fused-attention` → conflicts in `integrations/passnet/corpus.py`, `integrations/passnet/kiln_eval.mjs`, `integrations/passnet/test_fx_compose.py`, `packages/kiln/src/std/export.js`, `kernel.js`, `tile.js`.
- `corpus.py`: `compile_task(..., matmul_precision=None, mutation_strategy=None, attention=None)` and the `main()` call passes `args.mutation_strategy, args.attention` (both CLI options already auto-merged).
- `kiln_eval.mjs` / `test_fx_compose.py` (`run_kiln`): KILN-010 sent NaN inputs as JSON `null`; KILN-007 sent every non-finite value as a string (`"NaN"`, `"Infinity"`, `"-Infinity"`) and decoded with `Number`. KILN-007's encoding covers KILN-010's case, so it is the one kept: `kiln_eval.mjs` decodes strings only, `run_kiln` takes KILN-007's `attention` argument and encoding; KILN-010's argmax-with-NaN test passes through it unchanged. (`test_fx_factories.py` sends only finite data.)
- `export.js`: `threadMapped = !/(^|,)MAP=(row|tiled|mma|flash)(,|$)/.test(kn.row)` and the comment.
- `kernel.js` `materialize`: KILN-006's plan and `launch(an, kn, plan)`, KILN-008's scan dispatch first, then `row | tiled | mma | flash | thread`.
- `tile.js`, nine hunks: header lists `MAP=mma`, the scan reading of MAP and `MAP=flash`; imports from `fns.js`, `mma.js`, `attention.js`, `flash.js`; `MAP` enum `["thread", "row", "tiled", "mma", "flash"]`; knobs `WM, WN` and `BR, BC, RM`, `KNOBS = [MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN, WM, WN, BR, BC, RM]`; `legalMaps` pushes `mma` (when `plan.op`) and `flash` (when `an.attention`); `forkTree` uses `legalMaps(an, plan)`, KILN-007's `BR`/`BC`/`RM` levels, and a `TPB` level that tries `flash`, then KILN-008's scan thread map, then thread/row; `launch(an, kn, plan)` returns `flashLaunch` first, then the scan geometry; `printTile(an, kn, args, name, plan = null)` with the flash early return; `scheduleRule` keeps KILN-006's operand precisions and describes `(thread, row, tiled, mma, flash)`.

### Why
- `KNOBS` order only affects `canonRow` for knobs that are set; mma rows never set `BR/BC/RM` and flash rows never set `WM/WN`, so every existing row string (and evidence key) of either branch is unchanged.
- The scan early return in `analyze` comes before KILN-007's `matchSoftmaxContraction` call, so scan kernels have no `an.attention` and never offer `flash`.

### What worked
- `npm test`: all 60 passed (adds `attention.mjs`). `pytest`: 195 passed, 7 subtests passed.

### What didn't work
- Green tests again hid a cross-feature defect. Probe `probes/attention-masks.mjs` (KILN-007's `graph()` helper extended with `mask: 'causal'` = `N.select(N.causalMask(L, S), s, -Infinity)`) under `attention: 'fused'`:
  - `{"mask":"causal","L":7,"S":7,"D":8}`: recognized, but every flash option fails with `lowering/kernel/materialize at n76: a reduction inside a flash fragment`; `{"mask":"causal","L":5,"S":9,"D":8}` fails the default compile with the same message. `flash-kernel.js` `emitFrag` handles `num`/`in`/`op` and reports anything else as a reduction; the causal mask is a KILN-010 `ix` node.
  - The pytest `test_causal_attention` with `attention='fused'` does **not** catch this (`kiln_eval.mjs` compares Loop IR values, and on its A100 target the chosen option was not materialized as flash), so the node test is the regression guard.

### What I learned
- KILN-007's "bool-mask kernels cannot run in the SIMT simulator" limit is closed by KILN-010's bool storage: `{"mask":"bool"}` → `options 3 simulated ok 3`, `{"mask":"bool",…,"variant":"plain"}` → `options 9 simulated ok 9` without any change.

### What was tricky to build
- The fork tree's `TPB` level is one chained conditional per map; three branches each extended it. The resolved chain is ordered `flash → scan thread → thread → row → 0` so that each branch's own subsequence is unchanged.

### What warrants a second pair of eyes
- `tile.js` `bestEstimate` (KILN-007's fusion cost gate) builds `forkTree(an, t)` without an mma plan and calls `estimate` without one, so the composed side of the gate never considers `MAP=mma`. Today that matches `costPrior` (mma is refused without a measured tensor rate on every spec); once a target gets `mma` rates, the gate will compare flash against a composed program without tensor cores and favor fusion.

### What should be done in the future
- Pass the mma plan into `bestEstimate` once any target carries measured `mma` rates.

### Code review instructions
- `git show <merge> -- packages/kiln/src/std/tile.js integrations/passnet/kiln_eval.mjs integrations/passnet/test_fx_compose.py`.

### Technical details
- Logs: `m007-npm.log`, `m007-py.log`. Resolution inputs: `bin/r007-*.py`.

## Step 6b: Follow-up, index-value masks in flash kernels

- `packages/kiln/src/std/flash-kernel.js` `emitFrag`: `else if (n.k === "ix") v = kx.v(kb.let(kx.ix(IX.subst(n.e, env), n.dtype)));` (the spelling `kernel.js` `emitNest` uses), and literals keep KILN-011's exact digits (`kx.num(n.exact != null ? BigInt(n.exact) : n.v)`).
- `packages/kiln/test/attention.mjs`: `graph()` gains `mask: 'causal'`; new `simulateAll` cases: bool mask (sdpa and plain) at L=9, S=11, D=16, and causal at (L, S) = (7, 7), (5, 9), (9, 5) in f32 and (9, 5) in bf16. The test's simulated-option count went from 118 (the merge's test file) to 160.
- `integrations/passnet/test_fx_compose.py` `test_causal_attention`: also checks `attention='fused'` with `attention_kernels=1` (recognition through the importer; not a guard for the materializer, see Step 6).
- Probe after the fix: every case `simulated ok` on all options (`causal 7/7: 3 of 3`, `5/9: 3 of 3`, `9/5 bf16: 9 of 9`). The flash CUDA spells the mask as `bool f0 = 0; … f0 = ((((c0 + j0) <= (r0 + (8 * rb)))) != 0);` (`probes/causal-cuda.mjs`).
- Verified the guard: with KILN-007's original `flash-kernel.js`, `node test/attention.mjs` fails with `AssertionError [ERR_ASSERTION]: lowering/kernel/materialize at n76: a reduction inside a flash fragment`.

## Step 7: Cross-feature follow-ups and the CPU compile gates

With all six branches merged, I checked the cross-feature items the coordinator named, made the one small change that was safe, and ran the KILN-005 / KILN-008 CPU local compile gate on a representative sample. Two follow-ups had already been made in Steps 4b and 6b; this step adds a third (the KILN-010 constant index-value bound) and verifies that two simulator gaps recorded by other tickets are closed by the merge without code changes.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Look for cheap follow-ups the merge makes possible; verify the named simulator gaps; run the CPU gates with outputs in the scratch dir only; record the rest.
**Inferred user intent:** The integration branch should be ready for the serial GPU jobs, with every CPU-checkable interaction checked first.
**Commit (code):** `1164b8b` — "Integrate KILN-010: exact int64 constant index values past 2^24"; this diary in the commit after it.

### What I did
- **KILN-010 ±2^24 bound (diary Step 9).** `loop.js` `E.ix`: a constant int64 index value past 2^24 is now `E.num(BigInt(v))`, an exact KILN-011 literal; constants within ±2^24 fold to the same number literal as before (unchanged intern keys and kernel identities); int32 constants past 2^24 stay index values, because a number literal that is an operand of an untyped function (`select`, args `"*"`) is still spelled through `Math.fround` by `jsLiteral`. Test block in `test/index-values.mjs` (`x + arange(2^30 + 3, 2^30 + 4)` broadcast: Loop IR equals the frontend, CUDA has `1073741827LL`, the simulator agrees).
- **KILN-009 task-45 bool gap.** Ran KILN-009 `scripts/05-mutation-plan-table.py` (task 45; `45 10/10 {'direct': 10}`) and `scripts/06-oracle-over-corpus.mjs` on it: `{"programs":10,"ok":10,"hazard":0,"differs":0,"skipped":0,"errors":0}`. At KILN-009's commit the same 10 programs were the 10 oracle errors (`F_v1 is not defined`). Closed by KILN-010's typed `toSim`; no change needed.
- **KILN-007 bool-mask gap.** Closed by KILN-010's bool storage (Step 6, "What I learned"); now covered by `test/attention.mjs` (Step 6b).
- **KILN-008 integer-scan simulation follow-up.** Closed (Step 4b); `test/scan.mjs` now simulates integer scan kernels.
- **KILN-009 × KILN-010 exposed view write** (Step 3, second pair of eyes). Probe `probes/view_inplace_exposed.py`: `t = zeros(4, 4); t[:, 0].add_(1); return x * t` → `expose_inplace_results` exposes `add_`, the importer returns `{out0: v4, out1: v3}` where `v3` is the view's new value (`N.add(view, 1)`) and `v4` reads the assigned root. That is what PyTorch's `add_` returns (the view), so it is consistent; no change.
- **CPU compile gates** (KILN-008 `scripts/03-local-compile-gate-scan.py`, which is KILN-005 `scripts/674-local-compile-gate.py` with an explicit `--upstream`; the original 674 resolves `sources/upstream` next to itself, which is an untracked directory present only in the `passnet` worktree, so it cannot run from this worktree without adding files to it). Upstream: the `passnet` worktree's KILN-005 `sources/upstream`. Outputs: `gate-scan/` and `gate-674/` in the scratch dir (`gate.json`, per-task programs and compile logs), logs `gate-scan.log`, `gate-674.log`.
  - Scan gate, the typed-slice3 families (KILN-008's set): `28 6/6, 64 1/1, 91 1/1, 104 1/1, 126 3/3, 175 6/6, 199 9/9, 3 10/10, 139 2/2, 162 6/6, 38 6/6` — identical to the frozen KILN-005 `typed-slice3-replay-v1/local-compile-gate.json` and to KILN-008's own run; 7 scan kernels (task 28's six graphs and task 64), as KILN-008 recorded.
  - Representative 674 sample: views-ops `9 6/6, 35 2/2, 56 3/3, 125 3/3, 132 5/5` and composed-ops `5 23/23, 23 6/6, 55 3/3, 57 6/6, 63 2/2, 78 6/6, 99 6/6, 119 6/6, 156 6/6` — identical to the frozen `views-ops-replay-v1` and `composed-ops-replay-v1` gates; plus the KILN-009 mutation families `45 10/10, 49 6/6, 111 12/12` (no frozen gate). Mutations across both gates: 33 direct, 13 write-back; the write-backs are task 57 `000` (`more than 67108864 (thread, iteration) pairs to enumerate`, as KILN-009 recorded) and tasks 156/175 (`output outN also holds the value`, a deliberate refusal).
  - Family 5 with `--attention fused` (`attn-005/`): 23/23 compile, 92 kernels, no `MAP=flash` kernel on the a100 spec. The same compile with the unmerged KILN-007 worktree (`attn-005-b007/`, read-only use of that worktree) gives the same 92 kernels and no flash kernel, so this is KILN-007's cost gate on a100, not an integration regression.

### Why
- The E.ix change is one line and only affects constants that previously stayed unfolded index values; everything else was either already closed by the merge or needs the GPU.

### What worked
- After the follow-up: `npm test` all 60 passed; `pytest` 195 passed, 7 subtests passed (logs `f1-*`).
- Every gate count equals its frozen value.

### What didn't work
- First version of the new `index-values.mjs` block: `ReferenceError: t is not defined` (the file names its target `hw`); fixed.
- KILN-005 script 674 cannot be run as-is from this worktree (see above); the KILN-008 copy was used.

### What I learned
- The three cross-feature defects found by the integration (Steps 4b, 6b) share one shape: a branch that adds an expression kind (KILN-010's `ix`, KILN-011's `exact` literals) audits the switches that exist on its base, and a sibling branch (KILN-008, KILN-007) adds new switches over expression kinds that the first branch never saw. The remaining such switches in the merged tree that I did not audit exhaustively: `attention.js` (the recognizer matches score/softmax structure; it accepted the causal `ix` mask, as the probe shows) and `inplace.js` (operates on Kernel IR loads/stores, not on expression kinds).

### What was tricky to build
- Deciding the int32 half of the ±2^24 bound: lifting it for int32 too would look symmetric but is wrong, because `jsLiteral` rounds number literals in untyped-function contexts.

### What warrants a second pair of eyes
- Everything GPU-side the merge touches and no CPU test can check:
  1. NVRTC of a TF32 `MAP=mma` kernel (the helper table and the mma includes meet there; Step 5).
  2. NVRTC of a causal `MAP=flash` kernel (a `bool` temporary from an index value; Step 6b).
  3. NVRTC of in-place (aliased) kernels that also need a KILN-011 division helper.
- `bestEstimate` ignores `MAP=mma` (Step 6): harmless until a target gets measured `mma` rates.
- Rerere is enabled in this repository; the resolutions of Steps 2-6 are recorded in `.git/rr-cache` and will be replayed by any later merge of the same branches.

### What should be done in the future
- GPU (bling, serial, not done here): the per-ticket GPU hand-offs (KILN-006 `scripts/02-mma-gpu-fixtures.mjs`; KILN-007 probe 676, ptxas of `nvrtc-flash-v1`, family-5 replay fused vs composed; KILN-008 Phase 6 scan measurements; KILN-009 NVRTC of in-place kernels and the A/B replay; KILN-010 GPU-host census of driver-dependent records; KILN-011 `check_integer_division_cuda.py`), now all against this branch.
- Pass the mma plan through `bestEstimate` when a target has measured tensor rates.
- WGSL spellings for index values (KILN-010) — cumsum is now a scan, so this affects the concat masks, assignment, argmax and causal masks.

### Code review instructions
- `git log --first-parent 373766b..HEAD`; for each merge `git show <merge>` (combined diff shows only the conflict resolutions); each "Integrate" commit is a normal diff.
- Validate: `(cd packages/kiln && npm test) ; (cd integrations/passnet && python3 -m pytest -q)`.
- Gates: `python3 ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/03-local-compile-gate-scan.py --upstream <passnet worktree>/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream --output <dir> 28 64 91 104 126 175 199 3 139 162 38` (about 1 minute per task).

### Technical details
- Commits on `integration/kiln-006-011` (first parent, oldest first): `704cf8f` Merge KILN-011, `36c1a20` Merge KILN-009, `62ca4cb` Merge KILN-010, `1dc2762` Merge KILN-008, `47b1472` Integrate KILN-008, `62a2b68` Merge KILN-006, `c732046` Merge KILN-007, `f31a317` Integrate KILN-007, `1164b8b` Integrate KILN-010, then this diary commit.
- Test counts after each step: base 48 / 177; KILN-011 51 / 180; KILN-009 52 / 183; KILN-010 53 / 192; KILN-008 55 / 195 (and after 4b); KILN-006 59 / 195; KILN-007 60 / 195 (and after 6b and Step 7). Every pytest run also reported 7 subtests passed.
- Scratch evidence (`/tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/integration/`): `runtests.sh`, `<tag>-npm.log`/`<tag>-py.log`, `bin/resolve.py` and `bin/r0NN-*.py` (the exact hunk resolutions), `probes/` (`scan-ix.mjs`, `stack.mjs`, `mma-tf32-helper.mjs`, `attention-masks.mjs`, `causal-cuda.mjs`, `ixconst.mjs`, `view_inplace_exposed.py`), `k009/` (task-45 plan and oracle), `gate-scan/`, `gate-674/`, `attn-005/`, `attn-005-b007/`.

## Step 8: GPU round on bling: hand-off checks, three PassBench replays and an NVRTC pass of the merged tree

The coordinator ran every GPU hand-off that the six tickets and Step 7 listed, serially on bling (GB10, evaluator image `localhost:5000/playback-redaction:base-26.05`, PyTorch 2.12.0a0+5aff392). Four checks ran first from the per-ticket branches while the merge was in progress. Three PassBench replays then ran from integration commit `838ecf6`. Last came an NVRTC/ptxas pass of the merged tree's tensor-core and flash kernels, including causal masks. Results:
- Nothing regressed, and family 162 is accepted for the first time (6/6).
- Direct writes of mutated inputs beat the final-copy arm on 15 of 16 tasks, by 4.2% (geometric mean), at identical acceptance.

### Prompt Context

**User prompt (verbatim):** "yes, still free" (bling availability, in reply to the proposal to merge on an integration branch and then run the GPU jobs serially); later "what's left for coverage?"

**Assistant interpretation:** Run every GPU validation the tickets handed off, one job at a time, from the integration branch where the merged code matters. Collect, audit and commit the evidence without touching frozen KILN-005 evidence.

**Inferred user intent:** Turn the six CPU-built features into GPU-validated ones, and decide the open defaults (mutation strategy, P rounding, tensor-core selection) from measurements.

**Commit (code):** `838ecf6` — mutation_strategy plan key, the two mutation plans and the per-ticket GPU evidence. This step's commit holds the replay collections and this entry.

### What I did
- **Probe 676 (KILN-007), from its branch:** `python 676-low-precision-attention-probe.py result.json` in the evaluator image. Evidence: `ttmp/2026/11/01/KILN-007-*/sources/probe-676-gpu-v1/`.
- **mma fixtures (KILN-006):** generated with `scripts/02-mma-gpu-fixtures.mjs`. I then ran `kiln_launch.check_fixtures` through a wrapper that passes `/usr/local/cuda/include` to NVRTC (`check_with_includes.py`), and diagnosed `mma-large-k` against a float64 product of RNE-TF32 operands (`diag_large_k.py`). Evidence: `KILN-006-*/sources/mma-gpu-fixtures-v1/`.
- **Division (KILN-011):** `check_integer_division_cuda.py <division-cuda-v1> --report report.json`. Evidence: `KILN-011-*/sources/division-cuda-gpu-v1/`.
- **ptxas (KILN-007):** `cuda_check.py` on its `flash-kernels.json`, with an include-path copy of the checker. Evidence: `KILN-007-*/sources/ptxas-flash-gpu-v1/`.
- **Plumbing and plans:** added the `mutation_strategy` plan key to `evaluate_tasks.py`. Froze two plans under `KILN-005-*/sources/`: `mutation-inplace-replay-v1` (auto) and `mutation-writeback-ab-v1` (writeback), each with 16 tasks and 138 graphs: the 14 mutation-writeback families plus 57 and 162.
- **CPU compile gate on the 16 tasks** (KILN-008 script 03, internal check on): 138/138 graphs compile.
- **Staging and runs:** staged three replays with KILN-005 script 641 from the integration worktree, after symlinking `sources/upstream` from the passnet worktree; the symlink is untracked. Ran them in tmux, chained with the 651 queue:
  - `typed-slice3-integration-gpu-v1` (plan `typed-slice3-replay-v1`);
  - `mutation-inplace-replay-gpu-v1`;
  - `mutation-writeback-ab-gpu-v1`.
  Collected each with script 669.
- **NVRTC/ptxas of the merged tree:**
  - KILN-007's script 04 kernels, plus 4 causal-mask flash kernels (f32 7×7 and 128×128, bf16 64×96, f16 96×64; `causal-export.mjs`);
  - KILN-006's fixtures regenerated from this tree.
  Evidence: `ttmp/2026/11/01/integration-evidence-kiln-006-011/nvrtc-v1/`.
- **Import census of all 2060 records on CPU** with per-record errors kept (`coverage-census-v1/`).

### Why
- The per-ticket checks could run during the merge because they exercise code the merge does not change semantically. The replays and the NVRTC pass had to come from the merged tree, because the merge combined the CUDA helper tables (KILN-011 and KILN-006), the index-value masks in flash fragments (Step 6b) and the scan kernels.
- The writeback arm of the A/B runs on the same day and the same image as the auto arm. The frozen `mutation-writeback-replay-gpu-v1` is from another day, and family 17's apparent drop (0.444 → 0.386 against it) turned out to be day-to-day variation: the same-day writeback arm scores 0.374.

### What worked
- **Probe 676:**
  - A fully masked row is exactly zero, never NaN, on every backend that runs, for f32, f16 and bf16, with both bool and additive masks. This confirms `N.safeSoftmax`.
  - For f16/bf16, no single P-rounding hypothesis is consistently closest. Keeping P in FP32 is the closest or within about 10% of the closest in every case.
  - Rounding the scores before softmax (`s_q`) is 3–10× worse. Phase 6 (rounding P) is therefore not needed.
  - The flash backend reports "No available kernel" for every masked case on GB10.
- **mma fixtures:**
  - The three layout probes match the hardware (max |Δ| ≤ 4.8e-7), so the fragment layout table is confirmed on silicon.
  - 5 of 6 programs pass the launcher's rtol 1e-3 / atol 1e-4.
- **Division:**
  - All 30 kernels × 4096 elements are bit-exact against PyTorch CUDA (i32, i64, f32), including the sign of zero.
  - Kernels with a literal divisor contain only `mul.hi.s32`/`mul.hi.s64`.
  - INT_MIN / −1 matches PyTorch in all modes.
- **ptxas:** 99/99 flash kernels from the branch compile with no spills, at 37–135 registers (median 66). The maximum is at the 64-thread L512 variants.
- **typed-slice3 replay:** 10/10 families and 45/45 graphs, the same as the frozen replay. Mean score 0.912 against 0.913. Tasks 28 and 64, which now compile to one fused scan kernel, gained 4.1% and 0.6%.
- **Mutation replays:** both arms accept 9/16 families and 96/138 graphs.
  - The 8 families accepted before stay accepted, and 162 is accepted for the first time, 6/6 at 0.984.
  - 57, 94, 111, 172 and 176 fail for the shared-input reason of KILN-005 reference 50; 17 and 147 stay partial (14/18, 1/6).
  - Score ratio auto/writeback: geometric mean 1.042, ≥ 1 on 15 of 16 tasks (147: 0.999). The largest gains are 131 (1.193), 96 (1.133) and 45 (1.077).
- **Merged-tree NVRTC:** 103/103 flash kernels compile, including all four causal kernels, with no spills. The regenerated mma fixtures give results identical to the branch's, so the merged TF32 helper table compiles: one `kiln_round_tf32` definition.
- **Census:** 1961/2060 graphs import, and 175 of 200 families import completely.

### What didn't work
- **Wrong subcommand name.** `kiln_launch.py check-fixtures` → `invalid choice: 'check-fixtures' (choose from 'check')`. KILN-006's hand-off named the subcommand wrongly; it is `check`.
- **No toolkit include path for NVRTC.** The bf16 probe failed with `could not open source file "cuda_bf16.h" (no directories in search list)`, and three f16 flash kernels failed the same way with `cuda_fp16.h`. The image's NVRTC does not search the toolkit include directory, and neither `kiln_launch.py check` nor `apps/workbench/test/cuda_check.py` can pass one. I worked around it with wrapper copies (kept in the evidence directories). The production PassBench path is unaffected, since every replay compiled.
- **`mma-large-k` (K=4096)** has 1 of 16384 elements outside the launcher tolerance: GPU 0.029187, Kiln 0.029052, float64 0.029065, Σ|terms| 1026. Relative to Σ|terms|, the GPU's error is 3.2e-7 (≈ 5.4 u) against 7.7e-8 (≈ 1.3 u) for Kiln's sequential FP32 reference. The tensor-core accumulator is less precise than plain FP32, but far inside KILN-006's 2e-3 simulator tolerance (max abs 3.3e-4). This is cancellation, not a defect.
- **Integer division by zero, floor mode only:** PyTorch CUDA returns 0, while Kiln returns −1 or −2, the raw hardware quotient after floor correction. Truncating division, remainder and fmod agree. PyTorch's CPU raises an error here, so no defined behavior exists to match.
- **Two `cd`/glob slips:**
  - A zsh loop with word-split arguments matched nothing; I reran it with a function.
  - The first evidence copy into KILN-006 created `sources/` as the copied directory itself; I moved the files into `mma-gpu-fixtures-v1/` and checked them with `sha256sum -c`.

### What I learned
- The mutation strategy gains less than its launch-count change suggests (4.2% overall), but it never loses. PassBench's per-graph times include the shared harness overhead, so removing one copy kernel matters most on the small graphs of 96 and 131.
- GB10's tensor-core accumulation error (≈ 5 u relative to Σ|terms| at K=4096) lies between KILN-006's `sequential` and `chunk-rz` emulator modes. Split accumulation is not needed at this size.

### What was tricky to build
- **Staging from a worktree that lacks `sources/upstream`.** Script 641 resolves the ticket from its own path and the repository from its working directory. Running the integration copy from the integration worktree, with `upstream` symlinked in (untracked), kept staging, the source snapshot and the receipts all in the integration tree.

### What warrants a second pair of eyes
- **Whether 4.2% justifies `auto` as the default.** I kept it: the acceptance is identical and the gain appears on 15 of 16 tasks.
- **The causal flash kernels** are NVRTC-compiled but not numerically checked on the GPU. Their numbers come only from the CPU simulator (Step 6b). No PassBench family uses `N.causalMask` until KILN-010's factory graphs are replayed.

### What should be done in the future
- **Add an include-path option** to `kiln_launch.py check` and `cuda_check.py`, or pass the toolkit include directory automatically.
- **Decide the floor-division-by-zero behavior.** It is undefined in Kiln today; document it, or define it as PyTorch CUDA's 0.
- **Run the census on bling** for the about 11 families whose CPU census errors are device-related (`no NVIDIA driver`, cpu/cuda propagation, or shape propagation at `.to` nodes).
- **Answer KILN-010's question** of whether PassBench's pattern tracer can match the factory graphs, before replaying the 20 factory graphs.
- **Measure GB10's tensor throughput** before `SPECS.gb10.mma` can let the model choose `MAP=mma` by default.
- **Family 5's fused attention** needs a gb10-target compile path in the replay: plans compile for `a100`, where KILN-007's cost gate declines fusion.

### Code review instructions
- Read the audits under `ttmp/2026/10/30/KILN-005-*/sources/{typed-slice3-integration,mutation-inplace-replay,mutation-writeback-ab}-gpu-v1/results-audit.json`, plus their `staging.json` and collection receipts.
- Read the probe and fixture logs in the four per-ticket `sources/*-gpu-v1/` directories and in `integration-evidence-kiln-006-011/nvrtc-v1/`.
- Recompute the A/B ratio from the two `results-audit.json` files (`records[].score.score`).

### Technical details
- **Staging:** source revision `838ecf647c991316a0dc66496a2c7b3878b5599c`, source snapshot `91883b1a…409e36` for all three studies. The typed-slice3 plan SHA256 is `741b8ba9…531c`.
- **typed-slice3 collection:** audit `5f5c53f1…20d5`, archive `results-raw.tar.gz` `e3248402…3409`.
- **Per-task scores, typed-slice3 (frozen → integration):** 28 1.049→1.093; 38 0.457→0.451; 64 0.957→0.963; 91 0.819→0.814; 104 0.998→0.992; 126 0.824→0.823; 175 0.633→0.645; 199 0.970→0.924; 3 1.512→1.507; 139 0.909→0.909.
- **Mutation A/B ratios (auto/writeback):**
  - 17: 1.031; 45: 1.077; 49: 1.001; 94: 1.010; 96: 1.133; 111: 1.014; 131: 1.193; 147: 0.999;
  - 161: 1.047; 172: 1.011; 176: 1.032; 196: 1.043; 92: 1.038; 134: 1.043; 57: 1.020; 162: 1.002.
- **Census:** the 25 families still blocked:
  - device-related, probably CPU-host artifacts: 4 driver/device-only and about 7 shape propagation at `.to` nodes;
  - missing lowerings: `tensor_split`, `multi_head_attention_forward`, `triu`, `fill_`, `getattr`, a `get_attr` constant, `inf`, tensor-method `exp`, `conv3d`, `avg_pool1d`, interpolate modes;
  - a data-dependent `if`;
  - two in-place refusals (`itruediv`, `iadd` on an aliased value).

## Step 9: Coverage wave, part 1: device-agnostic shape propagation, in-place rebinding and the small lowerings

The 25 blocked families of the Step 8 census were all-or-nothing: every graph of each family failed at the same point. I started with the device bug the GB10 census exposed (FakeTensor propagation mixing cpu inputs with `cuda:0` factory results). Fixing it in the propagation step unblocked 2 families at once, and exposed the next blocker in the others: `torch.tensor` constants, `.to(device=, dtype=)`, in-place updates of casts, views and input chains. Then I added the one-family lowerings. After commit `13449a1`, 24 of the 25 families import completely on the CPU host. The 25th is RECT_L's data-dependent boolean-mask shape, which I skipped as instructed.

The in-place rule changed in substance. It no longer asks "is the source single-use". It now asks "does any alias outside the in-place chain read the storage later". Five older tests pinned the old refusals; they now pin the refined rule (a live alias is refused, a dead one accepted).

### Prompt Context

**User prompt (verbatim):** "ok do it" (in reply to the coordinator's plan: fix the importer's device-agnostic shape propagation first, then the small lowerings, then replay every newly complete family)

**Assistant interpretation:** Make metadata propagation independent of the device the source graph names, then lower every operation that is the sole blocker of a PassBench family. Check each newly complete family numerically on CPU. Re-run the census and the local gates. Freeze (not launch) a replay plan for the families that pass.

**Inferred user intent:** Turn the 25 fully blocked families of `hf_fusible_eval_samples_v2` into replayable tasks, so the next GPU round measures more of PassBench.

**Commit (code):** `13449a1` — "Importer coverage wave: device-agnostic shape propagation, in-place rebinding, small lowerings"

### What I did
- Reproduced each blocked family's first error with a scratch driver (`scratchpad/coverage-impl/try.py ROOT [SUFFIX...]`: translate every graph of every blocked family, print per-family counts and distinct errors).
- `fx_export.propagate` / `propagation_copy`: ShapeProp runs on a copy of the traced graph. In the copy, every device argument (a `torch.device` or a `cuda[:n]`/`cpu[:n]` string) names the example inputs' device, and `.cuda()`/`.cpu()` become `.to(device)`. Each original node then receives its copy's `tensor_meta` by name. The exported graph keeps `cuda:0`, so the generated match pattern and the importer still see the source devices. Real (non-fake) examples are cloned before propagation.
- `fx_trace.FACTORIES` gained `torch.tensor` and `torch.linspace`. They now trace as `call_function` nodes. Before, they executed eagerly at trace time: `torch.tensor(..., device=cuda)` raised "Found no NVIDIA driver" on the CPU host, and a CPU `torch.tensor(1.0)` became a `get_attr _tensor_constant0`.
- `fx_import`:
  - New lowerings: `tensor_literal` (0-d `N.full`), `linspace` (float32, PyTorch's symmetric two-half formula with the step rounded in float), `device_method` (`.cuda()`/`.cpu()`).
  - `to` rewritten: optional device, dtype, `copy=`, `non_blocking=`. A dtype change or `copy=True` is fresh storage.
  - `dtype_conversion`/`type_as`: fresh when the dtype changes.
  - New `fill_` op: a recorded view gives slice assignment through `view_write`; a fresh value or an input gives an in-place update.
  - `interpolate`: resampling to the input's own size (bilinear/bicubic/linear/trilinear, half-pixel) is the input.
- `Context.require_mutation_source` rewritten around `owners()` (the storage owners a value may alias, through the new `alias_sources` map) and `live_aliases()` (aliases outside the chain read after the current node). Input mutations now set `roots[name] = input` and rebind every name of the chain, so a second in-place call on the result (`in_3 += in_0; in_4 = in_3; in_4 += in_2; relu_(...)`) is a further update of the same input.
- `fx_scalar_ops`: pow with a tensor exponent (`N.pow` in f32), scalar exponents 0.5/-0.5/-1 as sqrt/rsqrt/reciprocal (PyTorch's tensor-scalar pow specializations), and `pow_`.
- New `fx_coverage.py`:
  - tensor methods `exp`/`log`/`sqrt`/`rsqrt`/`tanh`/`abs`/`floor`;
  - `builtins.getattr` for `.T`/`.mT`; `clone`; `tile`; `fill_value`;
  - `triu`/`tril` (`N.select` over an `N.indexValue` bool mask, KILN-010); `torch.all`/`torch.any` (`amin`/`amax` over i32); `~` on bool;
  - `tensor_split` (sections or indices, slice views);
  - `conv3d` when stride equals kernel (patch linear);
  - `avg_pool1d` (`avg_pool2d` over a unit height axis);
  - `multi_head_attention_forward` (eval-mode packed self-attention, no masks).
- Tests:
  - New `test_fx_coverage.py`: 18 tests, eager (the CPU propagation copy) vs frontend and Loop IR, mutated inputs included.
  - Updated `test_fx_factories.test_contiguous_of_contiguous_is_an_alias`, `test_fx_import.test_input_mutation_*` (now two tests) and `test_potentially_aliasing_view_not_owned`, `test_fx_singleton_views.test_views_do_not_grant_mutation_ownership`, `test_fx_trace.test_alias_observer_rejected_and_read_before_mutation_accepted`, and one rejection case in `test_fx_scalar_ops` (`pow(x, 0.5)` is now lowered; the case uses 0.25).

### Why
- **Copy instead of rewriting the graph.** The importer already treats a device move as shape and dtype only. Propagating on a single-device copy is the same model, and it leaves the exported graph exactly as traced. Normalizing devices in the exported graph would also have worked, but it would hide the source's devices from everything downstream.
- **Inputs on the CPU on every host.** `translate_graph` builds them without a device on both CPU and CUDA hosts. All device arguments then name `cpu`, so propagation is identical on both.
- **The single-use rule was a scope choice, not a correctness rule** (`5df0172`, "Functionalize single-use input mutations"). Earlier reads of a mutated input read the old value in either mutation strategy. KILN-009's direct-write proof checks launch order itself (`packages/kiln/src/std/inplace.js`). The real hazard is an alias that rebinding does not update: that is what `live_aliases` refuses.

### What worked
- After the propagation fix alone, ernie-m positions (e86ddaf6f7b1, 3/3) and ef50c6b068f7 (5/5) imported.
- After the follow-ons, per family (`try.py`): 5c268833015f 3/3, 64207d746493 4/4, b845661d4e2c 11/11, e86ddaf6f7b1 3/3, 5199f657302e 6/6, 97435ff293dc 5/5, 11cf2803122f 2/2, 53c0c199f0d6 3/3, feaf50a5b5fa 3/3, 045b980d4b88 2/2, 8793137dc233 6/6, ef50c6b068f7 5/5, 8fd6b1c300dd 6/6, then f8985111144e, dfeb405a40a2, e14c8f2bf4bf, 644ff3f9ec10, cda3c540f054, 28b6fbcd3cb4, 07897b2491b0, d88799ab79fa, 1d92b2547cc2, b3e21ff1ac87, 06227f32b197 all complete. 262222d765f0 stays blocked (`TypeError: cond must be a bool, but got <class 'fx_trace.MutationProxy'>`).
- `pytest -q`: 214 passed, 7 subtests passed. `npm test` exit 0.

### What didn't work
- **First FakeTensor diagnostic (ernie-m, CPU):** `RuntimeError: Unhandled FakeTensor Device Propagation for aten.embedding.default, found two different devices cpu, cuda:0` at `%embedding_1 = torch.nn.functional.embedding(%iadd, %in_3)`. `tmp_11 = torch.ones((1, 15), dtype=torch.int64, device=device(type='cuda', index=0))` is a cuda fake tensor while `in_3` is cpu.
- **Next blockers revealed by the fix:**
  - `imul: in-place operation requires a fresh unaliased producer or a single-use input`: `tmp_6 = tmp_5.to(torch.float32); tmp_6 *= -3.4e38`; the cast was `fresh=False`.
  - `to: device/layout conversion unsupported`: `.to(device=cuda, dtype=torch.bool)`.
  - `pow: finite scalar exponent required`: `torch.tensor(256.) ** torch.tensor(0.5)`.
  - `iadd: in-place ...`: `arange(...).unsqueeze(0); tmp_5 += 2`.
- **A Python string-surgery mistake cost one rebuild.** My first edit of `require_mutation_source` sliced from the method to the first `def references(value):`. That name also occurs earlier, nested in `Context.__init__`, so the slice was empty, and `s.replace('', new)` inserted the new text between every character (a 129 MB file; `IndentationError: unexpected indent (fx_import.py, line 1)`). I recovered by deleting every occurrence of the inserted block (the earlier, intact edits came back exactly; checked against `git show HEAD:` with diff), then redid the edit anchored on `"\ndef references(value):"` after the method.
- **Fragile test inputs:** `test_chained_input_mutations_and_earlier_reads` failed intermittently. Cause: `export_graph` on real inputs ran ShapeProp, which executed `x /= s` on the caller's tensor. Eager then saw a mutated x, whose zero rows gave `0/0 = NaN`. Fix: `propagate` clones real examples. This also affects `numerics.py`, whose request inputs had been mutated by the export. After the fix, a 1-ulp row-sum difference remained (`frontend __mut0: max diff 5.96e-08`); the test is seeded and uses `atol=1e-6`.
- In that failure, Kiln's frontend gave `relu(NaN) = 0` where PyTorch gives NaN (pre-existing Kiln relu semantics, not changed here).
- **A test-harness bug:** a single-tensor output structure (`{'output': 'out0'}`) was walked with a one-element list (`AttributeError: 'list' object has no attribute 'shape'`). Fixed in the test and in `numerics.py`.

### What I learned
- FX symbolic tracing executes `torch.tensor(...)` and `torch.linspace(...)` eagerly. That is the origin of both the "no NVIDIA driver" records (the tensor is created on cuda at trace time) and the remaining `_tensor_constantN` get_attr records (a CPU tensor folded into a constant). It is not shape propagation. Proxying them like KILN-010's factories removes both.
- PyTorch's tensor-scalar pow specializes 0.5, -0.5 and -1, so `deg.pow_(-0.5)` (GAE) has a well-defined rsqrt lowering.
- With `need_weights=True` (K-Net), `multi_head_attention_forward` takes the explicit bmm + softmax path. That makes its rounding points the source dtype after each step.

### What was tricky to build
- **Ownership across views.** `owners()` follows `alias_sources` back to the values that own storage. In-place chains collapse to their root through `roots`, so `owners(iadd_of_unsqueeze_of_arange) = {arange}`. Recorded basic-index views (`ctx.views`) also get `alias_sources`. As a result the plain fresh path now refuses an update while a recorded view is still read later. Before, such a view kept its stale value (a latent bug, refused now rather than fixed).
- **Input chains.** Rebinding has to happen in both places. The placeholder's name and the in-place result's name both map to the new variable, and `input_mutations[index]` is overwritten so the last update is the one written back.

### What warrants a second pair of eyes
- **The relaxed in-place rule** (`fx_import.Context.require_mutation_source`), especially input mutations where the input was read earlier (ConViT `in_0 /= in_0.sum(...)`). The writeback strategy is correct by construction. The `auto` strategy relies on KILN-009's launch-order proof.
- **conv3d bias rounding.** The bias is added in the source dtype after narrowing the product, following `N.conv2d` and ATen's separate cuDNN bias add.
- **Same-size bicubic as identity:** exact for finite inputs. With an inf input, PyTorch's 0 * inf taps would give NaN.
- **Kiln's `relu(NaN) = 0`** versus PyTorch's NaN.

### What should be done in the future
- Data constants (`torch.tensor([..])` with a list) are refused. No family needs them yet.
- General conv3d (overlapping windows, padding) and general bicubic resampling.

### Code review instructions
- Start at `integrations/passnet/fx_export.py` (`propagation_copy`, `propagate`). Then read `fx_import.py`: `Context.owners`, `live_aliases`, `require_mutation_source`, the input-mutation branch of `import_graph`, `lower_to`, `lower_tensor_literal`, `lower_linspace`, `lower_fill_`. Then `fx_coverage.py`.
- Run `(cd integrations/passnet && python3 -m pytest -q test_fx_coverage.py)`, then the full suites.

### Technical details
- Remaining blocker: `262222d765f0` (RECT_L/GAE torchgeometric) uses `in_0[:, mask]`, then `sym_size` and `torch.ones((128 + u0,))`, a data-dependent shape.
- `linspace`: `step = f32(f32(f32(end) - f32(start)) / (steps - 1))`; element i is `start + step*i` for `i < steps // 2`, else `end - step*(steps - 1 - i)`.

## Step 10: Coverage wave, part 2: the census, the CPU compile gate and the Dynamo matcher simulation

With 24 of the 25 families importing, I ran three checks over them. The full import census (`coverage-census-v1/census.py`) at `13449a1` reports 2058/2060 graphs and 199/200 complete families, with 0 regressions against `census.json.gz`. The CPU local compile gate (KILN-008 `03-local-compile-gate-scan.py`) and the Dynamo matcher simulation (KILN-005 `658-simulate-pattern-dispatch-identity.py`) on all 24 tasks found five more defects, each fixed in commit `e0c2caf`. Four are in the importer and pass generator:
- the pattern tracer turned factories into constants;
- the pass generator only knew `+=`;
- it dropped `fill_` through a view;
- the importer emitted `bool * bool`.

The fifth is in Kiln: the exporter cannot export a splat feeding a scan, and the end-to-end comparison counts NaN against NaN as a difference. The simulation itself cannot run on this CPU host for the 13 families that move tensors to cuda, as anticipated.

### Prompt Context

**User prompt (verbatim):** see Step 9.

**Assistant interpretation:** Validate the newly complete families with every CPU gate before freezing a plan, and fix what the gates find when the fix is in scope.

**Inferred user intent:** The frozen plan should contain only families that have a real chance of being accepted on the GPU.

**Commit (code):** `e0c2caf` — "Coverage wave gates: pattern autowrap/2, bool products, typed export constants, non-finite compare"

### What I did
- **Census:** `python3 coverage-census-v1/census.py . UPSTREAM scratchpad/coverage-impl/census-v2.json`. Compared with `census.json.gz` record by record.
- **Gate:** `03-local-compile-gate-scan.py --upstream UPSTREAM --output scratchpad/coverage-impl/gate 8 13 22 29 30 34 40 43 44 50 53 68 70 71 84 90 117 124 129 155 158 170 179 194`. Re-runs: `gate2` (29 124 13), `gate3` (124 13).
- **Simulation:** `658-simulate-pattern-dispatch-identity.py --plan scratchpad/coverage-impl/candidate-plan.json` (all 24 tasks, scratch-only plan) into `sim`, then `sim2`, `sim3` (117) and `sim4` after the fixes.
- **Fixes:**
  - `fx_normalize.trace_pattern`: `fx_trace.MutationTracer` (factory proxies) plus autowrap of every `operator.i<op>`. `evaluate_normalized.py`'s banner is now `kiln-pattern-autowrap/2`.
  - `generate_pass.extract_pattern`: `PreserveInPlace` maps every augmented assignment to `kiln_i<op>`. `drop_dead_statements` keeps an in-place call when its receiver, or anything the receiver views, is live.
  - `fx_import.lower_binary`: bool `mul`/`add` become `N.cast(N.<op>(N.cast(a,"i32"), N.cast(b,"i32")), "bool")`.
  - `export.js`: `constantBytes` and typed export of a `tensor.const` argument (splat or data).
  - `util.compare`: equal non-finite values and NaN/NaN agree; differing infinities fail.
- **Tests:** `test_fx_normalize.test_other_inplace_operators_and_factories_retained`, `test_pass_generation.test_other_inplace_operators_and_factories_preserved` and `test_inplace_write_through_a_view_kept`, `test_fx_coverage.test_bool_products_and_sums`, and the npm tests `compare-nonfinite.mjs` and `export-typed-constants.mjs`. `npm test`: all 62 passed. `pytest`: 218 passed, 7 subtests passed.

### Why
- **`trace_pattern` is the evaluator's pattern tracer.** The replay runs PassBench through `integrations/passnet/evaluate_normalized.py`, which replaces each rule's pattern with `trace_pattern(self.pattern)`. Fixing factories there fixes them for the GPU replay too. It also answers KILN-010's open question ("can PassBench's pattern tracer match the factory graphs"): with `/1` it could not. A factory in a pattern executed into a `get_attr` constant, or raised "no NVIDIA driver" for `device=cuda`, while TorchDynamo captures `call_function torch.ones`.
- **Typed constants in the exporter, not the importer.** `torch.ones((1, 15), dtype=torch.int64)` is the natural lowering. A scan that does not absorb a splat input is a general exporter gap, so the fix belongs there.

### What worked
- **Census:** 2058/2060 graphs import (1961 before), 199/200 families complete (175 before), 97 graphs gained, 0 regressions. The two remaining records are RECT_L and GAE `_start6_end17_2` (family 262222d765f0): `cond must be a bool, but got <class 'fx_trace.MutationProxy'>`.
- **Gate, final:** 24/24 tasks compile with the internal check on, after the fixes. First pass: 21/24 (8, 22, 30, 34, 40, 43, 44, 50, 53, 68, 70, 71, 84, 90, 117, 129, 155, 158, 170, 179, 194). After the fixes: 29 11/11 (`gate2`); 124 and 13 in `gate3`, see Step 11.
- **Simulation:** sim2, before the protocol fix, had identity ok on 8, 22, 44, 50, 84, 90, 124, 158 and 179; sim4 is the final run (Step 11).

### What didn't work
- **Gate 13 (ernie-m):**
  - `FATAL ERROR: invalid array length Allocation failed - JavaScript heap out of memory`, also with `NODE_OPTIONS=--max-old-space-size=24000`.
  - `--no-check` exposed the real failure: `KilnError [ExportError]: kernel k_cumsum_ew_scan argument 0 is tensor.const: an exported argument must be a program input, a data constant, or an earlier kernel's output` (fixed by typed constant export).
- **Gate 29 (TinyLlama/SmolLM3):** `error line 13: tracing the program: mul over bool values is not lowered` (`causal_mask * padding_mask`, both bool; fixed).
- **Gate 124 (GAE):** `end-to-end check FAILED`. A scratch `e2e.mjs` showed `__mut3: 507 of 1000 values differ (first at 1: NaN vs NaN)`: `rsqrt` of the negative random inputs gives NaN at the same positions in both levels. The first fix still failed, because `d <= atol + rtol*|NaN|` is false. Guarded with `d === 0 ||`.
- **Writing the compare test** showed a pre-existing laxity: `compare([inf], [-inf])` passed, because `rtol * inf = inf`. It now requires a finite difference.
- **Simulation errors, first run:**
  - `ValueError Automatic match tracing currently supports explicit in-place addition only` (8, 13, 40, 170);
  - `RuntimeError Found no NVIDIA driver on your system` while tracing patterns with factories (29, 30, 43, 53, 68, 70, 71, 117);
  - capture errors for `.to(cuda)` graphs (34, 129, 155): `Dynamo failed to run FX node with fake tensors: ... FakeTensor(..., device='meta', ...), FakeTensor(..., device='cuda:0', ...)`;
  - 194 (K-Net `multi_head_attention_forward`): `applied None, matches 0`.
- **Simulation 117 (Twins):** `generation error: ValueError Output permutation must cover every returned value`. The pattern dropped `tmp_2 = tmp_1.fill_(1)` because the receiver `tmp_1` (a view) is not read later. Its base `tmp_0` is, which is why the importer kept the fill. Fixed.
- **Capture with fake cuda inputs** (`FakeTensorMode(allow_non_fake_inputs=True)`, `torch.empty(..., device='cuda')`): the inputs construct, but `torch.compile(..., fullgraph=True)` raises `RuntimeError: Found no NVIDIA driver`. The simulation is genuinely CPU-blocked for these graphs.

### What I learned
- The modified matching protocol's pattern tracer lives in this repository (`fx_normalize.trace_pattern`). A change there is an evaluator protocol change, and it must be visible in the replay logs, hence the banner bump.
- TorchDynamo inlines `F.multi_head_attention_forward` (a Python function), while FX records it as one call through `__torch_function__`. A source pattern containing it can never match the captured graph. Family 194 imports and compiles, but it is not replayable without a different pattern strategy.

### What was tricky to build
- **The gate hid the ernie-m exporter error behind an OOM.** The internal reference check allocates for the 250002 x 768 embedding before the exporter runs, so the first diagnostic was the allocation failure. Only `--no-check` reached the exporter error.

### What warrants a second pair of eyes
- **`kiln-pattern-autowrap/2`** changes what every rule's pattern looks like in the replay. Patterns without factories or non-`+=` in-place calls trace identically. Patterns with them change from unmatched to matched. The CPU simulation could only verify the families that do not move tensors to cuda.
- **The `compare` change** affects every end-to-end check. It is stricter for infinities of opposite sign and against finite values, and looser for NaN/NaN and equal infinities.

### What should be done in the future
- Run `658` with `--trace dynamo` on a CUDA host for the CPU-blocked families. Task list in Step 11.
- A pattern strategy for Dynamo-inlined Python functionals (MHA).

### Code review instructions
- Read `integrations/passnet/fx_normalize.py` `trace_pattern`, `generate_pass.py` (`AUGMENTED`, `PreserveInPlace`, `drop_dead_statements` view chain), `packages/kiln/src/std/export.js` (`constantBytes` and the `tensor.const` branch), and `packages/kiln/src/core/util.js` `compare`.
- Run `node packages/kiln/test/export-typed-constants.mjs`, `node packages/kiln/test/compare-nonfinite.mjs`, `python3 -m pytest -q test_pass_generation.py test_fx_normalize.py`.

### Technical details
- The gate compiles with `--matmul-precision highest` and the internal check on. The replay compiles with tf32 and `--skip-internal-reference-check`.
- The simulation's capture uses meta inputs (`dynamo_graph`). Graphs whose factories or `.to` name cuda cannot be captured on a CPU host, whatever the pattern.

## Step 11: Coverage wave, part 3: numerical checks, the final gates and the frozen replay plan

This step closes the wave. Every graph of the 24 newly complete families was compared with eager PyTorch on CPU at the frontend and Loop IR levels. The compile gate re-ran on the final tree, and the gate results are combined per family in `coverage-wave-v1/gates.json`. The frozen replay plan, `sources/coverage-wave-replay-v1/plan.json`, holds 23 tasks and 94 graphs. It is not staged or launched.

### Prompt Context

**User prompt (verbatim):** see Step 9.

**Assistant interpretation:** Check numerics for every newly complete family, freeze a plan of the families that pass both CPU gates, and record what the matcher simulation could and could not verify.

**Inferred user intent:** A GPU round that spends time only on families with a realistic chance of acceptance.

**Commit (code):** `d823fe8` — "kiln_eval: non-finite outputs travel as "NaN"/"Infinity"/"-Infinity" strings". This step's commit holds the evidence, the plan and this entry.

### What I did
- **`coverage-wave-v1/numerics.py`.** One process per graph, J at a time, S seconds each. Eager PyTorch runs the CPU propagation copy. Inputs are seeded randn, with randint(0, 2) for integer and bool inputs. Graphs above an input-element limit are recorded as `skipped`. Verdicts: `exact`, `within` (max |diff| <= tol x max(1, max |ref|), with tol 1e-4 for f32, 1e-2 for f16, 4e-2 for bf16), `outside`, `error`.
- **Runs:**
  - `numerics-randn.json`: all 97 graphs, 6 jobs, 900 s.
  - `numerics-rerun.json`: tasks 13, 29, 30, 34, 40, 124, with `KILN_NUMERICS_LIMIT=40000000`, `NODE_OPTIONS=--max-old-space-size=12000`, 3 jobs, 3600 s.
  - `numerics-rand-convit.json`: task 8 with `--dist rand`.
- **Gates:** final compile gate on `e0c2caf` (`gate-final`, 23 tasks; task 13 checked manually per graph). Combined everything with `coverage-wave-v1/summarize_gates.py` into `gates.json`.
- **Plan:** frozen with `coverage-wave-v1/freeze_plan.py` (header copied from `mutation-inplace-replay-v1/plan.json`, `import_census_sha256` = sha256 of `coverage-wave-v1/census-v2.json.gz`).

### Why
- **ConViT ran with uniform inputs.** Its input is an attention map, a nonnegative row-stochastic matrix. With randn, row sums of 196 standard normals approach zero, and `x / sum` turns a one-ulp difference in summation order into a large absolute error (f32 0.566 at max |ref| 718, relative 7.9e-4). With rand the f32 variant differs by 8.4e-9 at max |ref| 0.012, and both low-precision variants are exact.
- **194 (K-Net MHA) is excluded** even though numerics and the compile gate pass. The simulation's failure (`applied None, matches 0` on all three graphs) is not a CPU artifact. TorchDynamo inlines `F.multi_head_attention_forward`, so the source pattern's single call cannot match.

### What worked
- Per-family numerical results:

| task | graphs | numerics | worst rel. diff | compile gate | Dynamo sim (CPU) | plan |
| --- | --- | --- | --- | --- | --- | --- |
| 8 | 3 | exact 2, within 1 (rand) | 8.4e-09 | 3/3 | identity ok | yes |
| 13 | 4 | exact 2, within 2 (base variants at max dim 1024) | 6.3e-05 | 2 with check + 2 --no-check | CPU-blocked | yes |
| 22 | 2 | within 2 | 7.9e-03 (bf16) | 2/2 | identity ok | yes |
| 29 | 11 | exact 11 | 0 | 11/11 | CPU-blocked | yes |
| 30 | 3 | exact 3 | 0 | 3/3 | CPU-blocked | yes |
| 34 | 5 | within 5 | 1.0e-02 (bf16) | 5/5 | CPU-blocked | yes |
| 40 | 6 | within 6 (at max dim 256) | 6.1e-05 | 6/6 | CPU-blocked | yes |
| 43 | 5 | exact 3, within 2 | 7.6e-06 | 5/5 | CPU-blocked | yes |
| 44 | 2 | within 2 | 7.9e-03 (bf16) | 2/2 | identity ok | yes |
| 50 | 2 | exact 2 | 0 | 2/2 | identity ok | yes |
| 53 | 3 | within 3 | 2.6e-04 | 3/3 | CPU-blocked | yes |
| 68 | 3 | exact 3 | 0 | 3/3 | CPU-blocked | yes |
| 70 | 2 | exact 2 | 0 | 2/2 | CPU-blocked | yes |
| 71 | 6 | exact 6 | 0 | 6/6 | CPU-blocked | yes |
| 84 | 2 | exact 2 | 0 | 2/2 | identity ok | yes |
| 90 | 3 | exact 2, within 1 | 8.6e-08 | 3/3 | identity ok | yes |
| 117 | 3 | exact 3 | 0 | 3/3 | CPU-blocked | yes |
| 124 | 4 | exact 1, within 3 | 1.7e-04 | 4/4 | identity ok | yes |
| 129 | 5 | exact 5 | 0 | 5/5 | CPU-blocked | yes |
| 155 | 6 | exact 3, within 3 | 1.3e-04 | 6/6 | CPU-blocked | yes |
| 158 | 2 | within 2 | 6.1e-03 (bf16) | 2/2 | identity ok | yes |
| 170 | 3 | exact 3 | 0 | 3/3 | CPU-blocked | yes |
| 179 | 9 | exact 9 | 0 | 9/9 | identity ok | yes |
| 194 | 3 | within 3 | 1.6e-03 | 3/3 | no match 3/3 | no |

  Over the 94 plan graphs: 62 exact, 32 within (worst: about one ulp of bf16 relative to the output magnitude).
- **Final compile gate (`e0c2caf`):** 23/23 tasks compile every graph with the internal check on. Task 13: the two tiny-random variants pass with the check on (`end-to-end check ok at loop`). The two ernie-m-base variants (embedding 250002 x 768) compile with `--no-check`; with the check on, the CPU evaluator fails to allocate.
- **Simulation (`sim4`, CPU, TorchDynamo on meta inputs):**
  - identity ok on every graph of 8, 22, 44, 50, 84, 90, 124, 158 and 179;
  - CPU-blocked capture for every graph of 13, 29, 30, 34, 40, 43, 53, 68, 70, 71, 117, 129, 155 and 170;
  - genuine mismatch on 194.

### What didn't work
- **`kiln_eval produced no output`** for all 11 graphs of task 29 in the first run: the bool `mul` refusal (Step 10). Exact after the fix.
- **`TypeError: float() argument must be a string or a real number, not 'NoneType'`** for task 124: `kiln_eval` serialized NaN and infinities as JSON `null`. Fixed in `d823fe8`: non-finite outputs are strings, as inputs already were.
- **`timeout after 900 s`** for every VideoMAE graph (task 34): conv3d over [1, 3, 16, 224, 224] is about 3 GMAC in the JS evaluator, at both levels. With 3 jobs and 3600 s each, all five graphs finish in 670–870 s and are within tolerance (bf16 worst 1.0e-2 relative).
- **The size limit:**
  - `skipped: 192397839 input elements exceed the CPU evaluator limit`: ernie-m-base, whose JSON request alone would be several GB;
  - 8016527: ernie tiny-random; 16527361: TrOCR; and the DNLNet graphs.
  - The rerun with a 40M limit covered TrOCR and the ernie tiny-random variants.
  - Two shape-generic families were too large even then. DNLNet ([2, 4096, 4096] to [8, 8192, 16384]; the one 33.5M-element variant crashed `kiln_eval` with no output, since its JSON request exceeds V8's string limit) ran with `KILN_NUMERICS_MAX_DIM=256`. ERNIE-M base (embedding 250002 x 768) ran with `KILN_NUMERICS_MAX_DIM=1024`: the vocabulary is capped, and the ids drawn from randint(0, 2) stay valid. Both graphs have no fixed shapes in their code, so the capped graph is the same program at a smaller size. Results: `numerics-dnlnet-256.json`, `numerics-ernie-1024.json`.

### What I learned
- The CPU numerical check is bounded by the JS evaluator, not by PyTorch. About 3 GMAC per graph is the practical limit at a 1 h timeout. Above it, the same lowering at a smaller shape (the ViViT variants, the unit tests) is the evidence.

### What was tricky to build
- **Ordering the evidence.** Several gate and numerics runs straddled commits `e0c2caf` and `d823fe8`. The final compile gate was therefore re-run at `e0c2caf`, after the last compiler-affecting commit. `d823fe8` touches only the CPU test bridge. `summarize_gates.py` lets a later numerics file replace an earlier record graph by graph, so every verdict in `gates.json` comes from code at or after the fix it depends on.

### What warrants a second pair of eyes
- **Replaying the 13 CPU-blocked families depends on `kiln-pattern-autowrap/2`.** That is the only part of the match the CPU could not exercise, and a GPU-host run of `658` is the cheap way to check it before the replay.
- **Reduced-size checks:** DNLNet (all 6 graphs) and the two ernie-m-base graphs were checked at capped dimensions, not at their benchmark sizes.
- **The tolerance verdict is mine, not PassBench's.** PassBench's own curve decides acceptance.

### What should be done in the future
- Stage `coverage-wave-replay-v1` on bling (coordinator). Before it, run `658 --trace dynamo` on the GPU host for the CPU-blocked tasks.
- **194:** a pattern strategy for Dynamo-inlined functionals (for example, generate the pattern from a Dynamo capture of the source).
- **262222d765f0 (RECT_L/GAE):** the data-dependent mask shape stays out of scope.

### Code review instructions
- Evidence lives under `ttmp/2026/11/01/integration-evidence-kiln-006-011/coverage-wave-v1/`. Read `gates.json` first, then `compile-gate.json`, `simulation-dynamo-cpu.json`, the `numerics-*.json` files and `census-v2.json.gz`. Check them against `SHA256SUMS`.
- The plan is `ttmp/2026/10/30/KILN-005-*/sources/coverage-wave-replay-v1/plan.json`. Recompute each task's `graph_list_sha256` from `upstream/<sample>/graph_list.txt`.

### Technical details
- Plan tasks (index: graphs): 8:3, 13:4, 22:2, 29:11, 30:3, 34:5, 40:6, 43:5, 44:2, 50:2, 53:3, 68:3, 70:2, 71:6, 84:2, 90:3, 117:3, 124:4, 129:5, 155:6, 158:2, 170:3, 179:9 (plan.json sha256 `9f6b0a273174cbab51ac1b99c5acd1a937c46fd286d2d2fcb3a0a7920d8ae4e0`).
- Plan selection: `summarize_gates.py` replay = numerics with no outside/error verdict, a compile gate pass, and no genuine simulation mismatch; a CPU-blocked capture does not exclude a family.
- Census: 2058/2060 graphs (1961 before), 199/200 complete families (175 before), 0 regressions, 97 gained.

## Step 12: GPU round 2: CUDA-capture matcher simulation, the coverage-wave replay and two autowrap/2 regression replays

The coordinator ran the coverage wave's GPU hand-offs on bling, one job at a time, from commit `4dd38ba`. The coverage-wave replay accepts 16 of 23 newly importable families (66/94 graphs). The two regression replays (typed-slice3, and the mutation set) accept exactly what they accepted before `kiln-pattern-autowrap/2`: 10/10 with 45/45 graphs, and 9/16 with 96/138 graphs. The new pattern tracer changes how every rule's pattern is traced, and it regressed nothing measured.

### Prompt Context

**User prompt (verbatim):** "ok do it" (see Step 9).

**Assistant interpretation:** After the coverage agent's hand-off, run the GPU-side checks it requested (658 on a CUDA host for the CPU-blocked families), then the frozen replay, then guard the global `autowrap/2` change with regression replays.

**Inferred user intent:** Turn the import-coverage gain into PassBench-accepted families without breaking accepted ones.

**Commit (code):** none in this step; evidence and diary only.

### What I did
- **Staged `coverage-wave-replay-gpu-v1`** (641; source `4dd38ba`; 23 tasks, 94 graphs).
- **Ran KILN-005 script 658 `--trace dynamo` on bling in the evaluator image** for the 14 families blocked on CPU: 1/14 ok. 658 captures on `meta` tensors, and a graph that moves tensors with `.to(cuda)` fails during capture with `found two different devices meta, cuda:0`, on a GPU host as well.
- **Wrote `658-cuda-capture.py`,** a copy that captures on a real device (`KILN_SIM_DEVICE`, default `cuda`) with zero-filled inputs. Ran it once per task in separate processes, on all 23 plan tasks.
- **Launched the coverage replay in tmux,** then queued `typed-slice3-autowrap2-gpu-v1` and `mutation-inplace-autowrap2-gpu-v1` (the same plans as Step 8, staged at `4dd38ba`) through 651. Collected all three with 669.

### Why
- `kiln-pattern-autowrap/2` (Step 10) changes how `evaluate_normalized.py` traces every rule's pattern. Replaying two previously accepted sets at the new revision is the direct regression check.
- Capture on real CUDA matches the evaluator, which runs `torch.compile` on CUDA tensors.

### What worked
- **CUDA-capture 658: 22 of 23 tasks give identity ok on every graph.** This includes all 13 that were blocked on CPU, so autowrap/2 patterns match the Dynamo graphs.
- **Coverage replay:** 16 families fully accepted, 66/94 graphs, 0 unexecuted. Accepted families with their scores:

  | Family | Score | Family | Score |
  |---|---|---|---|
  | 8 | 0.822 | 70 | 0.968 |
  | 13 | 1.038 | 71 | 0.824 |
  | 30 | 0.932 | 84 | 0.894 |
  | 43 | 0.931 | 90 | 0.813 |
  | 50 | 0.810 | 117 | 1.073 |
  | 53 | 0.892 | 129 | 0.896 |
  | 68 | 1.240 | 155 | 0.969 |
  | 158 | 1.086 | 179 | 1.219 |

- **Regressions:** typed-slice3 at autowrap/2 is 10/10 families and 45/45 graphs; the mutation set is 9/16 and 96/138. Both are the same acceptance as Step 8.

### What didn't work
- **The first CUDA-capture run used `torch.empty`.** Uninitialized int64 index inputs made `embedding` raise `CUDA error: device-side assert triggered`, which poisons the context for every later task in the process. Fixed with `torch.zeros` and one process per task.
- **Root-owned outputs.** The container wrote its outputs as root, so a host-side `rm -rf` failed with `Permission denied` and the `&&` chain stopped. Cleanup now runs inside the container, followed by `chown`.
- **Seven coverage families are not accepted:**
  - **170 (0/3):** `BackendCompilerFailed ... An error occurred when running the 'KilnPattern0000' pass`, the same rule failure that 658 shows as `KeyError: in_0`.
  - **29 (0/11):** every graph is `correct` at the nominal tolerance (−5) but `matches=2`. The rule applies twice per graph, so it is not accepted, although its score is 1.018. On zero-filled CUDA inputs, 658 reported identity ok with one match. A pattern occurring twice in the Dynamo graph is the likely cause; I have not verified it.
  - **22 (0/2), 44 (0/2), 124 (2/4):** correct only at tolerance −4 or −3. These are numerics, probably bf16/f16 rounding points.
  - **34 (1/5):** one `Eager model execution failed: Environment fluctuation detected.` and three correct only at −4.
  - **40 (2/6, DNLNet):** two graphs correct only at tolerance 1 and two at none. This is the family the agent could check only at reduced dimensions (Step 11).

### What I learned
- 658 on `meta` cannot judge any graph that moves tensors to `cuda`, on any host. The CUDA-capture variant is the usable gate for such families.

### What was tricky to build
- **Separating a gate artifact from a real failure.** The first 22-of-23 failure was a single poisoned CUDA context, not 22 failures.

### What warrants a second pair of eyes
- **Family 29's double match** is a pattern-uniqueness question for the rule generator, not numerics.
- **Families 22, 44, 124 and 34** need per-graph error localization against the GPU reference.

### What should be done in the future
- Diagnose 170's `KeyError: in_0` in the generated rule's replacement.
- Explain 29's two matches. If they are two real occurrences, the generator should emit a pattern that matches once, or the acceptance rule should allow repeated identical matches.
- Find the rounding point responsible for 22, 44, 124 and 34.
- Check DNLNet (40) at full size on the GPU.
- Make `658-cuda-capture.py` the default capture path in a ticket script; it is evidence-only for now.

### Code review instructions
- Audits: `ttmp/2026/10/30/KILN-005-*/sources/{coverage-wave-replay,typed-slice3-autowrap2,mutation-inplace-autowrap2}-gpu-v1/results-audit.json`.
- Simulation evidence: `ttmp/2026/11/01/integration-evidence-kiln-006-011/coverage-sim658-gpu-v1/` (`658-cuda-capture.py`, `sim658.log`, `sim658-cuda.log`, `simulations.tar.gz`).

### Technical details
- Source revision `4dd38bac3928fb461dd7bdd9c5f208741df94beb` for all three studies; evaluator image `sha256:222d8b18…f2ba`.
- Run times on GB10: coverage 14:34–14:41, typed-slice3 14:41–14:44, mutation set 14:44–14:52.

## Step 13: Coverage fix, part 1: family 29's second match is a Dynamo recompile, family 170's slice assignment was unreachable for the matcher

This step starts the repair of the seven coverage-wave families that the Step 12 replay did not accept. The two match failures came first, because neither is numerical. Family 29 (TinyLlama/SmolLM3 masks, 0/11) is not a pattern problem. The source graph calls `torch.set_grad_enabled(False)`, so the first compiled call leaves grad mode off. The next call fails Dynamo's `GLOBAL_STATE changed: grad_mode` guard and recompiles the frame, and the backend applies the same rule, with the same specialization, a second time. Each compilation has exactly one match. Family 170 (OPT causal mask, 0/3) was a generator bug. A slice assignment `x[...] = v` traces to an `operator.setitem` node with no users. `SubgraphMatcher` searches backwards from the returned values, so it never reached that node, nor the argument `in_0` that only the write reads. The generator now binds each slice assignment to a name and returns it, as it already did for unused in-place results (`kiln-pattern-autowrap/3`). The program side records that slot as `{'none': True}`.

### Prompt Context

**User prompt (verbatim):** "go ahead, bling is free" (in reply to the coordinator's recommended next steps: fix 29's double match, fix 170's rule bug, localize the rounding point for 22/44/124/34, check DNLNet (40) at full size on the GPU)

**Assistant interpretation:** Diagnose and, where possible, fix each of the seven failing coverage families on the integration branch. Use bling for short single-graph diagnostic runs only (no full replays). Then freeze a re-replay plan of the fixed families, after the CPU compile gate and the CUDA-capture 658.

**Inferred user intent:** Turn the 16/23 coverage-wave result into as many accepted families as the defects allow, and separate Kiln defects from evaluator artifacts with exact evidence.

**Commit (code):** see the commit that adds this entry — "Coverage fix: return slice assignments from match patterns (kiln-pattern-autowrap/3)"

### What I did
- **Read the evidence.** I unpacked `coverage-wave-replay-gpu-v1/results-raw.tar.gz` into `scratchpad/coverage-fix/raw`. Then I counted `[Processing]` and `Applied` lines per task: every task had one `Applied` per graph, except task 29 (11 graphs, 22 `Applied`) and task 170 (3 graphs, 0).
- **Family 29 on bling.** I set up `~/passnet-kiln/coverage-fix/` with copies of the staged study's `upstream/`, `kiln/` and `results/task-029`, `results/task-170` (the generated runtime has the absolute path `/work/results/task-NNN/corpus` baked in, so the copies had to sit at `results/`). I wrote `run1.sh`, which runs one manifest graph through `evaluate_normalized.py` exactly as `run_task.py` does (warmup 2, trials 3). Then I ran graph 0 of task 29 with `TORCH_LOGS=recompiles,graph_breaks` in the evaluator image.
- **Family 170 on CPU.** I reproduced the matcher failure with `scratchpad/coverage-fix/t170old.py`: the replay's own `KilnPattern0000.py` and the source `model.py`, with `device(type='cuda', index=0)` replaced by `device(type='cpu')`, captured by TorchDynamo on CPU.
- **Fix (170):**
  - `generate_pass.extract_pattern`: `PreserveInPlace.visit_Assign` rewrites `x[index] = value` to `kiln_setitem_K = kiln_setitem(x, index, value)` (`from operator import setitem as kiln_setitem`). `inplace_call` recognizes it, so `drop_dead_statements` keeps it when the receiver chain is live and returns its name after the source's returns.
  - `fx_normalize.trace_pattern` autowraps `operator.setitem`, so the call is a node with a result. The banner is now `[kiln-pattern-autowrap/3]` in `evaluate_normalized.py`.
  - `corpus.expose_inplace_results` also returns `operator.setitem` nodes without users.
  - `fx_import.import_graph` binds a setitem node to the sentinel `NO_RESULT`. `flatten` records it as `{'none': True}`.
  - `dispatch.count_outputs` counts it as 0, and `restore_outputs` returns `None` for it.
- **Checks:** `scratchpad/coverage-fix/t170.py` runs the new pattern, the Dynamo capture (CPU), the matcher, and then upstream `_replace_pattern` with `FixedPatternReplacementPass._make_multi_output_replacement` and `replacement_core_decorator`. The KILN-008 compile gate ran on task 170 (`scratchpad/coverage-fix/gate170`). The numerics check against eager CPU used a copy of `numerics.py` (`coverage-fix-v1/numerics.py`) that skips `{'none': True}` slots.
- **Tests:** `test_pass_generation.test_slice_assignment_is_returned_and_matches` (Dynamo capture on CPU, one match, two returning nodes, one placeholder) and `test_slice_assignment_is_a_valueless_program_output` (`translate_graph` structure, `count_outputs`, `restore_outputs`).

### Why
- **29 cannot be fixed in the generator.** The recompile is caused by a global side effect of the source program that lies outside the matched subgraph. Both compilations see the same computation and apply the same rule. The only generator-side way to avoid the recompile is to drop the source's `set_grad_enabled(False)`, which would change the program's observable global state. I did not do that.
- **Returning the write, not computing it.** FX codegen binds a setitem node to its receiver (`clone[...] = 0; setitem = clone`), but at run time `operator.setitem` returns `None`, and in the captured graph the node has no users. Returning the receiver from the Kiln program would add a tensor write for a value nobody reads. A valueless slot `{'none': True}` costs nothing. Upstream's replacement code then binds the (unused) target setitem to a dead `getitem`.
- **A new protocol banner.** Only patterns that call `kiln_setitem` by name are traced differently. Every older rule spells slice assignment as `x[i] = v` or not at all, and traces exactly as under `/2`. The replay log should still say which tracer produced the match.

### What worked
- **29, recompile confirmed** (`coverage-fix-v1/family29-recompile.log`):
  ```
  [PassMgrBackend] Applied 1 replacements with KilnPattern0000.
  ... [0/1] [__recompiles] Recompiling function forward in .../TinyLlama-1.1B-Chat-v0.4_start3_end24_1/model.py:6
  ... [0/1] [__recompiles]     triggered by the following guard failure(s):
  ... [0/1] [__recompiles]     - 0/0: GLOBAL_STATE changed: grad_mode
  [PassMgrBackend] Applied 1 replacements with KilnPattern0000.
  ```
  `pass_bench/torch/test_compiler.py` `test_single_model` runs the compiled model first: `compiled_bench.warmup()` (grad on at the first call), then the trials. The source's `_set_grad_enabled = torch.set_grad_enabled(False)` turns grad off for every later call.
- **The discrepancy with 658 is explained.** `658-cuda-capture.py` calls the compiled model once (`torch.compile(...)(*inputs)`), so it sees one compilation and one match.
- **170, fixed pattern:** one match with 2 returning nodes on the Dynamo graph. The upstream replacement applies (`replaced 1`), and the rewritten graph runs and returns one `[1, 1, 21, 21]` tensor.
- **170 gate and numerics:**
  - compile gate `170 3/3` (internal reference check on);
  - every manifest structure is `{'tuple': [{'output': 'out0'}, {'none': True}]}`;
  - numerics against eager CPU: exact on all 3 graphs (`coverage-fix-v1/numerics-170.json`).
- **Suites:** `npm test`: all 62 passed (exit 0). `pytest -q`: 220 passed, 7 subtests passed (exit 0).

### What didn't work
- **The first bling run failed before evaluation.** `FileNotFoundError: [Errno 2] No such file or directory: '/work/results/task-029/corpus/manifest.json'` from `_kiln_generated_runtime.py` line 2 (`DISPATCH=CorpusDispatch('/work/results/task-029/corpus',...)`). The generated runtime has the staged absolute path; I renamed `orig/` to `results/`.
- **The diagnostic run itself ends in `Compiled model execution failed: Environment fluctuation detected. IQR/median = 55.1% (threshold: 20%)`.** That is with 3 trials, where the first trial includes warm caches (0.39 ms vs 0.17 ms). It is an artifact of my reduced trial count, not of the graph. The same check is what family 34's single `Eager model execution failed` reports (Step 14).
- **The old 170 rule, reproduced on CPU** (`t170old.py`):
  ```
  File ".../torch/fx/passes/utils/matcher_utils.py", line 376, in <listcomp>
    match.nodes_map[pn] for pn in self.pattern_placeholder_nodes
  KeyError: in_0
  ```
- **The first `numerics.py` copy asserted that the eager value of the setitem slot is `None`.** It failed on all three graphs (`AssertionError: a returned slice assignment is None in eager PyTorch`): FX codegen binds the node to its receiver tensor. The slot is now skipped, not compared.
- **A first harness for the replacement used `torch.fx.wrap('fake')` on a script-level function.** The tracer traced into it, and the rewritten graph failed with `AttributeError: 'GraphModule' object has no attribute '_tensor_constant0'`. Using upstream's own `set_g_replacement_func` and `replacement_core_decorator` fixed the harness.

### What I learned
- **A pattern node that no returned value depends on is invisible to `SubgraphMatcher`.** `match.placeholder_nodes` is built from `nodes_map` after the backward search, so an argument read only by such a node raises `KeyError`, not "no match". `operator.setitem` is impure, so the matcher's dead-code assertion does not catch it.
- **Kiln's audit counts `Applied 1 replacements` per graph block, across compilations** (`summarize_task_run.py`: `matches=blocks[index].count('Applied 1 replacements')`, accepted only if `matches==1`). PassBench's own scorer gave 29 a score of 1.018. The `matches==1` rule is Kiln's own audit.

### What was tricky to build
- **The pattern AST and the importer must agree on the order of the extra returns.** `drop_dead_statements` appends unused in-place names in statement order, and `expose_inplace_results` appends nodes in graph order. Setitem statements now join both lists in the same way, so `output_permutation` lines them up. The importer emits a valueless leaf rather than a Kiln output, so `count_outputs` must not count it. Otherwise `CorpusDispatch`'s conflict check between variants would compare unequal output counts.

### What warrants a second pair of eyes
- **Family 29's acceptance.** Every graph is correct at −5, with one match per compilation and two compilations, caused by the source's `set_grad_enabled(False)`. Whether the audit should count matches per compilation (it would accept 29, 11/11) is a protocol decision for the coordinator. I did not change `summarize_task_run.py`.
- **`{'none': True}`** is a new output-structure leaf. `check_corpus_cuda.check_structure` and other checkers compare against the source model's outputs, which do not include exposed in-place results anyway. That is an existing limitation, and it is unchanged here.

### What should be done in the future
- If the protocol keeps `matches==1` per graph, family 29 stays unaccepted for a reason outside Kiln. Otherwise, count matches per backend invocation in `summarize_task_run.py`.

### Code review instructions
- `integrations/passnet/generate_pass.py`: `SETITEM`, `inplace_call`, `PreserveInPlace.visit_Assign`. `fx_normalize.trace_pattern` (autowrap list). `corpus.expose_inplace_results`. `fx_import.NO_RESULT` and `flatten`. `dispatch.count_outputs` / `restore_outputs`.
- Run `(cd integrations/passnet && python3 -m pytest -q test_pass_generation.py)`.

### Technical details
- Evidence: `ttmp/2026/11/01/integration-evidence-kiln-006-011/coverage-fix-v1/`: `family29-recompile.log` (bling, evaluator image, `TORCH_LOGS=recompiles,graph_breaks`), `run1.sh`, `numerics.py`, `numerics-170.json`.
- The new 170 pattern ends `kiln_setitem_0 = kiln_setitem(tmp_10, (slice(None, None, None), slice(None, None, None), slice(None, None, None), slice(None, 21, None)), tmp_17)` ... `return (tmp_22, kiln_setitem_0)`.

## Step 14: Coverage fix, part 2: the rounding point of 22, 44, 124 and 34 is the vendor library's, not Kiln's

For each graph of the four tolerance-limited families I compared, on GB10, Kiln's compiled output with eager PyTorch in the graph's dtype and with a float64 reference. I then ran "hybrids": eager interpretation of the source graph in which one node at a time is computed from its eager arguments in float64 (or float32) and rounded to its dtype. The result is the same in all four families. Kiln's contraction (patch conv3d, grouped conv1d, linear) is the correctly rounded value, or within a few elements of it. The eager reference's cuDNN/cuBLAS contraction is not. PassBench's −5 tolerance has `atol = 1e-5`, which turns those 1-ulp disagreements into failures where the output cancels toward zero (34: conv + position embedding) or where LayerNorm amplifies them (22, 44). Even the exactly computed graph (`all@f64`) fails against eager at −5. Family 124 is the clearest case. Eager `linear` for GAE's [1000, 32] × [32, 16] equals, bit for bit, a split-K reduction: K in four chunks of 8, each chunk sum rounded to bf16/f16, then summed. That is cuBLAS under PyTorch's default `allow_{bf16,fp16}_reduced_precision_reduction=True`. None of this is a Kiln rounding-policy defect, so I changed no code for these families. Family 34's extra failure is PyTorch's own eager timing check.

### Prompt Context

**User prompt (verbatim):** see Step 13.

**Assistant interpretation:** Localize, per graph and output, where Kiln's result departs from eager CUDA PyTorch, and fix Kiln if its rounding policy is the cause.

**Inferred user intent:** Either recover four families or know precisely why they cannot be recovered.

**Commit (code):** none in this step (diagnostics and evidence only; committed with Step 15).

### What I did
- **`coverage-fix-v1/localize.py`** (runs in the evaluator image). For each manifest variant of a compiled corpus:
  - evaluator inputs (`get_input_dict`, device cuda) and runtime seed 1024;
  - Kiln through `CorpusDispatch` (with the record's specialization, outputs mapped back with `output_permutation`);
  - eager on clones of the same inputs, and the same model on float64 copies;
  - per output: max |kiln − eager|, |kiln − f64|, |eager − f64|, the number of differing elements, how many elements of each are the float64 value rounded to the dtype, PassBench's allclose failures at −5/−4/−3 (`pass_bench.datatype_tolerance_config.get_precision`), and the worst elements;
  - hybrids `node@f64` / `node@f32` / `all@f64` / `all@f32` via an `fx.Interpreter` subclass (in-place nodes are never replaced), each compared with Kiln and with eager.

  I ran it on the replay's own compiled corpora (`results/task-0{22,44,124,34}/corpus`, source `4dd38ba`) on bling.
- **`coverage-fix-v1/probe-reductions.py`**: for every linear/conv1d/conv3d call of these graphs, I counted elements equal to eager for the candidates correct (f64 rounded once), f32 accumulation, reduced-precision reduction off, split-K with c ∈ {2, …, 64} (two reduction orders) and sequential dtype accumulation, plus three bias variants.
- **Family 34's eager failure:** read `results/task-034/benchmark.log` lines 216–224.

### Why
- **Hybrids answer "which node's rounding would make eager agree with Kiln".** A graph-level max diff cannot tell a conv-accumulation difference from a LayerNorm or bias-placement difference. Replacing one node with its correctly rounded value and counting the remaining disagreements does.
- **The probe tests a concrete hypothesis per contraction.** If eager equals a reproducible formula, Kiln could adopt it as a policy. If eager equals none, the difference is an algorithm choice inside the vendor library.

### What worked
- **22 (ViViT; conv3d patch embedding → cat → + pos → LayerNorm):**
  - f16: Kiln vs eager differ in 5571 elements, 175 fail at −5, all in the LayerNorm output (worst `kiln 3.1484375, eager 3.15234375, f64 3.150110053058976`).
  - With only the conv computed exactly (`conv3d@f64`), the disagreement with Kiln drops to 1493 / 45, while eager's own disagreement with that hybrid is 5415 / 161.
  - bf16: 216 differ, 1 fails at −5.
  - `localize-022.json`.
- **44 (SEW; grouped conv1d → GELU → + avg-pool → LayerNorm):**
  - f16: 154 differ, 11 fail; `conv1d@f64` vs Kiln 48 / 0, vs eager 141 / 11.
  - bf16 (this draw): 33 differ, 0 fail; `conv1d@f64` vs Kiln 2.
  - `localize-044.json`.
- **124 (GAE/RECT_L; linear without bias):**
  - GAE bf16: 6428 / 16000 differ, 672 fail at −5 (36 at −4). Kiln equals the rounded f64 value in 16000 / 16000 elements, eager in 9572. GAE f16: 6239 differ, 273 fail; Kiln rounded in 15996, eager in 9761. `linear@f64` vs Kiln: 0 differ (bf16), 4 (f16).
  - The two RECT_L graphs ([128, 128] output) agree; their cuBLAS kernel is not split-K.
  - Probe, GAE linear ([1000, 16], 16000 elements):

    | candidate | bf16 equal to eager | f16 equal to eager |
    |---|---|---|
    | correct (f64 rounded once) | 9560 | 9556 |
    | f32 accumulation | 9560 | 9556 |
    | reduced-precision reduction off | 9560 | 9558 |
    | splitK-2 / -4 / -16 | 8092 / 8137 / 8661 | 8005 / 8210 / 8645 |
    | **splitK-8** (chunk sums rounded to dtype, summed in f32) | **16000** | **15998** |
    | splitK-8, sequential in dtype | 10799 | 10663 |
    | sequential dtype accumulation | 4336 | 4327 |
- **34 (VideoMAE; conv3d tubelet → + position embedding):**
  - f16: 237 / 23 and 240 / 27 (differ / fail at −5); `conv3d@f64` vs Kiln 47 / 5 and 46 / 2, vs eager 236 / 26 and 242 / 25.
  - bf16: 5 / 0 and 11 / 1. f32: 0 fail.
  - `localize-034.json`.
- **Bias placement is right:** for every conv in the four families, `eager-nobias + bias (rounded in the dtype)` equals eager on every element (e.g. 1204224 / 1204224 for VideoMAE f16). cuDNN adds the bias in a separate dtype-rounded step, which is Kiln's policy (Step 9's open question is settled).
- **No reproducible formula for cuDNN's unbiased conv:** the best candidate, the correctly rounded value, matches 1200990 / 1204224 (VideoMAE f16), 749947 / 752640 (ViViT f16) and 95576 / 96000 (SEW f16). Every split-K order matches fewer elements than that. Kiln's conv output equals the correctly rounded value at nearly every element (`kiln_is_rounded_f64`).
- **34's `Eager model execution failed: Environment fluctuation detected. IQR/median = 22.3% (threshold: 20%)`** is in the eager phase, after Kiln's compiled phase finished. The raw trial times rise from ~0.88 ms to ~1.1–1.19 ms over the last ~25 trials. It is timing noise in PyTorch's own measurement.

### What didn't work
- **The f32 hybrids (`node@f32`) do not model "f32 accumulation"** for convs: cuDNN's float32 conv uses TF32 by default (`torch.backends.cudnn.allow_tf32=True`). `conv3d@f32` is therefore *further* from Kiln than plain eager (ViViT f16: 23211 differ). I used the f64 hybrids and the explicit probe instead.
- **Inputs are not deterministic between runs.** `get_input_dict` replays random tensors without a fixed seed. The SEW bf16 graph failed at −4 in the replay but has 0 failures in my draw. The counts are per draw; the pattern (Kiln ≈ correctly rounded, eager not) holds in every draw.

### What I learned
- **At −5 PassBench needs bit-level agreement wherever the output is small or amplified.** For f16 the bound is `1e-5 + 1e-3·|ref|`, for bf16 `1e-5 + 1.58e-2·|ref|`. A 1-ulp disagreement in a conv output becomes several ulps after LayerNorm's `1/σ` (22, 44). A sum that cancels toward zero meets the `1e-5` absolute floor (34).
- **cuBLAS's split-K kernel for GAE's shape is exactly "chunks of 8 rounded to the storage dtype".** PyTorch allows this through `allow_bf16_reduced_precision_reduction` / `allow_fp16_reduced_precision_reduction` (default True). With the flags off, eager is correctly rounded, like Kiln.

### What was tricky to build
- **Mapping Kiln outputs back to source order.** `CorpusDispatch` returns rule-ordered outputs (`output_permutation`), plus exposed in-place results after them. The localizer inverts the permutation and drops the extra results before comparing.

### What warrants a second pair of eyes
- **Whether Kiln should emulate vendor reduction orders.** Matching GAE would mean a "split-K 8 in the storage dtype" policy for low-precision GEMMs of exactly the shapes for which cuBLAS on GB10 picks that kernel. That is a heuristic of one library version on one GPU, not PyTorch semantics, and it makes Kiln less accurate. I did not implement it. For the convs, no formula reproduces cuDNN at all.

### What should be done in the future
- If the protocol owner wants these families, the honest options are evaluator-side: compare at −4 for bf16/f16 contractions, or run eager with reduced-precision reductions off. The latter is a protocol change; it is not mine to make.

### Code review instructions
- `ttmp/2026/11/01/integration-evidence-kiln-006-011/coverage-fix-v1/localize.py`, `probe-reductions.py`, and the outputs `localize-0{22,34,44}.json`, `localize-124.json`, `probe-reductions.log`.

### Technical details
- Run command (bling, one job at a time, GPU idle checked): `sg docker -c 'docker run --rm --gpus all -v $PWD:/work -w /work --entrypoint bash localhost:5000/playback-redaction:base-26.05 -c "python3 localize.py --kiln /work/kiln --upstream /work/upstream --corpus /work/results/task-022/corpus --output /work/loc-022.json; chown -R 1000:1000 /work"'`.
- `get_precision(t, dtype)`: f16 `(10^(t·3/5), 10^t)`, bf16 `(10^(t·1.796/5), 10^t)` as (rtol, atol).

## Step 15: Coverage fix, part 3: DNLNet at full size, two rounding defects and an evaluator protocol limit

At full size on GB10, a single DNLNet call already agreed with eager at −5. Its output is a softmax, which hides the defect. The mutated input (`in_0 /= 16; in_0 /= 0.05`) differed from eager in 12% (bf16) and 33% (f16) of the elements. The evaluator calls the model 121 times on the same tensors, so the difference compounded. I found two Kiln defects that together caused it:
- the importer used the float32 value of a 0-d CUDA tensor operand, where CUDA PyTorch first converts it to the other operand's dtype (bf16(0.05) = 0.050048828125);
- Kiln's constant folding dropped the rounding of a float16/bfloat16 constant, so even the explicit cast compiled to `/ 0.05f`.

With both fixed, every bf16 and f32 graph matches eager bit for bit, in a single call and under the evaluator's exact call protocol. The two f16 graphs remain unacceptable for every compiler. Each call scales the shared input by 1.25, the input overflows f16 to `inf` during the compiled phase, and both Kiln and eager then return all-NaN outputs, which PassBench's allclose rejects.

### Prompt Context

**User prompt (verbatim):** see Step 13.

**Assistant interpretation:** Run family 40 at its benchmark sizes on the GPU, find the large error and fix it.

**Inferred user intent:** Recover DNLNet or know exactly why not; the CPU check at reduced dimensions (Step 11) could not see this.

**Commit (code):** see the commit that adds this entry — "Coverage fix: 0-d CUDA operands convert to the common dtype; float16/bfloat16 constants hold rounded values"

### What I did
- **`coverage-fix-v1/probe-dnlnet.py`** reports four comparisons per graph:
  - semantics of `x /= torch.tensor(0.05, device='cuda')`;
  - a single Kiln call and a single eager call on clones (output and mutated input);
  - **protocol**: the evaluator's order on one shared tensor (121 Kiln calls, then 121 eager calls, last outputs compared);
  - **aligned**: 121 eager calls from a fresh copy.
- **`coverage-fix-v1/probe-zero-dim.py`**: for add/sub/mul/div, reversed and in place, on CPU and CUDA, with a Python number, a CPU 0-d tensor or a CUDA 0-d tensor beside a bf16/f16 tensor. It counts elements equal to the float32-value result and to the dtype-value result.
- **Importer fix (`fx_import.py`):**
  - `source_device(ctx, node)` infers the device the source gives each value: placeholders are CUDA (the evaluator's inputs); a factory is on its `device` argument (CPU without one); `.to(...)`/`.cuda()`/`.cpu()` move it; anything else is on CUDA if a tensor argument is. The importer records it per node in `Context.devices`.
  - `cuda_scalar_operand(c, j, text)`, called from `operand()`, narrows a 0-d CUDA operand beside a dimensioned f16/bf16 operand: `N.cast(v, "bf16")`. This covers binary arithmetic, in-place arithmetic, true division and comparisons.
- **Kiln fix (`packages/kiln/src/std/tensor.js`):** `lowPrecisionValue(v, dtype)` rounds a finite value to f16/bf16 when `N.full` creates a constant and when `convert` folds a cast of a splat constant (`convertScalar`).
- **Staging on bling:** `coverage-fix-v1/stage-task.sh` rsyncs the worktree to `~/passnet-kiln/coverage-fix/kiln-fix`. It exports and generates in the evaluator image, then compiles on the host with the plan's settings (a100, separate contraction, tf32, mutation strategy auto, no internal check).
- **Tests:**
  - `test_fx_devices.py` (3 tests): DNLNet's two in-place divisions are narrowed; CPU 0-d tensors, Python numbers and f32 results are not; `.cuda()`, `.to('cuda')`, comparisons, reversed operands and a 0-d input.
  - `packages/kiln/test/low-precision-constants.mjs`: the kernel divides by `0.050048828125f` and holds f16's 0.3. Run against the old `tensor.js` it fails with `AssertionError [ERR_ASSERTION]: the kernel divides by bfloat16's 0.05`.
  - `test_fx_import.ExpectBindingTests` now expects `N.mul(v0, N.cast(v1, "f16"))` for a 0-d input.
- **Blast radius:** `scan-zero-dim-casts.py` (2060 census graphs: the rule changes 4 graphs, all DNLNet) and `scan-low-precision-constants.py` (inexact f16/bf16 splats or casts of f32 constants: the same 4 graphs, no others).

### Why
- **The importer is the layer that knows devices.** Kiln's elementwise semantics are device-agnostic, and they match PyTorch for Python numbers and CPU scalars (opmath float32 value). Only the importer sees `device=cuda` in the source. Putting the device rule in Kiln core would need a device notion on every value.
- **Constant rounding belongs in Kiln.** A tensor of dtype bf16 must hold a bf16 value; the importer cannot fix what the folding discards. PyTorch's `torch.full(..., dtype=bf16)` and `.to(bf16)` both round.

### What worked
- **CUDA semantics** (`probe-zero-dim.log`, GB10):
  - a CUDA 0-d operand is converted to the dtype in 42/42 cases (6 ops × 3 values × 2 dtypes, plus in place);
  - Python numbers and CPU 0-d tensors enter as float32 values (add, sub, mul and rsub match exactly; division by them is not plain float32 division, see below).
  - `probe-dnlnet-4dd38ba.log`: `x /= torch.tensor(0.05, device='cuda')` matches the dtype divisor in 1048576/1048576 elements (bf16 and f16), and the f32 divisor in only 906118 (bf16) and 675732 (f16).
- **Before vs after, at full size** (`probe-dnlnet-4dd38ba.log`, `probe-dnlnet-fixed.log`):

  | graph | single output (−5) | mutated input differ | protocol (−5) | aligned (−5) |
  |---|---|---|---|---|
  | bf16 [12,4096,4096], 4dd38ba | pass | 24928675 | **fail** (4169 differ, max 0.833) | fail |
  | bf16 [12,4096,4096], fixed | pass | **0** | **pass** (0 differ) | pass (0) |
  | bf16 [2,4096,4096], fixed | pass | 0 | pass (0) | pass (0) |
  | f32 [12,…], [64,…], fixed | pass | 0 | pass (0) | pass (0) |
  | f16 [12,…], [16,…], both | pass | 0 after the fix | fail: all NaN in both | fail: all NaN |

- `input_absmax_after_kiln_phase` for f16 is `Infinity`. For bf16 it is 5.26e10 (start 0.115).
- **Generated kernel after the fix:** `v0 = (in0 / 16.0f); ... v2 = (v1 / 0.050048828125f);` (it was `v2 = (v1 / 0.05f);`).
- **Suites:** `npm test`: all 63 passed (exit 0). `pytest -q`: 223 passed, 7 subtests passed (exit 0).

### What didn't work
- **The importer fix alone changed nothing on the GPU.** The re-probe still showed `mutated_input differ 24922534`. The kernel dump showed the cause: `N.cast(v5, "bf16")` of the splat `N.full([], 0.05, "f32")` folds in `convert` (`tensor.js`) through `convertScalar`, which returned `Number(v)` for float targets. That is the second defect.
- **First device inference bug:** `torch.tensor(0.05, device=cuda)` exports its kwargs as `{'dict': {'device': {'device': 'cuda:0'}}}`. My recursive search treated the outer `{'device': {...}}` as a device spelling and decoded `"{'device': 'cuda:0'}"` as CPU. Only the constant with two kwargs (`dtype` and `device`) came out right. I fixed this by requiring a string value.
- **`.to('cuda')` with a string device was not recognized** (the test caught it); added.
- **Staging script errors:**
  - a redirect inside `sg docker -c "..."` ran on the host (`sh: 1: cannot create /work/fix/task-040/export.log: Directory nonexistent`);
  - the container's python lacked the module path (`ModuleNotFoundError: No module named 'corpus'`).

  Both were fixed in `stage-task.sh`.

### What I learned
- **TensorIterator treats a CPU scalar and a 0-d CUDA tensor differently.** The first is passed as an opmath scalar; the second is a regular operand converted to the common dtype. Because the importer propagates metadata on a CPU copy (Step 9), Kiln had silently adopted CPU semantics for constants the source puts on CUDA.
- **The f16 DNLNet graphs cannot pass under PassBench's protocol for any correct compiler.** The compiled and eager phases share one input dict, and each call multiplies the input by 1.25 in place. Only a compiler that does not perform the source's input mutation could keep the input finite.
- **Found in passing:** on CUDA, `x / 0.3` (Python number) matches neither the float32 division nor the dtype divisor (bf16: 258984/262144 vs 132037/262144), which suggests multiplication by a float32 reciprocal. Kiln divides. No current family needs a non-power-of-two Python divisor at low precision, so I did not change it.

### What was tricky to build
- **Two independent defects with one symptom.** Each fix alone leaves the kernel wrong: the importer cast is folded away, and the constant rounding never applies without the cast. Only the GPU kernel dump separated them.

### What warrants a second pair of eyes
- **`source_device` defaults:** a factory without `device=` is CPU, and a placeholder is CUDA. A future integration that runs graphs on CPU would need the evaluator's device passed in.
- **`lowPrecisionValue` changes every f16/bf16 splat.** The census scan finds no other affected graph, but hand-written Kiln programs using `N.full(..., "bf16")` with an inexact value now compute with the rounded value (PyTorch's semantics).

### What should be done in the future
- Python-number division on CUDA (reciprocal multiplication) as a separate, measured rule.
- Family 40 can reach at most 4/6. Family-level acceptance needs a protocol where the compiled and eager phases do not share mutated inputs.

### Code review instructions
- `integrations/passnet/fx_import.py`: `cuda_scalar_operand`, `operand`, `source_device`, `Context.devices`, the `ctx.devices[name] = ...` line in `import_graph`.
- `packages/kiln/src/std/tensor.js`: `lowPrecisionValue`, `N.full`, `convertScalar`.
- Run `node packages/kiln/test/low-precision-constants.mjs` and `(cd integrations/passnet && python3 -m pytest -q test_fx_devices.py test_fx_import.py)`.

### Technical details
- Evidence: `coverage-fix-v1/probe-zero-dim.{py,log,json}`, `probe-dnlnet.py`, `probe-dnlnet-4dd38ba.log` (replay corpus, source `4dd38ba`), `probe-dnlnet-fixed.log` (fixed tree, all 6 graphs), `zero-dim-cast-scan.json`, `low-precision-constant-scan.json`, `scan-*.py`, `stage-task.sh`.
- Protocol constant: `CALLS = 20 + 100 + 1` (warmup, trials, final output call), as in `PerformanceMeasurer.warmup/exec`.

## Step 16: Coverage fix, part 4: gates, single-graph evaluator checks and the frozen re-replay plan

I froze the fixed families into a re-replay plan after the two required gates, both on the committed tree `26243a3`: the CPU compile gate and the CUDA-capture 658 on bling. Two families qualify: 170 (3 graphs) and 40 (6 graphs). The plan is 2 tasks and 9 graphs, frozen but not launched. Before freezing, I ran the original evaluator (the `run_task.py` command line) on single graphs. All three 170 graphs pass with one replacement each. A bf16 DNLNet graph is bit-exact under the full warmup-20/trials-100 protocol. An f16 DNLNet graph fails at every tolerance, as Step 15 predicted.

### Prompt Context

**User prompt (verbatim):** see Step 13.

**Assistant interpretation:** Freeze a re-replay plan of the fixed families, with the coverage-wave plan's header, only after the CPU compile gate and the CUDA-capture 658 pass; do not launch it.

**Inferred user intent:** The coordinator stages one small, pre-qualified replay.

**Commit (code):** none (plan, evidence and diary). Code at `26243a3`.

### What I did
- **CPU compile gate:** `ttmp/2026/11/01/KILN-008-*/scripts/03-local-compile-gate-scan.py --upstream UPSTREAM --output scratchpad/coverage-fix/gate-final 170 40` (internal reference check on, `--matmul-precision highest`). Result: `coverage-fix-v1/compile-gate.json`.
- **CUDA-capture 658:**
  - rsynced the committed tree to `~/passnet-kiln/coverage-fix/kiln-fix` and copied `coverage-sim658-gpu-v1/658-cuda-capture.py` to its repository path there (the script resolves the repository as `parents[6]`);
  - ran it once per task (`--task 40`, `--task 170`) in the evaluator image against the candidate plan. Results: `coverage-fix-v1/sim-fix-040-simulation.json`, `sim-fix-170-simulation.json`.
- **Evaluator checks:**
  - `stage-task.sh 170 …` (fixed tree: export, generate, compile with the plan's settings);
  - `run1.sh` (now taking `KILN`, `WARMUP`, `TRIALS`) on all three 170 graphs (warmup 5, trials 20);
  - DNLNet graphs 2 (bf16 [2, 4096, 4096]) and 3 (f16 [12, 4096, 4096]) with warmup 20 / trials 100, the replay's protocol.

  Logs: `e2e-170-{0,1,2}.log`, `e2e-040-{2,3}.log`.
- **Plan:** `ttmp/2026/10/30/KILN-005-*/sources/coverage-fix-replay-v1/plan.json`. The header is copied from `coverage-wave-replay-v1/plan.json` (format, nominal tolerance −5, target, hardware, contraction separate, skip internal check, tf32, `import_census_sha256`, mutation strategy auto), with a new `band`/`selection`. Tasks are copied from the old plan after recomputing each `graph_list_sha256` from `upstream/<sample>/graph_list.txt`.
- **Evidence:** `coverage-fix-v1/SHA256SUMS` (30 files).

### Why
- **40 is in the plan although the family cannot be accepted.** Its four bf16/f32 graphs are the measurement of the Step 15 fix in the real evaluator. The plan's `selection` says that the two f16 graphs fail for every compiler.
- **29, 22, 44, 124 and 34 are not in the plan.** No code changed their outcome; replaying them would measure the same thing again (Steps 13–14).
- **`import_census_sha256` is unchanged.** The fixes change scripts, not import coverage: `coverage-census-v1/census.py` at `26243a3` reports `2058 2060`, the same count as `census-v2`.

### What worked
- **Compile gate:** `170 3/3`, `40 6/6` (8.1 s wall, 748 MB maximum RSS).
- **658 (CUDA capture, GB10):** `40 6/6 identity ok; 1 rules`, `170 3/3 identity ok; 3 rules`. Every record has `matches: 1` and `rule_errors: {}`; 170's graphs apply their own specializations 0, 1 and 2. Step 12's run had `170 0/3` with `KeyError: in_0`.
- **Evaluator, 170:** every graph prints `[kiln-pattern-autowrap/3] ...`, `Applied 1 replacements with KilnPattern000{0,1,2}`, `[Correctness][equal]: 1`, and `[Result] status: success`.
- **Evaluator, DNLNet bf16 [2, 4096, 4096]** (full protocol): `[Correctness][equal]: 1` and every allclose 1. **DNLNet f16 [12, 4096, 4096]:** `[equal]: 0` and every allclose 0, including `all_close_atol_1.00E+01_rtol_3.98E+00`.
- **Plan:** 2 tasks (40: 6 graphs, `08e69568…`; 170: 3 graphs, `11f07040…`), 9 graphs. `plan.json` sha256 `39a00cbf72419ce56f1374500f3695d6ded442752ad6cbaa60b9b6075b92f3a8`.

### What didn't work
- No failures in this step.

### What I learned
- **A single-graph evaluator run is the fastest whole-protocol check of a fix.** It runs the real pattern tracer banner, replacement, dispatch and PassBench comparison, at the cost of one graph's evaluation, and with no replay accounting.

### What was tricky to build
- **Two Kiln trees on bling.** The staged study's `kiln/` (source `4dd38ba`) reproduces the replay's artifacts. `kiln-fix/` is the fixed tree. The generated runtime bakes its corpus path into `_kiln_generated_runtime.py`, so each tree's corpora live where they were generated (`results/…` and `fix/…`).

### What warrants a second pair of eyes
- **The expected replay outcome:** 170 3/3 (accepted); 40 4/6 graphs (the bf16/f32 graphs), family not accepted. A different 40 result would mean the evaluator's input draws matter more than the probe showed.

### What should be done in the future
- The coordinator stages and runs `coverage-fix-replay-v1`, then decides on 29's match counting (Step 13) and on the evaluator's low-precision contraction tolerance (Step 14).

### Code review instructions
- Recompute: `sha256sum ttmp/2026/10/30/KILN-005-*/sources/coverage-fix-replay-v1/plan.json`; `(cd ttmp/2026/11/01/integration-evidence-kiln-006-011/coverage-fix-v1 && sha256sum -c SHA256SUMS)`.

### Technical details
- Bling working directory: `~/passnet-kiln/coverage-fix/` (`upstream/`, `kiln/` from the staged study, `kiln-fix/`, `results/` replay copies, `fix/` fixed corpora). Container outputs were chowned in the container after each run.
