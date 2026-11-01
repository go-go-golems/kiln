---
Title: Diary
Ticket: KILN-008
Status: active
Topics:
    - kiln
    - compiler
    - gpu
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/kernel.js
      Note: matScanThread, matScanRow (Hillis-Steele block scan), tv per-operand fix in matTiled
    - Path: repo://packages/kiln/src/std/loop.js
      Note: E.scan, schedule carried loop (step), pointExpr, scanFusionLegal, liftScan
    - Path: repo://packages/kiln/src/std/tensor.js
      Note: scanRef, tensor.scan, CUMULATIVE ops and decomposition
    - Path: repo://packages/kiln/src/std/tile.js
      Note: an.scan, legalMaps/forkTree/launch, estimateScan
    - Path: repo://packages/kiln/test/integer-arithmetic.mjs
      Note: existing integer cumsum CPU test read in Step 2
    - Path: repo://packages/kiln/test/scan.mjs
      Note: 'scan test: references, nest, fusion, simulator grid, race check, cost ranking'
    - Path: repo://packages/kiln/test/tiled-mixed-dtype.mjs
      Note: Phase 0 regression for the tv temporary
    - Path: repo://ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/01-inspect-cumsum-lowering.mjs
      Note: probe whose outputs Step 2 records
    - Path: repo://ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/02-scan-mapping-estimates.mjs
      Note: probe of scan mapping estimates and simulator checks
    - Path: repo://ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/03-local-compile-gate-scan.py
      Note: CPU local compile gate for the typed-slice3 families
    - Path: repo://ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/sources/local-compile-gate-scan-v1/gate.json
      Note: CPU compile gate 51/51 over typed-slice3 families at a07d481
ExternalSources: []
Summary: Chronological investigation diary for the KILN-008 cumsum-as-scan design guide.
LastUpdated: 2026-11-01T14:30:00-05:00
WhatFor: Record how the KILN-008 design guide was researched, what evidence it rests on and what remains open.
WhenToUse: Read before implementing the scan primitive or reviewing the design doc.
---

# Diary

## Goal

This diary records the research behind the KILN-008 design guide, "Cumsum as a scan primitive: analysis, design and implementation guide". Each step follows the investigation format of the diary skill and is written as the work proceeds.

## Step 1: Skill loading, ticket orientation and first reading of the pipeline

The goal of this step was to load the writing and bookkeeping rules, confirm the empty KILN-008 ticket, and read the code that the cumsum design depends on: the current `nn.cumsum` op and its decomposition in `tensor.js`, the Loop IR and scheduler in `loop.js`, and the Tile IR analysis and cost model in `tile.js`. By the end of the step the shape of the current O(n^2) lowering was confirmed against the source rather than taken from the brief.

Midway through this step the coordinator relayed a new user instruction that each agent keep its own diary in investigation format as it goes. I stopped reading and created this diary before continuing, so this entry is written during the work rather than after it.

### Prompt Context

**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**Earlier user question (verbatim):** "and can we build them with CPU only"

