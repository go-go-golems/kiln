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
**Commit (code):** see the merge commit "Merge KILN-011: integer floordiv/mod" (hash recorded in Step 7).

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
**Commit (code):** merge commit "Merge KILN-009: direct writes of mutated inputs".

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
**Commit (code):** merge commit "Merge KILN-010: index values, factories and slice assignment".

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
**Commit (code):** merge commit "Merge KILN-008: cumsum as a scan primitive"; follow-up "Integrate KILN-008: index values and exact literals in scan kernels".

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
**Commit (code):** merge commit "Merge KILN-006: tensor-core matrix products".

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
