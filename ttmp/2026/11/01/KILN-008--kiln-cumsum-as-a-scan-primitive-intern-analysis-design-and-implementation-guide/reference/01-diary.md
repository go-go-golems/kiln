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
    - Path: repo://packages/kiln/test/integer-arithmetic.mjs
      Note: existing integer cumsum CPU test read in Step 2
    - Path: repo://ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/01-inspect-cumsum-lowering.mjs
      Note: probe whose outputs Step 2 records
ExternalSources: []
Summary: Chronological investigation diary for the KILN-008 cumsum-as-scan design guide.
LastUpdated: 2026-11-01T07:35:00-05:00
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