**Later user instruction relayed by the coordinator (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go"

**Assistant interpretation:** Write one intern-facing design guide for KILN-008 (cumsum as a scan primitive) inside the existing ticket, with a diary kept in investigation format step by step, related files, tasks, a changelog entry and a clean `docmgr doctor`. The parent agent handles the reMarkable upload. The guide must also answer whether the work can be built with only a CPU.

**Inferred user intent:** The user wants a self-contained handoff that lets a new engineer implement a real scan primitive in Kiln without first reverse-engineering the pipeline, and wants to know which parts of that work can proceed without access to the GPU host.

**Commit (code):** none; this is a documentation-only task and the instructions forbid committing.

### What I did

- Read `/home/manuel/.claude/skills/ticket-research-docmgr-remarkable/SKILL.md`, its `references/writing-style.md` and `references/deliverable-checklist.md`, `/home/manuel/.claude/skills/textbook-authoring/SKILL.md`, `/home/manuel/.claude/skills/docmgr/SKILL.md`, `/home/manuel/.claude/skills/diary/SKILL.md` and `references/investigation-entry.md`.
- Listed the ticket directory; it held only the scaffold (`index.md`, `tasks.md`, `changelog.md`, empty subdirectories). Sibling tickets KILN-006, -007, -009, -010 and -011 exist under `ttmp/2026/11/01/`.
- Ran `grep -n cumsum` over `packages/kiln/src`, `packages/kiln/test` and `integrations/passnet/*.py` to find every touch point.
- Read `packages/kiln/src/std/tensor.js` lines 1-130 (reference helpers, `cumsumRef` at 102-111), 330-360 (the `nn` op table; `cumsum` at 348-353), 440-460 (the `N` builder; `N.cumsum` at 453) and 476-618 (decompositions; `nn.cumsum` at 524-533).
- Read all of `packages/kiln/src/std/loop.js` (E expressions 50-64, `schedule` 96-159, `workOf` 190-202, `compileSerial` 213-239, `compilePoint` 242-266, lift rules 292-317, fusion 323-411).
- Read all of `packages/kiln/src/std/tile.js` (knobs 15-24, `analyze` 31-99, `legalMaps` 101-106, `forkTree` 107-130, `launch` 133-144, `timeModel` 154-197, `estimate` 205-285, `scheduleRule` and `costPrior` 354-365).
- Ran `docmgr doc add --ticket KILN-008 --doc-type reference --title "Diary"` (succeeded) and `docmgr doc add --ticket KILN-008 --doc-type design-doc --title "Cumsum as a scan primitive: analysis, design and implementation guide"` (still running at the time of writing; see below).

### Why

- The writing-style guide fixes the section order of the design doc and requires file:line evidence, so the source had to be read with `nl -ba` before any claim was written.
- The brief gave a summary of the current lowering; the instructions say to verify it, and the exact decomposition determines what the gap analysis must say.

### What worked

- The brief's description of the decomposition is accurate. `tensor.js:526-533` builds a view `spread` of shape `[...s, n]` that reads `x[.., j, ..]` with `j` the new last coordinate, a mask view of the constant table `[1, 0]` indexed by `c[a] - c[last] < 0`, a `select(mask, spread, 0)`, and then `T.reduce(..., typedReducer("add", d), -1)` followed by `T.squeeze`. The reduction runs over `n` terms for every one of the `n` outputs in a row, so the work is n^2 per row.
- `cumsumRef` at `tensor.js:102-111` is already the sequential O(n) recurrence `out[i] = out[i-1] + x[i]`; it is the semantic reference for any new lowering.
- The type rule at `tensor.js:349-353` widens every integer dtype to `i64`, keeps `f32`, and refuses everything else (`f16`, `bf16`) with a `TypeError`.

### What didn't work

- The second `docmgr doc add` (design doc) did not return within the 120 s tool timeout and was moved to the background. The first `doc add` in the same command line succeeded. The likely cause is concurrent docmgr use by the sibling ticket agents; I let it run rather than starting a second copy, which could create a duplicate document.

### What I learned

- The Loop IR has exactly four expression kinds, `num`, `in`, `op` and `red` (`loop.js:50-64`), and the scheduler emits exactly five statement kinds, `for`, `let`, `init`, `acc` and `write` (`loop.js:93-94`). There is no notion of a value that is carried from one iteration of a free (output) loop to the next. Every free loop iteration is independent, which is what lets `tile.js` map output elements onto threads freely.
- Fusion (`inlineInto`, `loop.js:323-354`) substitutes the producer's whole expression at each consumer load. This is sound only because a loop kernel's value at an index is a pure function of that index. A scan breaks that property in the sense that its value at index `i` is defined by the recurrence through `i - 1`, so the fusion rule must treat a scan kernel as a boundary unless it substitutes a closed-form prefix reduction.
- Tile analysis (`tile.js:31-99`) recognizes only reductions as "row" work: `rd` is the depth of the outermost scope that holds a reduction. A scan would need its own analysis field.

### What was tricky to build

- Nothing was built in this step. The subtle point in reading was the mask view: the IX expression `c[a].sub(c.at(-1)).lt(0)` evaluates to 0 when `j <= i` and 1 when `j > i`, and it indexes the table `[1, 0]`, so the mask is 1 for the included terms. The table is a two-element constant precisely so the mask needs no data proportional to `n`.

### What warrants a second pair of eyes

- Whether the background `docmgr doc add` eventually creates the design doc exactly once.

### What should be done in the future

- Read `kernel.js` (`emitNest`, `matRow`, `treeCombine`), `emit.js` (`toSim`), `fns.js` (typed reducers), the tests and the importer, and the KILN-005 evidence for cumsum families (Step 2).

### Code review instructions

- Start at `packages/kiln/src/std/tensor.js:524-533` and `packages/kiln/src/std/loop.js:93-159`.

### Technical details

```text
nn.cumsum(x, axis)                       tensor.js:349
  decompose  -> view spread [..s, n]     tensor.js:529
             -> view mask table[(i-j)<0] tensor.js:530
             -> ew select(mask, spread, 0)  tensor.js:531
             -> reduce add_<dtype> over last, squeeze  tensor.js:532
```

## Step 2: Reading the back end and probing the current lowering on CPU

This step read the Kernel IR materializers, the emitters and the simulator, then ran a probe script that compiles `N.cumsum` at several shapes and dtypes and reports the IR at each level, the mapping the cost model chooses, its estimate, and whether the CPU SIMT simulator reproduces the kernel. The probe turned three assumptions into evidence and produced two findings that the brief did not contain: integer cumsum fails to compile for rows of 1024 or more, and the SIMT simulator cannot execute integer kernels at all.

The `docmgr doc add` from Step 1 completed in the background; it created `design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md` (the directory is `design-doc/`, not `design/`).

### Prompt Context

**User prompt (verbatim):** see Step 1. The coordinator's relayed instruction "tell each agent to use their own diary and to folow the diary format as they go" (recorded verbatim in Step 1) applies to this and later steps.

**Assistant interpretation:** Gather the evidence the design doc's current-state and gap sections need, using CPU-only tools.

**Inferred user intent:** The guide should rest on observed behavior, and the CPU-only question should be answered from what actually runs on this machine.

**Commit (code):** none.

### What I did

- Read all of `packages/kiln/src/std/kernel.js` (KB builder 20-38, `emitNest` 49-67, `matThread` 86-103, `treeCombine` 106-120, `matRow` 121-174, `matTiled` 177-248, `valueTypes` 258-303, `materialize` 305-327).
- Read all of `packages/kiln/src/std/emit.js` (`toCuda` 28-90, `toWgsl` 117-168, `toSim` 174-283, `SimMetrics` 286-333) and `packages/kiln/src/std/program.js` 1-135 (`simulateKernel` 83-111, `kernelInputs` 49-56).
- Read `packages/kiln/src/std/emmy.js` (pipeline order), `fns.js` reducer lines 93-120, `integrations/passnet/fx_import.py:211-217`, `integrations/passnet/test_fx_compose.py:89-95`, `packages/kiln/test/integer-arithmetic.mjs`.
- Wrote `scripts/01-inspect-cumsum-lowering.mjs` (args: rows, n, dtype, `-v`, `--no-sim`) and ran it:

```text
node ttmp/.../scripts/01-inspect-cumsum-lowering.mjs 2 4 f32 -v
node ttmp/.../scripts/01-inspect-cumsum-lowering.mjs <rows> <n> <dtype> [--no-sim]
```

- Read the KILN-005 GPU replay audit `sources/typed-slice3-replay-gpu-v1/results-audit.json` and diary Step 259 (`reference/24-implementation-diary-volume-2-*.md:4976`).
- Located the cost gate: `integrations/passnet/transformation_program.mjs:10-16` (kind `cost-gated`) and `packages/kiln/src/std/tile.js:368-375` (`predictedCost`).
- Checked for a local CUDA toolchain: `which nvcc nvidia-smi` found neither; `torch 2.11.0+cu130` is installed with `torch.cuda.is_available() == False`.

### Why

- The design must state which mapping the current lowering actually gets at each length, because the gap is a cost-model and summation-order story as well as a complexity story.
- The CPU-only answer depends on what the simulator can and cannot execute, which only running it shows.

### What worked

Probe results (target `SPECS.a100`, model estimates from `tile.js` `estimate`):

| shape, dtype | chosen mapping | grid x block | model estimate | modeled flops | simulator |
|---|---|---|---|---|---|
| 2x4 f32 | MAP=thread, TPB=1024 | 1 x 1024 | 2.52 us | 64 | ok, max diff 0 |
| 8x512 f32 | MAP=row, TPB=256, STAGE=all | 4096 x 256 | 14.87 us | 4,194,304 | ok, max diff 1.43e-5 |
| 8x4096 f32 | MAP=tiled, BM=BN=16, BK=8 | 256 x 256 | 200.93 us | 536,870,912 | ok, max diff 0 |
| 64x2048 f32 | MAP=tiled, BM=BN=16, BK=8 | 512 x 256 | 136.85 us | 536,870,912 | not run |
| 1x32768 f32 | MAP=row, TPB=1024 | 32768 x 1024 | 6334.09 us | 2,147,483,648 | not run |
| 8x512 i64 | MAP=row, TPB=256, STAGE=all | 4096 x 256 | 14.87 us | 4,194,304 | ReferenceError |
| 8x512 bool | cast kernel + MAP=row | 64 x 64, 4096 x 256 | 2.61 + 14.87 us | | ReferenceError |

- At n = 512 the row mapping launches one block per output element (8 x 512 = 4096 blocks), each reducing 512 masked terms with a shared-memory tree. The f32 summation order is therefore a tree, neither the sequential order of `cumsumRef` nor PyTorch's.
- At n >= 2048 the masked sum is recognized as a contraction (`tile.js:76-95`): `x` is the A operand (depends on `a0`, `r0`) and the mask view is the B operand (depends on `a1`, `r0`); corrected in Step 3. Cumsum is compiled as a matrix product against a triangular matrix.
- The KILN-005 GPU replay accepted 10/10 families and 45/45 graphs; the cumsum tasks scored 1.0488 (task 28, 6 graphs) and 0.9568 (task 64, 1 graph).

### What didn't work

- Integer cumsum at row length 1024 or more does not compile:

```text
node .../01-inspect-cumsum-lowering.mjs 8 1024 i64 --no-sim
ERROR lowering/kernel/materialize at n14: tv holds both i64 and f32 values in k_cumsum_reduce
```

The same error appears at 8x2048, 8x4096 and 64x2048 i64. The cause is `kernel.js:205`: `matTiled`'s `tileLoad` names its staging temporary `"tv"` for every operand, so the f32 mask tile and the i64 data tile share one name, and `valueTypes` refuses it at `kernel.js:282`.
- The SIMT simulator cannot run integer kernels:

```text
node .../01-inspect-cumsum-lowering.mjs 8 512 i64
sim FAILED: ReferenceError: F_g0 is not defined
```

`toSim` declares per-thread `Float32Array`s only for `K.floats` (`emit.js:266`), and `materialize` removes integer-typed names from `floats` (`kernel.js:322`), so an integer value has no array. Buffers and shared arrays are `Float32Array` as well (`emit.js:270`, `program.js:53,93`).
- `f16` is refused at trace time: `KilnError [TypeError]: cumsum over f16 values is not lowered` (`tensor.js:351`).
- My first loop over shapes passed `$args` unquoted under zsh, which does not word-split, so the script got one argument and built a `(NaN, 4)` tensor. The pipeline accepted a NaN shape and printed `grid=NaN`. I stopped that run and reran with `${=args}`.

### What I learned

- Every CPU check that exists today for integer kernels goes through the Loop IR serial evaluator (`compileSerial`, which writes BigInts into `BigInt64Array` outputs, `loop.js:234`), not through the simulator. The KILN-005 CPU gates for integer families therefore did not exercise the Kernel IR of those kernels.
- A block-level scan can be written entirely in existing Kernel IR statements (`sload`, `sstore`, `sync`, `if`, `let`, `for`, `store`), the same set `treeCombine` uses. A warp-shuffle scan cannot: there is no shuffle statement in Kernel IR or the emitters.
- No CUDA compiler is installed here, so CUDA source can be generated and inspected but not compiled on this machine.

### What was tricky to build

- Nothing was built beyond the probe. The subtle part of reading the probe output was recognizing that the reported "reference" in the simulator check is the Loop IR expression (`program.js:58-61`), that is, the O(n^2) masked sum, not `cumsumRef`. A diff of 0 against it says the kernel implements the masked sum, not that it matches a sequential prefix sum bit for bit.

### What warrants a second pair of eyes

- The `tv` naming defect in `matTiled` affects every integer contraction with operands of different dtypes, not just cumsum. It should be confirmed and fixed independently of the scan work.
- The bool cumsum keeps a separate `to_i64` conversion kernel instead of fusing it; I observed this but did not determine whether the fusion guard or a legality rule caused it.

### What should be done in the future

- Extend `toSim` to typed values (per-dtype arrays, `BigInt64Array` for i64) before relying on the simulator for integer scans.
- Write the design doc (Step 3).

### Code review instructions

- Run the probe: `node ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/01-inspect-cumsum-lowering.mjs 8 1024 i64 --no-sim` to reproduce the materialize error, and `... 8 512 i64` to reproduce the simulator error.

### Technical details

Kernel IR the current lowering produces for a 2x4 f32 cumsum (MAP=thread):

```text
e = 1024 * bid + tid
if e < 8:
    acc0 = 0
    for r0 = 0; r0 < 4; r0 += 1:
        in0 = load n2[e % 4 - r0 < 0]
        in1 = load x[4 * (e / 4) + r0]
        v0 = select(in0, in1, 0)
        acc0 = add(acc0, v0)
    out[e % 4 + 4 * (e / 4)] = acc0
```

## Step 3: Writing the design guide, re-reading it, and ticket bookkeeping

This step wrote the design guide in the writing-style section order, related the key files, added the phase tasks, wrote the index overview and the changelog entry, and ran `docmgr doctor`. Before finishing, the coordinator relayed a scratchpad rule. I had written every draft directly into the ticket directory and none into the shared scratchpad, so no draft could have collided with another agent's. As the rule required, I re-read the whole design doc. It contains only KILN-008 material, but the re-read found four factual imprecisions, which I corrected.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Coordinator instruction relayed during this step (summary, not user-authored):** keep drafts only in the agent's own `scratchpad/kiln008/` subdirectory, and re-read the design doc end to end before finishing to confirm it contains only KILN-008 material.

**Assistant interpretation:** Turn the evidence of Steps 1-2 into the intern guide, then complete the docmgr hygiene without uploading.

**Inferred user intent:** A reviewable handoff document in the ticket that the parent agent can upload.

**Commit (code):** none (documentation only; committing is forbidden by the task instructions).

### What I did

- Wrote `design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md`. Its sections: executive summary; problem and scope; system orientation (pipeline, IX, Loop IR, fusion, Tile IR, Kernel IR and simulator, reducers); current state with the probe tables; gap analysis; proposed architecture (`tensor.scan`, `E.scan`, the `step` statement, fusion legality, `an.scan`, the scan mappings, the block-scan pseudocode, cost formulas, numerics, reuse); five decision records; flows and pseudocode; Phases 0-7 plus deferred phases; test strategy with a CPU/GPU table; risks, alternatives, open questions; references.
- Ran `docmgr doc relate` for 7 files on the design doc and 2 on the diary, added 10 tasks with `docmgr task add`, edited `index.md` (overview, summary, links), added a changelog entry, and ran `docmgr doctor --ticket KILN-008 --stale-after 30`.
- Re-read the design doc end to end and corrected four statements (see "What didn't work").

### Why

- The writing-style guide requires that a new reader understand the architecture from the introduction alone, so section 3 defines Loop IR, fusion, `rd`, `MAP` and Kernel IR before sections 4-6 use them.
- The decision records separate the choices that have viable alternatives: a new op versus pattern recognition, an index-defined expression versus a nest-level construct, which mappings go in the first slice, the f32 validation criterion, and extending the simulator.

### What worked

- Every first-slice mapping in the design uses existing Kernel IR statements. The new constructs are confined to Tensor IR (`tensor.scan`), Loop IR (`E.scan`, `step`, loop `kind: "scan"`) and Tile IR (`an.scan` and the estimate branches).
- `docmgr doc relate` reported "related 7 file(s)" and "related 2 file(s)".
- The background `docmgr task add` loop finished with exit code 0; `tasks.md` lists 10 open tasks (ids mhb3, yjg1, 9a7a, 3y3p, tz38, cpmx, mfwh, 533c, gpwu, 0k8f).
- `docmgr changelog update --ticket KILN-008 ...` reported "changelog updated".
- `docmgr doctor --ticket KILN-008 --stale-after 30` reported "All checks passed".
- No upload to reMarkable was made; the parent agent owns delivery.

### What didn't work

- `docmgr task add` was very slow: one loop of 10 calls exceeded the 180 s foreground limit and moved to the background. `pgrep -af docmgr` showed sibling agents' `docmgr task add` and `doc relate` processes for KILN-006, -007, -009 and -011 running at the same time, so the slowness is contention, not a failure. I let the loop finish rather than start duplicate calls.
- The re-read found four errors in my first draft. All four are corrected in place:
  1. The summary said the replay accepted "all ten integer families that use" cumsum. Only tasks 28 and 64 use cumsum; the other eight families of `typed-slice3-replay-gpu-v1` are other typed-integer programs.
  2. The contraction operands were swapped. In `analyze`, a load that depends on the last output variable `nVar` (here `a1`) goes to B (`tile.js:89-93`), so `x` (depends on `a0`, `r0`) is A and the mask (depends on `a1`, `r0`) is B. The same error was in Step 2 of this diary; it is corrected there with a pointer to this step.
  3. I wrote that the modeled flop count is `rows * n^2 * 4`. That holds only for `MAP=tiled` (8x4096: 536,870,912). Under `MAP=row` the factor is 2 (8x512: 4,194,304; 1x32768: 2,147,483,648).
  4. I wrote that integer cumsum fails for "rows of 1,024 or more". That was observed only for 8 and 64 rows; with many rows the model might choose another mapping. The wording now says "for the probed shapes".

### What I learned

- A carried accumulator is the first Loop IR construct whose meaning depends on loop order. The main implementation risk is that an existing materializer receives a scan loop and parallelizes it silently, so each materializer should assert on loops it does not implement.

### What was tricky to build

- The fusion rule needed care. Because `E.scan` is defined at every index, inlining a scan at a shifted index (`cs[i - 1]`) or inside a reduction (`amax(cumsum(x))`) would be semantically valid, but it would produce a nest the scheduler refuses, or one that recomputes a prefix for every read. The legality rule therefore restricts inlining to loads at the consumer's own scan coordinate, outside any reduction or scan body.
- The block-scan pseudocode must keep every barrier in uniform control flow. The chunk loop has uniform bounds, and the guarded loads and stores contain no barrier, which is the condition `SimMetrics.sync` (`emit.js:331`) checks.

### What warrants a second pair of eyes

- The description of PyTorch's CUDA cumsum algorithm (section 6.9) is from memory and labeled as unverified; open question 1 asks for a check on the GPU host.
- The block-scan cost formulas (section 6.8) are a proposal and have not been calibrated.

### What should be done in the future

- Answer open question 2 (does the corpus contain f32, long-row or non-last-axis cumsum?) from the importer census on the CPU before Phase 4, because it decides how much the cost-model ranking matters.
- Fix the `matTiled` `tv` naming defect independently of this ticket (Phase 0).

### Code review instructions

- Read the design doc sections 4.5, 6.4, 6.5 and 6.7 first: they hold the defects, the scheduler change, the fusion rule and the block-scan kernel.
- Validate the doc's probe claims with `node ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/01-inspect-cumsum-lowering.mjs <rows> <n> <dtype> [--no-sim]`.
- Ticket hygiene: `docmgr doctor --ticket KILN-008 --stale-after 30`.

### Technical details

- Design doc: `ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md`.
- No scratchpad files were created by this agent; all artifacts are in the ticket directory.

## Step 4: Implementation start and Phase 0, per-operand staging temporaries in the tiled materializer

This is the first implementation step. I read the common implementation rules, the whole design guide and the diary, ran both test suites to get a baseline, reproduced the integer cumsum failure at 8x1024 with the ticket probe, and fixed the shared defect this ticket owns: `matTiled`'s `tileLoad` named every operand's staging temporary `"tv"`, so a contraction whose operands differ in dtype (an f32 table view beside i64 data) was refused by `valueTypes`. Each operand now gets its own temporary from `kb.fresh("tv")` (`tv0`, `tv1`, ...). A new test pins `MAP=tiled` on the masked integer contraction (the old cumsum lowering written directly in Tensor IR) so the regression stays covered after cumsum stops using that path.

The simulator half of Phase 0 (integer `toSim`) is owned by KILN-010 and is not done here. Integer Kernel IR in this ticket is validated through the Loop IR evaluators and the JS references until KILN-010 merges.

### Prompt Context

**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)"

**User prompt (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"

**Coordinator instruction (summary, not user-authored):** implement KILN-008 in worktree `/home/manuel/code/wesen/kiln/worktrees/kiln-008-cumsum-scan` on branch `impl/kiln-008-cumsum-scan`, CPU-buildable phases only, no GPU host; this ticket also owns the `tv` temporary fix at `kernel.js` ~205; integer simulator support is KILN-010's, so validate integer scans through the Loop IR reference and JS evaluation until it merges; tests must pass before each commit; commit locally, never push the kiln repo.

**Assistant interpretation:** Implement Phases 0 (the `tv` half), 1-5 of the design guide in order, with a diary step per phase, then write the vault report.

**Inferred user intent:** Several tickets progress in parallel without stepping on each other, each with an auditable record and a published deep-dive note.

**Commit (code):** see the commit that follows this entry — "KILN-008 Phase 0: per-operand staging temporaries in matTiled".

### What I did

- Baseline: `cd packages/kiln && npm test` → "all 48 passed", exit 0; `cd integrations/passnet && python3 -m pytest -q -x` → "177 passed, 7 subtests passed", exit 0.
- Probe before the fix: `node .../scripts/01-inspect-cumsum-lowering.mjs 8 1024 i64 --no-sim` → `ERROR lowering/kernel/materialize at n14: tv holds both i64 and f32 values in k_cumsum_reduce`; `8 512 f32` → `MAP=row,TPB=256,STAGE=all grid=4096 model=14.87us`; `8 4096 f32` → `MAP=tiled,BM=16,BN=16,BK=8 grid=256 model=200.93us` (the guide's numbers).
- `packages/kiln/src/std/kernel.js`, `matTiled` → `tileLoad`: `kb.let(kx.num(0), "tv")` became `kb.let(kx.num(0), kb.fresh("tv"))`.
- New test `packages/kiln/test/tiled-mixed-dtype.mjs`: traces `sum_j select([1,0][i - j < 0], x[r, j], 0)` over i64 in Tensor IR, runs the pipeline with `params: { MAP: "tiled" }` at 8x1024 and 2x40, asserts the CUDA declares one `float tvN` and one `long long tvN`, and checks the Loop IR eval against a BigInt running sum (values scaled by 2^40, so exactness past 2^53 is exercised).

### Why

- `kb.fresh` is the builder's existing name allocator; `tileLoad` is called once per operand when the `k0` loop body is built, so the names are deterministic per kernel.
- The test builds the masked contraction directly rather than through `nn.cumsum`, because Phase 1 removes that decomposition and the defect must stay covered.

### What worked

- After the fix the probe at 8x1024 i64 compiles: `MAP=tiled,BM=16,BN=16,BK=8 grid=64 block=256 model=33.21us`, with `float tv1` and `long long ... tv0` in the CUDA.
- With the fix reverted the new test fails with `AssertionError [ERR_ASSERTION]: 8x1024: lowering/kernel/materialize at n13: tv holds both i64 and f32 values in k_kernel_reduce`; restored, it passes in 0.3 s.
- `npm test` → "all 49 passed", exit 0.

### What didn't work

- My first probe loop failed with `Error: Cannot find module '.../KILN-008*/scripts/01-inspect-cumsum-lowering.mjs'`: zsh does not glob inside a quoted variable assignment. Resolved by expanding the path with `$(echo ...)`.

### What I learned

- Only the staging temporary was shared; `rr`/`kq` are integer index temporaries (always `int`) and are safe to reuse.

### What was tricky to build

- Nothing in the fix itself. Choosing a test that survives the cumsum switch was the only design point.

### What warrants a second pair of eyes

- Whether other materializers reuse a fixed float temporary name across operands of different dtypes. I checked `matThread` and `matRow`: they name temporaries after Loop IR values, which already have one type each.

### What should be done in the future

- KILN-010's integer simulator will let `tiled-mixed-dtype.mjs` also simulate the Kernel IR.

### Code review instructions

- `packages/kiln/src/std/kernel.js` `matTiled` `tileLoad`; `packages/kiln/test/tiled-mixed-dtype.mjs`.
- `cd packages/kiln && node test/tiled-mixed-dtype.mjs && npm test`.

### Technical details

- CUDA declarations after the fix (8x1024 i64): `float tv1 = 0.0f, g1 = 0.0f, b0_0 = 0.0f;` and `long long g0 = 0, tv0 = 0, a0_0 = 0, v0_0_0 = 0, acc_0_0 = 0;`.

## Step 5: Phases 1-3, `tensor.scan`, the `E.scan` expression, the carried loop and fusion legality

This step put the scan into the front half of the pipeline. `nn.cumsum` now decomposes into one Tensor IR primitive, `tensor.scan(convert(x, d), { fn: typedReducer("add", d), axis })`, whose reference `scanRef` is the left-to-right recurrence (`cumsumRef` is now `scanRef(castRef(x, d), ...)`). Loop IR gained `E.scan(fn, r, end, n, body)`, the inclusive fold of `body` over `r = 0..end`, and the scheduler realizes it as an accumulator carried along an ordered loop. For a 2x4 cumsum the nest is exactly the one the design guide predicted (section 6.4): `acc0 = 0` above `for a1 # scan`, then `in0 = load x[a0, a1]`, `acc0 <~ add(acc0, in0)`, `out[a0, a1] = acc0`. Fusion inlines into and out of scans only where the result still schedules as one carried loop and holds no reduction.

Phases 1-5 were written as one change and landed in one commit, because the pipeline cannot run any test past Loop IR until Tile IR knows the new kind (see "What didn't work"); Steps 5-7 describe the phases separately.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Implement design-guide Phases 1-3 (sections 6.2-6.5).

**Inferred user intent:** cumsum costs O(n) per row and reuses the same mechanism for other scans.

**Commit (code):** 79e2ebc — "KILN-008 Phases 1-5: cumsum as a scan primitive"

### What I did

- `packages/kiln/src/std/tensor.js`: `scanRef(x, fn, axis)`; `cumsumRef` defined through it; the op `tensor.scan` (attrs `fn`, `axis`; type: same shape, dtype `reducer(fn).type ?? x.dtype`); the `nn.cumsum` decomposition is the one line above. The masked `[1, 0]` table decomposition is deleted (no compatibility kept).
- `packages/kiln/src/std/loop.js`:
  - `E.scan(fn, r, end, n, body)` with `end` an index expression rather than a variable name, so substitution (size-1 dims, `inlineInto`) can move it. A constant `end` folds to `E.red(fn, r, end + 1, body)`. `akey` (with bound-variable renaming of `end`), `free` (`free(body) - r + vars(end)`), `substE`, `walkE`, `printE` (`scan add_{r<=a1} ...`) and `hasScan` cover it.
  - `schedule`: collects scans; refuses (ScheduleError) an `end` that is not an output coordinate (a scan inside a reduction or inside another scan), two different scanned coordinates, and a body that depends on the scanned coordinate other than through `r`; moves the scanned dim to the innermost position; rewrites each scan into an internal `carry` node whose body is `body[r := v]`; marks that scope's loop `kind: "scan"`; emits `init {scan: true}` for every carry right before the scan loop and `step {name, fn, val}` at the carry's position inside it. The schedule result also records `source` (the expression before the carry rewrite), `scanV` and `carries`.
  - `compileSerial`: `step` compiles like `acc`. `compilePoint`: a kernel with a scan is evaluated from `sched.source` by a new `pointExpr`, which turns every reduction and scan into an immediately invoked JS loop, so the sampled reference does not reuse the carried-accumulator code it checks. `printNest` prints `<~` for steps; `workOf` counts `step` like `acc`; `stampNames` appends `_scan`.
  - `liftScan` (rule `lift_scan`) added to the lift pass.
  - `inlineInto`: a `scan` case in its rewriter, then `scanFusionLegal(expr, c, p)` whenever the fused expression contains a scan: it refuses (FusionIllegal) a result that holds a reduction, and a result that `schedule` refuses (which catches a shifted read like `cs[i - 1]`, a read inside a reduction like `amax(cumsum(x))`, and two scanned coordinates).

### Why

- `end` as an index expression: `inlineInto` substitutes the producer's output coordinates by the consumer's load indices. With a plain variable name the scan could not record that it is now read at, say, `a1 - 1`; with an `Ix` it does, and the scheduler's "end must be an output coordinate" check turns that into the fusion refusal the guide's section 6.5 asks for, with no separate load-index analysis.
- The internal `carry` node: the scheduler's placement rule (deepest scope of the free variables) then places the scan body's loads inside the scan loop and hoists what depends only on outer coordinates, with no new placement code.
- "No reduction in a scan kernel" is stricter than the guide (which only forbade reductions over `r`). It keeps the block-scan mapping legal for every fused scan kernel, since that materializer has no row-reduction support, and it turns `cumsum(x / sum(x))` into a reduction kernel feeding a scan kernel.

### What worked

- The 2x4 nest printed as designed (Technical details). The position-id graph of `integer-arithmetic.mjs` became one kernel `k_pos(ids)` (mask, conversion, scan, `mul`/`add` epilogue), and `peak = amax(cumsum(ids))` became two kernels, a scan and a reduction reading it.
- The bool cumsum (`8 512 bool`) is now one kernel: the `to_i64` conversion fuses into the scan body. The guide's open question 4 (why the masked lowering kept a separate `to_i64` kernel) has a likely answer: inlining the conversion into the masked n x n body multiplied its work by n, which the 2 % work guard refuses; the scan body evaluates it once per position.

### What didn't work

- The first run of the 2x4 cumsum after the Loop IR changes failed in Tile IR with `Cannot read properties of undefined (reading 'v')`: `analyze`/`estimate` did not know scan kernels. This is why Phases 1-5 landed together.
- `compilePoint` first got a scan branch through a hoisted inner function (`walk0`); I rewrote it as a plain `if (sched.scanV) ... else walk(...)` before running anything.

### What I learned

- Fusing a scan producer into a consumer needs no index analysis of its own once the scan's range end is an index expression: the scheduler's own checks are the legality rule.

### What was tricky to build

- Where the `init` goes. A reduction's `init` sits before its own reduce loop, which `emitScope` emits as part of the item; a scan's `init` must sit in the parent scope before the free-loop child. `emitScope` now emits the inits for all carries just before it emits a child loop of kind `scan`. The materializers' `onReduce` hooks treat "init followed by a for" as a reduction, so the scan init carries `scan: true` and `emitNest` skips `onReduce` for it (Step 7).

### What warrants a second pair of eyes

- `scanFusionLegal` calls `schedule` on every candidate fused expression that contains a scan. `schedule` caches by expression, so the later real scheduling is free, but the fusion pass now schedules some expressions it will discard.
- The `carry` rewrite substitutes `r := v` into the body with `substE`, which renames every reduction inside it. Reductions are excluded from scan kernels by fusion, but a hand-built `E.scan` with a body reduction would still schedule.

### What should be done in the future

- Exclusive and reverse scans (`exclusive`/`reverse` attributes, design section 6.10) fit this representation: the write before the step, and a descending loop.

### Code review instructions

- `packages/kiln/src/std/loop.js`: `E.scan`, the scan block at the top of `schedule`, `emitScope`, `pointExpr`, `scanFusionLegal`, `liftScan`.
- `packages/kiln/src/std/tensor.js`: `scanRef`, `tensor.scan`, the `nn.cumsum` decomposition.
- `node packages/kiln/test/scan.mjs` (sections "tensor.scan", "Loop IR", "scheduling restrictions", "fusion legality"); `node packages/kiln/test/integer-arithmetic.mjs`.

### Technical details

```text
n2 = loop.kernel k_cumsum_scan(x)  -> (2, 4) f32
    for a0 in 0..2:  # free
        acc0 = 0
        for a1 in 0..4:  # scan
            in0 = load x[a0, a1]
            acc0 <~ add(acc0, in0)
            out[a0, a1] = acc0

n33 = loop.kernel k_pos(ids)  -> (2, 6) i64
    for a0 in 0..2:  # free
        acc0 = 0
        for a1 in 0..6:  # scan
            in0 = load ids[a0, a1]
            v0 = ne_i64(in0, 0)
            v1 = to_i32(v0)
            v2 = to_i64(v1)
            acc0 <~ add_i64(acc0, v2)
            v3 = to_i32(acc0)
            v4 = mul_i32(v3, v1)
            v5 = to_i64(v4)
            v6 = add_i64(v5, 1)
            out[a0, a1] = v6
```

## Step 6: Phase 4, Tile IR analysis, launch geometry and the scan cost model

This step taught Tile IR the scan. `analyze` returns early for a scheduled scan with `an.scan = { v, n, dim, rowDims, rowVars, rows, carries, reductions }` and `an.rd = null`, so no reduction-row, staging or contraction analysis runs. `legalMaps` offers `thread` always and `row` when the kernel holds no reduction. `launch`, `printTile` and a new `estimateScan` cover both mappings. The first cost-model version ranked the mappings the wrong way round for the guide's two decisive shapes; the fixes and the remaining disagreement with the guide are recorded below.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Design-guide Phase 4 (sections 6.6 and 6.8).

**Inferred user intent:** The cost model, and through `predictedCost` the PassNet cost gate, see the linear scan.

**Commit (code):** 79e2ebc — "KILN-008 Phases 1-5: cumsum as a scan primitive"

### What I did

- `packages/kiln/src/std/tile.js`:
  - `analyze`: the `an.scan` early return (above). `an.maxExtent = n`.
  - `forkTree`: `MAP=thread` on a scan offers TPB from 32 up to `max(32, pow2(rows))`; `MAP=row` offers TPB up to `max(32, pow2(n))` (the reduction rule allows twice that).
  - `launch`: thread map `grid = ceil(rows / (TPB * COARSEN))`; row map `grid = rows`, `smem = TPB * dtypeBytes(carry dtype)` per carried value.
  - `estimateScan(an, kn, t)`, called first by `estimate`. Thread map: per warp of up to 32 rows, every statement in the scan loop is one warp instruction per position; load sectors follow the stride between adjacent rows, capped by the warp's L1 footprint (`lanes * n * 4` bytes) for a load that walks its row contiguously; stores are charged per access. Row map: per chunk of T positions, the body once per thread, and per step `4 + 3 log2 T` instructions, `2 + 2 log2 T` shared wavefronts and `2 log2 T + 2` barriers charged at `SYNC_INSTR = 8` warp instructions each.
  - `printTile` prints `Tile(axes=(a0:2 → thread, 32/block); a1:4 serial scan)` or `ChunkLoop(...)`/`BlockScan(...)` for the row map.
- New probe `scripts/02-scan-mapping-estimates.mjs <shape> [axis] [dtype] [--no-sim]`: the chosen option, every option's estimate, and simulator checks of the chosen and pinned row-map kernels.

### Why

- Restricting thread-map TPB to the row count: `timeModel` rewards more threads per block with more latency hiding, and cannot know that a 1024-thread block over one row has 1023 idle threads. Without the filter a single row of 32768 chose `MAP=thread, TPB=1024` (39.53 us) over the block scan.
- The L1 footprint cap: without it, a last-axis thread-map scan with 16-element rows was charged 32 sectors per load per position (each lane in its own sector), as if no sector were reused across positions; consecutive positions of a lane read the same sector.

### What worked

- Probe after the change (A100 model, `01-inspect-cumsum-lowering.mjs`, `--no-sim`), against the masked lowering's numbers in the guide's section 4.3:

  | shape, dtype | masked lowering | scan mapping | model estimate |
  |---|---|---|---|
  | 2x4 f32 | thread, 2.52 us | thread TPB=32 | 2.52 us |
  | 8x512 f32 | row, 14.87 us | row TPB=512 | 3.38 us |
  | 8x4096 f32 | tiled, 200.93 us | row TPB=1024 | 7.31 us |
  | 64x2048 f32 | tiled, 136.85 us | row TPB=1024 | 4.91 us |
  | 1x32768 f32 | row, 6334.09 us | row TPB=1024 | 40.99 us |
  | 8x1024 i64 | (failed to compile) | row TPB=1024 | 3.70 us |
  | 8x512 bool | two kernels | row TPB=512, one kernel | 3.38 us |

- `16x65536` along axis 0 (adjacent rows at adjacent addresses) chooses `MAP=thread` (8.61 us, DRAM bound).
- `predictedCost` of an 8x4096 i64 cumsum falls by more than 4x against the masked Tensor IR lowering of the same computation (asserted in `scan.mjs`).

### What didn't work

- First ranking, before the two fixes (`est.mjs` in my scratch directory, all options): `1x32768`: `thread TPB=1024` 39.53 us, `row TPB=1024` 40.99 us, so the pipeline picked the serial loop; `4096x16`: `row TPB=32` 3.48 us against `thread TPB=32` 7.13 us (L2 traffic 4.19e6 bytes for 256 KiB of input).
- After the fixes, `4096x16` along the last axis still chooses `MAP=row, TPB=32` (3.48 us, launch bound) over `MAP=thread, TPB=32` (5.10 us). The guide's section 6.8 expected the sequential mapping to win here. I did not tune the model to match that expectation: one warp per 16-element row, coalesced, against strided per-thread loads and stores is a real trade-off, and only a measurement can settle it. The test asserts the robust cases instead (axis-0 many-row scan picks `thread`, one long row picks `row`).

### What I learned

- The analytic model has no latency term. The thread map's 32768-step dependency chain on one thread is visible to it only through issue counts at low occupancy.
- The model counts every element as 4 bytes, so i64 scans get the f32 estimates (8x4096: 7.31 us for both). This is shared with the rest of `estimate`.

### What was tricky to build

- Counting warp instructions for a serial-per-thread loop: the existing thread-map walk divides trips by 32, which assumes 32 lanes do independent work; with one row per thread, a warp executes every position, so the count is `warps * positions`, not `rows * positions / 32`.

### What warrants a second pair of eyes

- `SYNC_INSTR = 8` and the L1-footprint assumption are uncalibrated priors.
- The decisive ranking cases need Phase 6 measurements: `4096x16` last axis (model: row), `8x512` (model: row), `1x32768` (model: row).

### What should be done in the future

- Measure the two scan mappings on bling at the shapes of the table and at `4096x16`, and fit `SYNC_INSTR`.

### Code review instructions

- `packages/kiln/src/std/tile.js`: `analyze` (scan early return), `legalMaps`, the TPB level of `forkTree`, `launch`, `estimateScan`, `printTile`.
- `node ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/02-scan-mapping-estimates.mjs 4096x16 -1 f32 --no-sim`.

### Technical details

- Option table for `1x32768` before the TPB filter (us): thread 32: 95.07; thread 256: 54.57; thread 1024: 23.33; row 32: 80.19; row 256: 74.71; row 1024: 40.99. After the filter only thread 32 is offered for one row, and row 1024 wins.

## Step 7: Phase 5, the two scan materializers and their CPU validation

This step wrote the Kernel IR for both mappings, using only existing statements. `matScanThread` is `matThread` with the flat thread index decoded over the row dims and the scan loop emitted as a serial `for`. `matScanRow` turns the scan loop into a uniform loop over chunks of TPB positions, guards the body statements by `c0 + tid < n`, and replaces every `step` with a Hillis-Steele inclusive scan of the chunk in a shared array `s_scanq`, combined with a block-wide carry. A new test, `test/scan.mjs`, checks both mappings in the SIMT simulator against an f64 reference over the guide's shape grid, and a structural check finds shared-memory races that the lockstep simulator cannot see.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Design-guide Phase 5 (section 6.7) and the CPU half of section 10.

**Inferred user intent:** Kernel IR correct enough that the GPU host only needs to compile and time it.

**Commit (code):** 79e2ebc — "KILN-008 Phases 1-5: cumsum as a scan primitive"

### What I did

- `packages/kiln/src/std/kernel.js`:
  - `emitNest`: a `for` of kind `scan` calls `ctx.onScan`, and throws `MaterializeError: this mapping does not materialize the scan loop over ...` when the mapping has none (so `matThread`/`matRow`/`matTiled` can never parallelize an ordered loop); `step` emits like `acc`; a scan `init` skips `onReduce`.
  - `matScanThread(an, kn)` and `matScanRow(an, kn)`; `materialize` dispatches on `an.scan`.
  - Row-map statement order per chunk and per step: `x := e`; `if p < n { segment; x := val }`; `s[tid] := x`; sync; for each `d = 1, 2, ..., T/2` (unrolled): `y := e`; `if tid >= d { y := s[tid - d] }`; sync; `if tid >= d { x := fn(y, x); s[tid] := x }`; sync; then `p_ := fn(carry, x)`, `t_ := s[T - 1]`, `carry := fn(carry, t_)`; the trailing segment (epilogue and write) under `if p < n`; a final sync before the next chunk.
- `packages/kiln/test/scan.mjs` (new, 8.4 s): `tensor.scan` for add/mul/max/min and both axes; i64 wrap at 2^63 and bool widening; the printed 2x4 nest; dim reordering for axis 0 of a 3-D tensor; a size-1 axis is a reduction; for 6 shape/axis cases x {i64, i32, bool, f32}: pipeline Loop IR eval equals the frontend reference bit for bit, and `compileSerial` equals `compilePoint` at every element; the three ScheduleErrors; two scans of one coordinate share a loop; fusion cases; the simulator grid; a `max` scan through the block map (`__int_as_float(0xff800000)` identity); WGSL `var<workgroup> s_scan0` and `workgroupBarrier()`; cost-model cases.
- `packages/kiln/test/integer-arithmetic.mjs`: the `s_red` int64 assertion now comes from a `MAP=row` pinned compile, plus `__shared__ long long s_scan0[`; the position-id kernel structure is asserted; the float-literal check covers the row-map CUDA too.
- `integrations/passnet/test_fx_compose.py`: the position-id model at 2x2048 (exact against PyTorch), and a new f32 model `cumsum(x, 0) * 0.5 + cumsum(x, 1)` on 300x40 (two scans over different coordinates, which must not fuse into one kernel).

### Why

- `x := e` before the guarded segment: positions past the row end must contribute the identity to the chunk scan, and they must still execute every barrier.
- f64 reference with a depth bound instead of `cumsumRef`: decision record 4 of the guide. The bound used is `|got - ref| <= 2 * depth * 2^-24 * sum_{j<=i} |x_j|` with depth `n` for the thread map and `ceil(n / T) + log2 T + 1` for the row map.

### What worked

- Simulator grid: 21 distinct (shape, mapping) kernels, covering `(1,1)`, `(3,31)`, `(4,256)`, `(2,257)`, `(1,32768)`, `(4096,16)`, `(5,300)` and `(300,5)` along axis 0, `(3,40,7)` along axis 1, with thread TPB 32 and row TPB 32/256/512/1024 where offered. All within the f64 bound, all with `simulateKernel` `check.ok` (no out-of-bounds access, no barrier in divergent code).
- Mutation checks: making the Hillis-Steele loop stop at `T/2` fails the f64 check (`3,31 axis -1 MAP=row,TPB=32 at 16: 1.3152656555175781 vs 1.2024062797427177`). Removing the end-of-chunk barrier, or the barrier between the round's read and write, fails the race check (`3,31 MAP=row,TPB=32: shared-memory races`).
- `npm test` → "all 50 passed" (exit 0); `python3 -m pytest -q` → "177 passed, 7 subtests passed" (exit 0); the two changed PassNet tests pass (`2 passed`).

### What didn't work

- `integer-arithmetic.mjs` failed after the switch: `expected: /__shared__ long long s_red\[/` — the int64 tree combine had come from the masked cumsum's `MAP=row`; at 2x6 nothing uses `MAP=row` now. Fixed with the pinned `MAP=row` compile.
- My first replacement assertion counted kernels: `AssertionError: pos fuses into its scan; peak reads a separate scan kernel  6 !== 3` — the graph has five outputs. Then `TypeError: Cannot read properties of undefined (reading 'attrs')`: node `args` in a pipeline snapshot are ids (`[ 'n0' ]`), not nodes. The test now looks kernels up by output name and id.
- `scan.mjs` first run: `TypeError: Cannot read properties of undefined (reading 'map')` for shape `[1, 1]`, which has no scan (a size-1 axis folds to a one-term sum); the grid now falls back to the shape's only kernel.
- Removing the end-of-chunk barrier passed the first version of the test. The lockstep simulator executes each statement for every thread before the next, so a read of `s[T-1]` can never overlap the next chunk's stores there; it detects barriers in divergent code but not missing barriers. I added `sharedRaces(K)` to the test: it walks the chunk loop twice as a cycle (ifs flattened) and reports a shared store and a shared load of the same array within one barrier interval unless both index `tid`.
- Integer Kernel IR cannot be simulated: `node .../01-inspect-cumsum-lowering.mjs 8 1024 i64` → `sim FAILED: ReferenceError: F_acc0 is not defined` (KILN-010 owns `toSim` integer support). Integer scans are checked through the Loop IR serial and point evaluators (exact), the frontend reference, and CUDA string assertions.

### What I learned

- The simulator's lockstep semantics hide races by construction; a barrier-placement bug in a cooperative kernel needs a separate check.
- `inlineInto` refuses the second of two differently scanned cumsums in one consumer, and the 300x40 PassNet test shows the result stays numerically right.

### What was tricky to build

- The block carry. Every thread holds the same carry; the prefix for a position is `fn(carry, x)` and must be in a new name (`acc0_p`), because statements after the step read the prefix while `acc0` itself advances by the chunk total. The child context copies `vals` per chunk and maps the step's name to `acc0_p` for the rest of the iteration.
- Multiple steps in one scan loop each get their own shared array, so an i64 and an f32 scan never share a typed array.

### What warrants a second pair of eyes

- `sharedRaces` is a heuristic for this kernel shape (one-dimensional `tid` indexing, one chunk loop), not a general race detector.
- Hillis-Steele with two barriers per round: 20 barriers per chunk at T = 1024. A double-buffered variant would halve them; this is the first candidate if the Phase 6 timings show barrier cost.

### What should be done in the future

- After KILN-010 merges: simulate the integer scan kernels (both mappings) in `scan.mjs`, using the same grid with exact comparison.

### Code review instructions

- `packages/kiln/src/std/kernel.js`: `emitNest`, `matScanThread`, `matScanRow`, `materialize`.
- `node packages/kiln/test/scan.mjs` (set `KILN_SCAN_VERBOSE=1` to list the simulated kernels); `cd integrations/passnet && python3 -m pytest -q test_fx_compose.py -k "cumsum or positions"`.

### Technical details

- Row-map CUDA for the position ids at 2x64, `MAP=row, TPB=32` (abridged): `__shared__ long long s_scan0[32];` `for (int c0 = 0; c0 < 64; c0 += 32) { p = (c0 + tid); acc0_x = 0LL; if ((p < 64)) { in0 = src0[((64 * bid) + p)]; ... acc0_x = v2; } s_scan0[tid] = acc0_x; __syncthreads(); ... acc0_p = (acc0 + acc0_x); acc0_t = s_scan0[31]; acc0 = (acc0 + acc0_t); if ((p < 64)) { ... dst[((64 * bid) + p)] = v6; } __syncthreads(); }`.

## Step 8: Phase 7 CPU slice, the CPU compile gate over the corpus families, and closing bookkeeping

This step extended the scan to the other cumulative ops, ran KILN-005's local compile gate over the eleven typed-slice3 family tasks against this branch, recorded implementation notes in the design guide, and wrote the vault report. `nn.cumprod`, `nn.cummax` and `nn.cummin` (values) now share one table with `nn.cumsum`; the PassNet importer lowers them. The compile gate compiled 51 of 51 graphs with Kiln's internal reference check on, and every graph of the two cumsum families compiles its position ids into one fused scan kernel.

### Prompt Context

**User prompt (verbatim):** see Step 4.

**Assistant interpretation:** Do the CPU half of Phase 7 as far as quality allows, run every CPU check that stands in for the GPU replay, then the ticket hygiene and the vault report.

**Inferred user intent:** Leave the coordinator with GPU work only, and a clear list of it.

**Commit (code):** a07d481 — "KILN-008 Phase 7 (CPU slice): cumprod, cummax and cummin values as scans"

### What I did

- `packages/kiln/src/std/tensor.js`: `CUMULATIVE = { cumsum: add/widen, cumprod: mul/widen, cummax: max/keep, cummin: min/keep }`, `cumulativeDtype` (f32 stays f32; widening ops send every integer dtype to i64; max/min keep i32/i64 and refuse bool), the four nn ops registered in a loop after the `nn` dialect, `N.cumprod`/`N.cummax`/`N.cummin`, one decomposition per entry.
- `packages/kiln/src/std/fns.js`: reducers `mul_i64` (identity `1n`, CUDA `1LL`) and `mul_i32`.
- `integrations/passnet/fx_import.py`: `lower_cumulative(name, values_and_indices)` replaces `lower_cumsum`; cumsum/cumprod refuse a `dtype` argument as before; cummax/cummin return `[values, None]` like max/min over a dimension, so the indices refuse only where used (message now "argmax/argmin indices, or cummax/cummin indices").
- Tests: `scan.mjs` (dtypes, bool refusal, Loop IR equals reference, an int64 product, f32 kernels in the simulator, the `1LL` identity); `test_fx_compose.py` `test_cumulative_ops_match_torch` (f32 and int64 cumprod/cummax/cummin against PyTorch) and `test_cummax_indices_refuse`.
- `scripts/03-local-compile-gate-scan.py`: a copy of KILN-005 `scripts/674-local-compile-gate.py` taking `--upstream` (the PassBench checkout is an untracked directory of the `passnet` worktree). Ran it on tasks 28 64 91 104 126 175 199 3 139 162 38 into my scratch directory; copied `gate.json`, `run.log` and a list of the scan kernels to `sources/local-compile-gate-scan-v1/`.
- Design guide: section 13 "Implementation notes" (deviations from sections 6-9).
- docmgr: checked tasks mhb3, 9a7a, 3y3p, tz38, cpmx, mfwh; added and checked f7qt (Phase 7 slice); added ifd7 (integer simulation after KILN-010); related 8 implementation files to the diary.

### Why

- One table instead of four hand-written ops: the four ops differ only in reducer and widening rule, and the decomposition is the same.
- `logcumsumexp` was left out: its reducer `logaddexp(a, b) = max + log1p(exp(-|a - b|))` produces NaN for `a = b = -inf`, and the block scan combines identities with identities past the row end, so it needs a guarded spelling and its own tests. Exclusive and reverse scans have no known corpus use.
- The compile gate is the CPU stand-in for the GPU replay's first stage: it compiles exactly what the replay would stage and runs Kiln's end-to-end reference check.

### What worked

- `node packages/kiln/test/scan.mjs` → both sections pass; `npm test` → "all 50 passed" (exit 0); `python3 -m pytest -q` → "180 passed, 7 subtests passed" (exit 0).
- Compile gate (`run.log`): `28 6/6`, `64 1/1`, `91 1/1`, `104 1/1`, `126 3/3`, `175 6/6`, `199 9/9`, `3 10/10`, `139 2/2`, `162 6/6`, `38 6/6` — the same counts as the frozen KILN-005 `typed-slice3-replay-v1/local-compile-gate.json`. Task 28's six graphs each compile to one kernel `k_ew_cast_cumsum_scan__*` (`MAP=row` with TPB 32 to 1024 by row length, e.g. `[2, 1024]` → `MAP=row,TPB=1024`); task 64 to `k_cumsum_ew_reshape_scan__*` (`[1, 13]`, `MAP=thread, TPB=32`). Compile log line: `: end-to-end check ok at loop`.

### What didn't work

- No failures in this step. The int64 `cumprod` comparison in the PassNet test goes through float64 (`check` converts results to float64), so it is tolerance-based, not bitwise; the bitwise int64 product check is in `scan.mjs`.

### What I learned

- The corpus's cumsum rows (19, 64, 256, 512, 1024 and 13 positions, 1-8 rows) are short; the block scan at TPB = row length is a single chunk there, so the carry path between chunks is exercised by the CPU grid and not by these families.

### What was tricky to build

- Registering nn ops after the dialect chain: `nn.op(...)` in a loop works, and the decompositions match them by name, but the ops must exist before `decompositions` is built, which the module order guarantees.

### What warrants a second pair of eyes

- `cummax`/`cummin` of f32 select a value, so they are exact in any order; the PassNet test still uses a tolerance because the harness compares in float64 for every output.

### What should be done in the future

- GPU (coordinator): see the receipt's list; first the NVRTC compile of a block-scan kernel and the typed-slice3 replay.

### Code review instructions

- `packages/kiln/src/std/tensor.js` (`CUMULATIVE`, `cumulativeDtype`, the op loop, the decomposition spread), `packages/kiln/src/std/fns.js` (`mul_i64`, `mul_i32`), `integrations/passnet/fx_import.py` (`lower_cumulative`).
- `python3 ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/03-local-compile-gate-scan.py --upstream <KILN-005 sources/upstream> --output <dir> 28 64` (about a minute per task on this machine).

### Technical details

- Evidence: `sources/local-compile-gate-scan-v1/gate.json` (format `kiln-local-compile-gate/1`), `run.log`, `scan-kernels.json` (7 scan kernels, tasks 28 and 64), compiled at a07d481.
