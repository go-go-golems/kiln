---
Title: Diary
Ticket: KILN-011
Status: active
Topics:
    - kiln
    - compiler
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/check_integer_division_cuda.py
      Note: GPU replay check (Step 11)
    - Path: repo://integrations/passnet/fx_import.py
      Note: division importer (Step 9)
    - Path: repo://packages/kiln/src/std/emit.js
      Note: cudaHelpers collection (Step 8)
    - Path: repo://packages/kiln/src/std/fns.js
      Note: division functions and CUDA helpers (Steps 8, 10)
    - Path: repo://packages/kiln/src/std/loop.js
      Note: Phase 0 exact literals (Step 7)
    - Path: repo://packages/kiln/src/std/tensor.js
      Note: resolveEw and N API (Steps 7, 8, 10)
    - Path: repo://packages/kiln/test/float-division.mjs
      Note: float division test (Step 10)
    - Path: repo://packages/kiln/test/integer-constant-folding.mjs
      Note: Phase 0 test (Step 7)
    - Path: repo://packages/kiln/test/integer-division.mjs
      Note: CPU sign-table test (Step 8)
ExternalSources: []
Summary: Chronological investigation diary for the KILN-011 integer floor division and modulo design guide.
LastUpdated: 2026-11-01T07:32:41.937635327-05:00
WhatFor: Records how the KILN-011 design guide was researched, what evidence it rests on, and what remains open.
WhenToUse: Read before implementing integer div/mod in Kiln or when reviewing the KILN-011 design doc.
---

# Diary

## Goal

This diary records the research behind the KILN-011 design guide on integer floor division and modulo in Kiln. Each step is written as the work happens, in the investigation format of the diary skill.

## Step 1: Ticket setup and skill loading

This step established the working contract. The ticket workspace already existed (created by the coordinating agent alongside KILN-006 through KILN-010), so the work here was to load the writing, docmgr and diary skills, create the diary and design documents, and record the user prompts verbatim. The outcome is an empty design-doc skeleton and this diary.

The coordinator relayed a second user instruction during this step: each sub-agent must keep its own diary and write it as it goes, step by step, rather than producing one summary at the end. This diary follows that instruction from this step onward.

### Prompt Context

**User prompt (verbatim):** "Create new docmgr tickets for tensor-core matrix products  and fused attention and cumsum and writing mutated inputs (one docmgr + design doc per task). Create  a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet point sand pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and the nupload to remarkable."

**User follow-up (verbatim):** "also" followed by a pasted list whose item 2 is "Integer floor division and modulo. Small, but needs care with signs." This ticket covers that item. The user also asked: "and can we build them with CPU only".

**User instruction relayed mid-task (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go"

**Assistant interpretation:** Write one intern-facing analysis, design and implementation guide for integer floor division and modulo in Kiln inside ticket KILN-011, plus an investigation-format diary written incrementally. Answer the CPU-only question explicitly. Do not upload to reMarkable (the coordinator does that), do not edit source code, do not commit.

**Inferred user intent:** The user wants a plan that a new intern can implement without rediscovering how Kiln's typed scalar arithmetic works, and wants to know which parts of the work need the GPU host.

**Commit (code):** none; this ticket is documentation-only and the coordinator owns commits.

### What I did

- Read `/home/manuel/.claude/skills/ticket-research-docmgr-remarkable/SKILL.md`, its `references/writing-style.md` and `references/deliverable-checklist.md`.
- Read `/home/manuel/.claude/skills/textbook-authoring/SKILL.md` (no analogies, prose paragraphs, complete-sentence bullets).
- Read `/home/manuel/.claude/skills/docmgr/SKILL.md` and `/home/manuel/.claude/skills/diary/SKILL.md` with `references/investigation-entry.md`.
- Ran `docmgr doc add --ticket KILN-011 --doc-type reference --title "Diary"` which created `reference/01-diary.md`.
- Ran `docmgr doc add --ticket KILN-011 --doc-type design-doc --title "Integer floor division and modulo: analysis, design and implementation guide"`.

### Why

- The writing-style guide fixes the section order of the design doc, so the skeleton is decided before the research starts.
- Recording prompts first avoids reconstructing them from memory later.

### What worked

- The diary document was created immediately.

### What didn't work

- The design-doc `docmgr doc add` call did not return within the 120 s tool timeout and was moved to the background. The likely cause is contention with the other sub-agents running docmgr in the same repository at the same time; this is an inference, not a diagnosed cause.

### What I learned

- Tickets KILN-006 to KILN-011 were created together under `ttmp/2026/11/01/`, so several agents share the docmgr workspace concurrently.

### What was tricky to build

- Nothing yet beyond the slow docmgr call.

### What warrants a second pair of eyes

- N/A for this setup step.

### What should be done in the future

- N/A.

### Code review instructions

- Check that `ttmp/2026/11/01/KILN-011--kiln-integer-floor-division-and-modulo-intern-analysis-design-and-implementation-guide/` contains `reference/01-diary.md` and a design doc under `design/`.

### Technical details

- Worktree: `/home/manuel/code/wesen/kiln/worktrees/passnet`, branch `research/passnet`, head `67678fd`.

## Step 2: Read the typed-arithmetic code path and measure corpus demand

This step read every file on the path from a frontend elementwise call to emitted CUDA for typed integer arithmetic, and then measured how often PassNet graphs actually use floor division, modulo or `rounding_mode`. The code reading confirmed the brief's description with two refinements: integer `div` is refused by a generic "not lowered" error rather than mapped to PyTorch true division, and the loop-level constant folder converts typed integer results through `Number()`, which would lose int64 precision and would throw on a folded division by zero once BigInt division exists.

The corpus measurement changed the priority picture. The KILN-005 census population (2060 sampled `hf_subgraphs_v2/fusible_subgraphs` graphs) contains no tensor-level floor division or modulo at all. The 30 census graphs whose `model.py` contains `//` compute on symbolic shape integers (`torch.sym_sum`), and in the sample inspected the `//` result is dead. Tensor-level uses exist only in 25 `model.py` files across the sole-op lists, all with nonnegative dividends and positive literal divisors.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Gather the code evidence and the corpus evidence the guide's current-state and priority sections depend on.
**Inferred user intent:** A guide that is accurate about what exists and honest about how much benchmark value the feature carries.
**Commit (code):** none.

### What I did
- `nl -ba packages/kiln/src/std/fns.js`: read the FNS table (untyped `div` at line 31, `floor` at 57), the typed integer block (lines 65-92), and the typed reducers (93-106).
- Read `packages/kiln/src/std/tensor.js` lines 183-227 (`joinDtypes`, `promoteDtypes`, `elementwiseDtype`, `resolveEw`), 402-466 (`T` and `N` frontends), 494-523 (`convert`, the `nn.ew` decomposition), 95-130 (`castRef`, `viewRef` and its `__mod` helper).
- Read `packages/kiln/src/std/kernel.js` lines 255-280 (`valueTypes`), `packages/kiln/src/std/emit.js` lines 15-47 (`ilit`, `fx`), `packages/kiln/src/std/loop.js` lines 50-62 (`E.op` folding), `packages/kiln/src/core/ix.js` lines 1-12, 83-105, 256-295 (index `/` and `%`, `floorMod`, `toJs`).
- Read `packages/kiln/test/integer-arithmetic.mjs` (line 34 asserts the current div refusal).
- Read `integrations/passnet/fx_import.py` lines 41-58 (`operand`, in-place binary) and 163-176 (`BINARY`, `lower_binary`).
- Wrote `scripts/01-census-div-mod.py` and ran it with `python3 -I` over `sources/upstream/graphs` (67150 `model.py` files) and `views-ops-import-v1.json`; output saved to `sources/01-census-div-mod.out`.
- Checked membership of the 25 tensor-level graphs in `sources/upstream/graph_lists/*.txt` with `grep -rl`.

### Why
- The design must extend `resolveEw`, `FNS`, the folder and the emitters consistently, so each had to be read rather than assumed.
- The census tells the coordinator whether this ticket unblocks benchmark graphs or is a correctness-completeness item.

### What worked
- The first script pass found 399 matching graphs: 384 with `//`, 11 with `%`, 4 with `rounding_mode`, 0 with `floor_divide`, `remainder`, `fmod`, or `operator.floordiv`/`operator.mod` targets.
- The refinement split them into 374 symbolic-int graphs (30 of them in the census, all `imported`) and 25 tensor graphs (0 in the census).
- All 25 tensor graphs are in `hf_sole_op_subgraphs.txt` or `hf_sole_op_subgraphs_v2.txt`. Their ops: `int64 // 80` and `int64 % 80` (yolov10l), `torch.div(int32, 14, rounding_mode='trunc')` (fastconformer), `int64 % 16` (long-t5), `int64 % 16384` (Canine), 0-dim `int64 // {4,8,16,2560}` (timm eca_resnet33ts, EfficientNet), and one `float32 // 2` (Mask2Former).

### What didn't work
- The first run's metadata regex required `max_val`/`min_val` fields, so it classified 7 `%` operands as "intermediate" when they were inputs whose meta uses `data = [...]` instead. The refinement section (`meta2`) reads both forms and reported their dtype and minimum.
- The first run counted the timm `sym_sum` graphs as tensor floor division. Reading `skresnet18.ra_in1k_start14_end17_1/model.py` showed `tmp_0 = torch.sym_sum([-1, in_0]); tmp_1 = tmp_0 // 4`, which is shape arithmetic; the refinement filters forwards containing `sym_`.

### What I learned
- Integer `/` in PyTorch is true division to the default float dtype, but `resolveEw` resolves `div` over two i64 operands to `div_i64`, finds no such function, and throws. So `x / y` on integer tensors is currently refused instead of being promoted to f32.
- `ix.js` already contains a sign-correct floor-mod spelling `(((a % b) + b) % b)` for C and JS, used only when a dividend contains a data-dependent load; WGSL keeps truncating `%` and `/` there.
- `E.op` folding (`loop.js:57`) wraps typed integer results with `Number(...)`: exact for i32, lossy for i64 beyond 2^53, and unguarded against a throwing reference function.
- No dividend in the corpus is negative and every divisor is a positive literal, so sign handling matters for correctness but is not exercised by the benchmark data.

### What was tricky to build
- Distinguishing tensor arithmetic from SymInt arithmetic in exported FX `model.py` text. The reliable signal was the presence of `torch.sym_*` calls in the forward; operator text alone (`//`) is identical in both.

### What warrants a second pair of eyes
- The `sym_` filter is a heuristic over whole files. A forward that mixed SymInt arithmetic and a tensor `//` would be classified as symbolic. I did not find one, but the script does not prove absence.

### What should be done in the future
- If KILN-005 later samples sole-op graphs, rerun `scripts/01-census-div-mod.py` against that census file.

### Code review instructions
- Run: `python3 -I ttmp/2026/11/01/KILN-011--*/scripts/01-census-div-mod.py ttmp/2026/10/30/KILN-005--*/sources/upstream/graphs ttmp/2026/10/30/KILN-005--*/sources/views-ops-import-v1.json` and compare with `sources/01-census-div-mod.out`.

### Technical details
- Census format `kiln-passnet-import-audit/1`, 200 tasks observed, 2060 records: 1931 imported, 129 blocked. No blocked record's error mentions floordiv, mod, remainder, fmod or rounding_mode.

## Step 3: Pin down PyTorch semantics on the local CPU build and probe Kiln's current behavior

This step turned the brief's list of PyTorch behaviors into observed values from the installed torch, and located the C++ source PyTorch itself uses for these operations. The most consequential observations are that integer division by zero raises on CPU, that `INT64_MIN` divided by `-1` in trunc mode kills the process with SIGFPE, that float floor division is not `floor(a / b)`, and that PyTorch's CPU float remainder keeps the dividend's sign on a zero result, which contradicts its own header.

The Kiln probe confirmed the current refusals (`div`, `floor` over integers) and exposed a pre-existing exactness bug in the loop-level constant folder that a BigInt division would inherit.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Specify sign, zero, overflow and promotion behavior precisely enough to write reference functions and tests.
**Inferred user intent:** The user flagged "needs care with signs"; the guide must leave no sign case to guesswork.
**Commit (code):** none.

### What I did
- Ran `python3 -I` probes in the scratchpad against torch `2.11.0+cu130` (`torch.cuda.is_available()` is `False` on this host) covering `//`, `floor_divide`, `div` with each `rounding_mode`, `%`, `remainder`, `fmod`, dtype promotion with Python scalars, 0-dim tensors, bool operands, float operands, division by zero and `INT_MIN` by `-1`.
- Ran each division-by-zero and overflow expression in its own process after the combined probe died.
- Read `torch/include/c10/util/generic_math.h` lines 25-108 (`div_floor_floating`, `div_floor_integer`, `div_mod`).
- Traced a small module with `torch.fx.symbolic_trace` to get the FX targets for each spelling.
- Wrote and ran a node probe (`scratchpad/probe.mjs`) against `packages/kiln/src` for current behavior.
- Ran `node test/integer-arithmetic.mjs`, `node test/ix-load.mjs` and `pytest -q test_fx_compose.py -k integer`; all passed on CPU.

### Why
- The reference functions in `fns.js` are the semantic definition every other level is checked against, so they must encode PyTorch's behavior, including the edge cases.

### What worked
- Sign table for `a = [7, -7, 7, -7, 0, 6, -6]`, `b = [2, 2, -2, -2, 3, -3, 3]`: `//` gives `[3, -4, -4, 3, 0, -2, -2]`; trunc gives `[3, -3, -3, 3, 0, -2, -2]`; `%` gives `[1, 1, -1, -1, 0, 0, 0]`; `fmod` gives `[1, -1, 1, -1, 0, 0, 0]`; `a / b` is `float32`.
- Promotion: `i32 // 3` stays `int32`; `i64 // 2.0` is `float32` with values `[3., -4., 3., -4., 0., 3., -3.]`; `i32 // 0-dim i64` is `int32`; `i32 // 1-d i64` is `int64`; `bool // 2` is `int64`.
- `INT64_MIN // -1` returns `INT64_MIN`, `INT64_MIN % -1` returns `0`, `INT32_MIN // -1` returns `INT32_MIN`. `generic_math.h:63-67` special-cases this in `div_floor_integer`.
- `1.0 // 0.1` is `9.0` while `floor(1.0 / 0.1)` is `10.0`; over 200000 random f32 pairs the two disagree on 427. `div_floor_floating` (`generic_math.h:36-59`) computes `(a - fmod(a, b)) / b` with fix-ups.
- Kiln probe: `N.div(i64, i64)` and `N.div(i64, N.int(2))` throw `div over i64 values is not lowered`; `N.div(i64, 2.0)` is `f32`; `N.floor(i64)` throws `floor over i64 values is not lowered`.

### What didn't work
- The first combined probe exited with code 136 and no output (Python buffered its prints). 136 is 128 + 8, SIGFPE. Running cases individually identified the cause: `torch.div(torch.tensor([-2**63]), -1, rounding_mode='trunc')` exits 136. PyTorch's trunc path performs the raw x86 `idiv`, which traps.
- Integer division by zero on CPU raises `RuntimeError: ZeroDivisionError` for `//`, `%`, `fmod`, trunc `div`, for both a Python `0` and a zero tensor, i32 and i64.
- CUDA behavior could not be observed: no GPU on this host. It remains an open question for the GPU host.

### What I learned
- PyTorch CPU float `%` disagrees with its own header on signed zeros: `-0.0 % 1.0` and `-2.0 % 1.0` give `-0.0`, and `0.0 % -1.0` gives `0.0`, while `div_mod` (`generic_math.h:90-92`) would return `copysign(0, b)`. Python's float `%` follows the divisor. The vectorized and 0-dim paths agree with each other, so the CPU kernel is not the header function.
- The Kiln loop folder returns `1152921504606847000` for `add_i64(2^60, 1)`; the exact answer is `1152921504606846977`. `E.num` (`loop.js:51`) stores `+v` and has no `exact` field, unlike `kx.num` (`kernel.js:17`).
- `torch.floor` on an int64 tensor returns int64 unchanged, so Kiln's refusal of `floor(i64)` is a small adjacent gap.
- The Kiln GPU simulator (`emit.js:266-270`) holds values in `Float32Array` registers, so it is not an exact oracle for i64 kernels; the loop evaluator is.

### What was tricky to build
- A crash with no output. The cause was the combination of buffered stdout and a hardware trap; isolating each expression in its own process with the exit status printed made it visible.

### What warrants a second pair of eyes
- The signed-zero discrepancy in float remainder. Kiln's numeric harness compares with `torch.allclose`, which treats `-0.0 == 0.0`, so it would not catch either choice.

### What should be done in the future
- On the GPU host, record what PyTorch CUDA returns for integer division by zero and `INT_MIN` by `-1` in each mode, and what float `%` returns for signed zeros.

### Code review instructions
- Rerun the sign-table probe with `python3 -I -c "import torch; a=torch.tensor([7,-7,7,-7,0,6,-6]); b=torch.tensor([2,2,-2,-2,3,-3,3]); print((a//b).tolist(), (a%b).tolist(), torch.fmod(a,b).tolist())"`.

### Technical details
- FX targets from `symbolic_trace`: `operator.floordiv`, `operator.mod`, `torch.div` with kwarg `rounding_mode`, `torch.remainder`, `torch.fmod`, `torch.floor_divide`, and method `floor_divide`.

## Step 4: Write the design guide and validate its pseudocode on CPU

This step wrote the design document in the writing-style section order and then checked that the code it proposes is correct before anyone implements it. The guide's reference functions (JS) and CUDA helpers (C) were executed against PyTorch CPU results on 31974 generated cases; both matched exactly, and the C helpers ran under UBSan without an undefined-behavior report, including the `INT_MIN / -1` cases the helpers special-case.

The design's main choices are four named functions (`floordiv`, `remainder`, `truncdiv`, `fmod`) over i32 and i64, true division of integers promoted to f32, a reference that raises on a zero divisor, explicit `b == -1` handling in the CUDA helpers, and a prerequisite fix to the loop-level folder so i64 literals stay exact.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Assistant interpretation:** Produce the intern guide, with pseudocode trustworthy enough to copy.
**Inferred user intent:** An implementer should not discover a sign bug in the design itself.
**Commit (code):** none.

### What I did
- Wrote `design-doc/01-integer-floor-division-and-modulo-analysis-design-and-implementation-guide.md`: orientation (IR levels, `FNS`, promotion, resolution, `valueTypes`, the separate `ix.js` algebra), current state with a probe table, PyTorch semantics table, gap table, API, six decision records, pseudocode, two mermaid diagrams, a worked yolov10l example, five phases, test strategy, risks and open questions.
- Wrote `scripts/02-torch-expected.py` (PyTorch CPU expected values; 4000 random pairs per dtype plus edge cases), `scripts/02-validate-reference-pseudocode.mjs` (runs the Section 6.4 JS functions) and `scripts/03-validate-c-helpers.c` (the Section 6.5 helpers without `__device__`).
- Ran `python3 -I 02-torch-expected.py > expected.json` and `node 02-validate-reference-pseudocode.mjs expected.json` in the scratchpad.
- Ran `gcc -O2 -Wall -fsanitize=undefined -fno-sanitize-recover=all -o chk 03-validate-c-helpers.c` and piped the expected values through `./chk`.
- Checked `loop.js:18-28` (`intern`, `akey`) and `kernel.js:280-302` to correct two citations.

### Why
- The derivation of the floor fix-up is short but sign-sensitive; executing it is cheaper than reviewing it.
- The host gcc build is the CPU-only way to test C logic. It does not test NVRTC, which is the GPU-host part.

### What worked
- JS reference: `31974 cases, 0 mismatches; zero divisor raised in 8/8 functions`.
- C helpers: `31976 cases, 0 mismatches`, exit 0 under UBSan.

### What didn't work
- No failures in this step. The expected-value generator excludes `INT_MIN / -1` in trunc mode because PyTorch CPU dies with SIGFPE on it (Step 3); the C check asserts the reference's wrapped result for that case directly.

### What I learned
- `akey` keys a literal as `"#" + o.v` (`loop.js:28`), so the exactness fix must change the intern key too, or two i64 literals that agree in their double approximation would be merged into one node.
- `valueTypes` returns only the non-f32 names (`kernel.js:302`), which is why the CUDA emitter's `typeOf` defaults to f32 (`emit.js:48`).

### What was tricky to build
- Choosing a JS i32 implementation that is exact without BigInt. `Math.trunc(a / b)` is exact for int32 operands because the relative gap between the true quotient and the next integer is at least `1 / |a| >= 2^-31`, above double precision; `a - q * b` is exact because `|q * b| <= |a|`. The random test covers full-range i32 operands.

### What warrants a second pair of eyes
- The decision to leave kernel behavior at a zero divisor unspecified. It matches C and, by inference, PyTorch CUDA, but this was not observed on a GPU.
- The `flops` values for integer division are unmeasured placeholders.

### What should be done in the future
- Phase 4 on the GPU host: replay, PTX inspection for literal divisors, and observation of the zero-divisor result.

### Code review instructions
- Start with Sections 4.4, 6.4 and 6.5 of the design doc.
- Reproduce: `cd` to the scratchpad, run the three commands under "What I did".

### Technical details
- The helper fix-up: `q - ((r != 0) & ((r ^ b) < 0))` and `r + (((r != 0) & ((r ^ b) < 0)) ? b : 0)`, with `b == -1` returning the wrapping negation (division) or 0 (remainder).

## Step 5: Isolate scratchpad drafts and do the docmgr bookkeeping

This step responded to a coordinator instruction about the shared scratchpad and did the ticket bookkeeping. Other agents had overwritten each other's drafts there, so my three draft files moved into a private `kiln011/` subdirectory, and the Kiln probe that Step 3 cites was copied into the ticket's `scripts/` so the evidence does not depend on scratch space. The validation from Step 4 was rerun from the new location with the same result.

The bookkeeping (relating files, adding tasks, the changelog, the index overview and `docmgr doctor`) was slow because several agents were running docmgr in the same repository at the same time.

### Prompt Context
**User prompt (verbatim):** see Step 1.
**Coordinator instruction (relayed, not a user message):** keep all drafts in `scratchpad/kiln011/`, use no bare filenames in the shared scratchpad, and before finishing re-read the design doc end to end to confirm it contains only KILN-011 material.
**Assistant interpretation:** Move my files, keep the cited evidence reproducible, and verify the design doc was not touched by another agent.
**Commit (code):** none.

### What I did
- Listed the shared scratchpad and identified my files by name, timestamp and content: `probe.mjs` (07:40), `expected.json` and `chk` (07:45).
- `mv` moved them into `scratchpad/kiln011/`. Steps 3 and 4 refer to these files at the scratchpad root; their current location is `scratchpad/kiln011/`.
- Copied the probe to `scripts/04-probe-kiln-current.mjs` with a header comment, and ran it.
- Reran `02-torch-expected.py` and `02-validate-reference-pseudocode.mjs` in `scratchpad/kiln011/`: `31974 cases, 0 mismatches; zero divisor raised in 8/8 functions`.
- `docmgr doc relate --doc design-doc/01-...md` with 7 `--file-note` entries: `fns.js`, `tensor.js`, `loop.js`, `emit.js`, `ix.js`, `fx_import.py`, `test/integer-arithmetic.mjs`.
- `docmgr task add` for Phases 0 through 4.

### Why
- The ticket's scripts directory is tracked and survives the session; the scratchpad does not.

### What worked
- `docmgr doc relate` reported `Related 7 file(s) ... (added 7, updated 0, removed 0)`.
- The rerun validation matched Step 4 exactly.

### What didn't work
- The loop of five `docmgr task add` calls added two tasks (`4zqu`, `thmj`) within the 180 s foreground limit and was then moved to the background, where it continued. Each docmgr call took tens of seconds, which I attribute to concurrent docmgr use by other agents; I did not diagnose it further.

### What I learned
- Shared scratch space across concurrent agents needs per-agent subdirectories from the first file onward.

### What was tricky to build
- Telling my files apart from other agents' similarly named ones (`p.mjs`, `dbg.py`, `nest.mjs` are not mine). Timestamps inside this session's window, plus content, decided it.

### What warrants a second pair of eyes
- N/A.

### What should be done in the future
- N/A.

### Code review instructions
- `node ttmp/2026/11/01/KILN-011--*/scripts/04-probe-kiln-current.mjs` reproduces the Step 3 Kiln probe.

### Technical details
- Private scratch directory: `/tmp/claude-1000/-home-manuel-code-wesen-kiln-worktrees-passnet/cd5f3680-095d-4dc0-be9b-3833056c7f6a/scratchpad/kiln011/`.

## Step 6: Final verification (milestone)

The design doc was re-read end to end and contains only KILN-011 material. Three small corrections were made during that read: the out-of-scope note now points to Section 9 (Phase 3) as well as Section 11, the PTX reference points to Section 10.3, and the claim that PyTorch CUDA does not check divisors is labelled as inferred from `div_floor_integer` and not verified on a GPU.

- Tasks: five phase tasks present (`4zqu`, `thmj`, `7tch`, `jgzu`, `9idx`), all open; no implementation was done in this ticket.
- `docmgr changelog update --ticket KILN-011` recorded the delivery.
- `docmgr doctor --ticket KILN-011 --stale-after 30`: "All checks passed".
- Not done here, by instruction: reMarkable upload (the coordinator does it) and git commits.

## Step 7: Implementation start and Phase 0, exact int64 literals through loop-level folding

This step begins the implementation of the design guide in its own worktree and lands Phase 0, the prerequisite fix for i64 constant folding that the coordinator assigned to this ticket. The fix turned out to be wider than the guide's Section 6.6 described: besides `E.num` and the `"#"+v` intern key, the serial loop evaluator rounded every literal operand through `Math.fround`, so `N.add(i64, N.int(16777217))` evaluated to `16777216` at the loop level while the reference gave `16777217`, and the frontend splat folds (`foldSplatView`, `foldSplatEw`) dropped the dtype of the constants they produced, so a folded i64 scalar became an f32 constant holding a BigInt that crashed the printer.

All four defects are fixed, a new test (`test/integer-constant-folding.mjs`) covers them, and both suites pass (49 node test files, 177 pytest tests).

### Prompt Context
**User prompt (verbatim):** "then, can we work on them in parallel (in separate worktrees maybe?)"
**User prompt (verbatim):** "tell each agent to use their own diary and to folow the diary format as they go, and to write a full report for the go-go-parc vault once they are done ( write a detailed project report for the obsidian vault as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the bsidian vault when done (go-go-parc vault). )"
**Coordinator instruction (relayed, not a user message):** implement KILN-011 in worktree `/home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod` on branch `impl/kiln-011-floordiv-mod`; also own the fix for i64 constant folding through `Number()` in `loop.js` `E.op` and its `"#"+v` cache key; CPU-buildable phases only, no GPU host.
**Assistant interpretation:** Implement Phases 0-3 of the guide (Phase 3 as far as quality allows), commit locally at intervals, keep this diary in the investigation format, and finish with a vault report.
**Inferred user intent:** Parallel tickets that each land a reviewable branch, with a written record good enough to review without re-deriving the work.
**Commit (code):** e1fad06 — "KILN-011 Phase 0: exact int64 literals through loop-level folding"

### What I did
- Ran the baseline: `cd packages/kiln && npm test` (exit 0, "all 48 passed"), `cd integrations/passnet && python3 -m pytest -q` (exit 0, 177 passed).
- Wrote a probe, `scratchpad/KILN-011-impl/probe-phase0.mjs`, before changing code. Output (saved as `probe-phase0.before.txt`):
  - `fold 1152921504606847000 undefined` (the guide's Section 4.2 defect);
  - `bigint num: Cannot convert a BigInt value to a number` (`E.num(2n**60n)` threw);
  - `ref [ 16777217n, 16777218n ]` against `loop [ 16777216n, 16777217n ]` for `N.add(x_i64, N.int(16777217))`: a new finding, not in the guide.
- `loop.js`: `E.num` takes a BigInt and stores `{ v: Number(v), exact: String(v) }`; `akey` keys an exact literal as `"#<digits>n"`, so it never collides with a number literal or with another i64 that shares a double; `E.op` folds typed integer applications with `litValue` (BigInt from `exact`, else the number) and no `Number()`, and lets a raising reference propagate; `printE`/`printNest` print exact digits.
- `loop.js` `schedule`: the `opnd` of a literal carries `exact`; `compileSerial` and `compilePoint` use a new `jsLiteral(o, spec)`: an exact literal is spelled `(<digits>n)`, a literal operand of a typed function whose `args` is an integer dtype is spelled raw, and only remaining literals are `Math.fround`ed.
- `loop.js` lift: a new `splatLiteral` makes an i64 splat an exact BigInt literal.
- `kernel.js` `opnd`: `kx.num(BigInt(o.exact))` for exact literals, so `ilit` prints exact digits in CUDA (one-line change; kernel.js is shared with KILN-008).
- `tensor.js`: `foldSplatView` and `foldSplatEw` keep `dtype`; `convert` uses a new `convertScalar` that accepts BigInt values; `tensor.const` printing uses `constText`, which prints BigInts.
- Added `packages/kiln/test/integer-constant-folding.mjs`.

### Why
- Integer division (Phase 1) folds BigInt quotients; without exact literals, quotients of large i64 constants would be rounded and a folded zero divisor would surface as a raw `RangeError`.
- The evaluator literal fix belongs here because the loop evaluator is the CPU oracle for every kernel (guide Section 10.1); an oracle that rounds integer literals above 2^24 would hide bugs in the new functions.

### What worked
- After the change the probe prints `fold 1152921504606847000 1152921504606846977`, `intern distinct true #1152921504606846976n #1152921504606846977n`, and `loop [ 16777217n, 16777218n ]`, equal to the reference.
- `npm test`: exit 0, "all 49 passed". `pytest -q`: exit 0, 177 passed.

### What didn't work
- First version of the test failed in the pipeline: `AssertionError [ERR_ASSERTION]: Cannot convert a BigInt value to a number` at the `assert.ok(!r.error, ...)` line. The stack (from `scratchpad/KILN-011-impl/dbg1.mjs`) was `TypeError: Cannot convert a BigInt value to a number at Object.print (src/std/tensor.js:368:196)` inside `printGraph`. Cause: `foldSplatEw` folded `add_i64(N.int(2**60), N.int(1))` into `tensor.const({ value: 1152921504606846977n, shape })` with no dtype, so the constant was f32 and its printer did `+value`. Fixed by keeping dtype in both splat folds and printing BigInts with `constText`.

### What I learned
- The splat folds dropped dtype before this change too; integer graphs still worked because typed functions take their literal context from the function's `args`, not from the constant's type. Every `add_i64` fold of two splats returns a BigInt, so folding two i64 scalar constants crashed in the printer before this change as well, whatever their magnitude.
- Kernel-level literals (`kx.num`) already had an `exact` field; only the loop level lacked it.

### What was tricky to build
- Choosing where the evaluator decides a literal's spelling. The schedule does not record a context dtype for literals, so `jsLiteral` takes the consuming function's spec: integer-arg typed functions get the raw integer; exact literals are always BigInt (they only arise in i64 contexts: i64 splats and i64 folds); everything else keeps f32 rounding, which the f32 kernel registers require.
- Keeping `E.num(5)` and `E.num(5n)` distinct nodes. If they shared a key, whichever was interned first would be returned for both, and a BigInt literal could reach an f32 function, where mixing BigInt and number throws.

### What warrants a second pair of eyes
- `jsLiteral` spells an exact literal as a BigInt in every context. If an exact literal ever reaches an untyped f32 function, the evaluator would throw a `TypeError` mixing BigInt and number. Resolution inserts `to_f32` casts (which fold to numbers), so I do not expect it, but no assertion enforces it.
- The dtype-preserving splat folds change the type of folded constants (from f32 to their real dtype). The suite passes; a reviewer should still consider f16/bf16 splats viewed through `foldSplatView`, which now stay f16/bf16.

### What should be done in the future
- `N.int(v)` accepts only JS numbers from the importer, so a Python int above 2^53 is already rounded in the generated script. The importer could emit BigInt literals (`N.int(123n)`); not needed by any corpus graph.

### Code review instructions
- Start at `packages/kiln/src/std/loop.js`: `E`, `litValue`, `akey` case `"num"`, `jsLiteral`, `splatLiteral`.
- Then `tensor.js` `foldSplatView`, `foldSplatEw`, `convertScalar`, `constText`, and `kernel.js` `opnd`.
- Validate: `cd packages/kiln && node test/integer-constant-folding.mjs && npm test`.

### Technical details
- Intern key forms: number literal `#16777217`; exact literal `#1152921504606846977n`.
- Evaluator spellings: `F.add_i64(in0, (16777217))` (integer-arg context), `F.add_i64(in0, (1152921504606846977n))` (exact), `F.mul(in0, (0.10000000149011612))` (f32).

## Step 8: Phase 1, typed integer division functions, resolution and CUDA helpers

This step adds the four integer divisions as typed `FNS` functions over i32 and i64, the resolution rules in `resolveEw`, the frontend API (`N.floordiv`, `N.remainder`, `N.fmod`, `N.div(a, b, rounding)`), and the CUDA device helpers with a helper-collection step in `toCuda`. Integer true division (`a / b`) now resolves to f32 division instead of being refused.

The implemented reference functions were checked against the 31974 PyTorch CPU cases from the research step (0 mismatches), and the exact helper text that `toCuda` emits was host-compiled with gcc under UBSan and run on the same data (31976 cases, 0 mismatches). The new test `test/integer-division.mjs` passed on its first run, so I printed the generated CUDA for the yolov10l idiom to confirm that the kernels really apply the helpers rather than passing for an unrelated reason.

### Prompt Context
**User prompt (verbatim):** see Step 7.
**Assistant interpretation:** Implement guide Phase 1 (Sections 6.1-6.5, 8.1) and its CPU test (Section 10.1).
**Inferred user intent:** Integer `//`, `%`, trunc division and `fmod` that agree with PyTorch on every sign, with a CPU oracle that proves it.
**Commit (code):** f83c346 — "KILN-011 Phase 1: typed integer floordiv, remainder, truncdiv and fmod"

### What I did
- `fns.js`: `INTEGER_DIVISION` (i64 with BigInt, i32 with `Math.trunc` and `a - q * b`), a shared `stepsDown(r, b)` predicate, `zeroDivide()` raising `KilnError("ZeroDivisionError", "integer division by zero")`, exported `INTEGER_DIVISIONS` (the four frontend names), eight entries `{floordiv,remainder,truncdiv,fmod}_{i32,i64}` with `c: "kiln_<op>_<t>({0}, {1})"`, `w: null`, `args`/`type` = t, `helper: "kiln_<op>_<t>"`, and placeholder `flops` (20 for i32, 60 for i64, commented as unmeasured).
- `fns.js`: exported `CUDA_HELPERS`, the device-function source per helper name: the four division helpers generated for `int`/`unsigned int` and `long long`/`unsigned long long`, plus `kiln_round_tf32` moved from `emit.js`. `round_tf32` gained `helper: "kiln_round_tf32"`.
- `emit.js`: `cudaHelpers(body)` walks the kernel body with a `JSON.stringify` replacer, collects the `helper` of every applied function, and `toCuda` emits each once (sorted). This replaced the string search for `"round_tf32"`.
- `tensor.js` `resolveEw`: `div` over an integer or bool promoted dtype returns `{ fn: "div", casts: [f32 for every non-f32 operand] }`; for the four integer divisions, a promoted dtype other than i32/i64 throws `TypeError: <fn> over <t> values is not lowered`, and a literal zero divisor (`isLiteralZero`) throws `ZeroDivisionError`.
- `tensor.js` `N`: `div(a, b, rounding = null)` dispatches `"floor"` to `N.floordiv` and `"trunc"` to `N.ew("truncdiv", ...)` and refuses other modes; `floordiv`, `remainder`, `fmod`; matching `nn.methods`.
- `test/integer-arithmetic.mjs:34`: the refusal assertion for `N.div(i64, i64)` became `assert.equal(..., "f32")`.
- New `test/integer-division.mjs` (sign table plus INT_MIN/INT_MAX rows, per dtype, at function, frontend and loop levels; CUDA text; values past 2^53; promotion; refusals; true division; data zero divisor; the yolov10l idiom; folding).
- New ticket scripts: `scripts/05-validate-fns-against-torch.mjs` (imports the real `FNS`) and `scripts/06-host-check-emitted-cuda-helpers.mjs` (writes a C file from `CUDA_HELPERS`, compiles with `gcc -O2 -Wall -Werror -fsanitize=undefined -fno-sanitize-recover=all`, runs it on the expected values).

### Why
- A `helper` field and a collected preamble keep each helper defined once per kernel and let any future helper function (or `kiln_round_tf32`) declare itself in the function table instead of in a string search in the emitter.
- The float refusal is explicit (`floordiv over f32 values is not lowered`) instead of the previous `unknown function "floordiv"`, so the error names the missing feature; Phase 3 replaces it.

### What worked
- `python3 -I scripts/02-torch-expected.py > scratchpad/KILN-011-impl/expected.json`, then `node scripts/05-validate-fns-against-torch.mjs <repo> expected.json`: `31974 cases, 0 mismatches; ZeroDivisionError raised in 8/8 functions`, exit 0.
- `node scripts/06-host-check-emitted-cuda-helpers.mjs <repo> expected.json scratchpad/KILN-011-impl`: `31976 cases, 0 mismatches (8 helpers)`, exit 0.
- `node test/integer-division.mjs` passed. The yolov10l kernel body is `v0 = kiln_floordiv_i64(in0, 80LL);` with the helper defined above the `__global__` function (printed with `scratchpad/KILN-011-impl/show-yolo.mjs`).
- `npm test`: exit 0, "all 50 passed". `pytest -q`: exit 0, 177 passed.

### What didn't work
- No failures in this step.

### What I learned
- `nn.ew` reference evaluation already threads a raising reference through as a `KilnError`, so a data zero divisor raises `ZeroDivisionError` in both `g.eval` and the loop evaluator without any new code.
- Confirmed on the base commit (373766b, extracted to `scratchpad/KILN-011-impl/base/`) that `N.add(x, N.add(N.int(3), N.int(1)))` over i64 already failed with `TypeError: Cannot convert a BigInt value to a number at Object.print (src/std/tensor.js:368:196)`; Step 7's splat-fold fix is what makes the folding assertions at the end of the new test pass.

### What was tricky to build
- The expected values for the INT_MIN rows. `INT_MIN + 1` divided by `-2` is the one row where the quotient is not a small constant; I computed it in the test from BigInt arithmetic for i64 and `Math.floor`/`Math.trunc` for i32, and pinned the i64 value to `2^62 - 1` with an assertion so a mistake in the expression cannot pass silently.
- The helper-collection walk must see function names inside every statement form (lets, reduction combines, shared-memory stores). A `JSON.stringify` replacer that inspects every `fn` key covers all forms without knowing them, at the cost of serializing the body once, which the old string search also did.

### What warrants a second pair of eyes
- `0u - (unsigned long long)a` in the i64 helpers: `0u` is `unsigned int` and is converted to `unsigned long long` by the usual arithmetic conversions, so the subtraction is 64-bit. The host check compiles it with `-Wall -Werror`, but NVRTC is not the host compiler.
- `isLiteralZero` checks only a direct `tensor.const`. A zero divisor that arrives through a view or a folded expression is not refused at construction; it raises in the reference and, if both operands are literals, in the folder.

### What should be done in the future
- Phase 4 on the GPU host: NVRTC compile, replay against PyTorch CUDA, PTX inspection for a literal divisor, and measured `flops`.

### Code review instructions
- `packages/kiln/src/std/fns.js`: `INTEGER_DIVISION`, `stepsDown`, `CUDA_HELPERS`, `cudaDivisionHelpers`.
- `packages/kiln/src/std/tensor.js`: `resolveEw`, `isLiteralZero`, `N.div`.
- `packages/kiln/src/std/emit.js`: `cudaHelpers`.
- Validate: `cd packages/kiln && node test/integer-division.mjs && npm test`; and the two ticket scripts as in "What worked".

### Technical details
- Helper text (i64): `if (b == -1) return (long long)(0u - (unsigned long long)a); long long q = a / b, r = a % b; return q - (long long)((r != 0) & ((r ^ b) < 0));`.
- Resolution examples: `N.floordiv(i32, N.int(3))` → `floordiv_i32`, casts `[null, "i32"]`; `N.div(i64, i32)` → `div`, casts `["f32", "f32"]`; `N.floordiv(bool, N.int(2))` → `floordiv_i64`, casts `["i64", null]`.

## Step 9: Phase 2, importer mappings and the corpus check on CPU

This step teaches the PassNet importer every FX spelling of integer division and checks the result on the real corpus graphs that use it. A new `division` operation in `fx_import.py` handles the function and method spellings of `//`, `%`, `floor_divide`, `remainder`, `fmod` and `torch.div` with its `rounding_mode` keyword; in-place `//=` and `%=` join the existing in-place arithmetic. Method `div` moved out of `BINARY_METHODS` into the new operation so that `x.div(y, rounding_mode="floor")` is accepted.

The corpus check imported all 25 upstream graphs whose forward divides tensors and compared Kiln with PyTorch CPU on random inputs with negative dividends: 24 import and agree exactly at both the frontend and loop levels; the 25th (Mask2Former, `float32 // 2`) is refused with the new floating-operand error, which Phase 3 addresses. The 30 census graphs that imported before and whose source contains `//` or `%` (symbolic shape arithmetic) still import.

### Prompt Context
**User prompt (verbatim):** see Step 7.
**Assistant interpretation:** Implement guide Phase 2 and run the corpus graphs through import and CPU numerics, which the guide had listed under Phase 4 but which need no GPU.
**Inferred user intent:** An honest importer: graphs that use integer division either import correctly or are refused with a reason.
**Commit (code):** b093150 — "KILN-011 Phase 2: import //, %, fmod and torch.div rounding modes"

### What I did
- Traced a module with every spelling under `symbolic_trace` to see the FX targets: `operator.floordiv`, `operator.mod`, `torch.div` (with `rounding_mode` in kwargs), `torch.fmod`, `torch.remainder`, `torch.floor_divide`, methods `floor_divide` and `div`. `a2 //= 3` under plain `symbolic_trace` becomes `operator.floordiv`; under `fx_trace.trace_module` it is `operator.ifloordiv`.
- `fx_import.py`: `DIVISION_FUNCTIONS`, `DIVISION_METHODS`, `lower_division`: exactly two positional operands, `rounding_mode` only for `div`, the mode must be `None`, `"floor"` or `"trunc"`, the result must be a tensor (`c.meta` a dict), and floor/remainder/fmod/rounded div must have an int32 or int64 result. `INPLACE_BINARY` gained `_operator.ifloordiv` and `_operator.imod`.
- `test_fx_import.py`: `test_integer_division` (14 spellings in one module, int32 dtype, in-place via `trace_module`, the float refusal for `x // 2` and for `torch.div(int, 2.0, rounding_mode='floor')`, and an edited graph with `rounding_mode="round"`).
- `test_fx_compose.py`: `test_integer_division_matches_torch`, ten outputs including `-7 // b` and `a / b`, over int64 and int32, `atol=0, rtol=0`.
- Ticket script `scripts/07-corpus-tensor-division-cpu.py` and its output `sources/02-corpus-tensor-division-cpu.json`. It reads the upstream graphs from the passnet worktree (`.../KILN-005-.../sources/upstream`, read only).
- Ticket script `scripts/08-recheck-census-division-graphs.py` (the census regression check).

### Why
- Refusing float floor division in the importer, rather than letting the Kiln script fail later, keeps the import audit's "blocked" category truthful: the graph is not lowered, and the error says why.
- The tensor-result check protects against SymInt arithmetic reaching the lowering. Dead SymInt nodes are removed by `corpus.eliminate_dead_code`, and the recheck shows no census graph is affected, but a live SymInt `//` would otherwise be lowered as a tensor operation.

### What worked
- `python3 scripts/07-corpus-tensor-division-cpu.py <upstream> <repo> sources/02-corpus-tensor-division-cpu.json`: `{'graphs': 25, 'imported': 24, 'exact': 24}` in 24 s. Operations covered: `floordiv` (yolov10l, eca_resnet33ts, EfficientNet), `remainder` (yolov10l, long-t5, Canine) and trunc `div` (fastconformer, int32).
- `python3 scripts/08-recheck-census-division-graphs.py <upstream> views-ops-import-v1.json <repo>`: `30 census-imported graphs whose forward has //, % or rounding_mode; 30 still import`.
- `pytest -q`: exit 0, 179 passed. `npm test`: exit 0, "all 50 passed".

### What didn't work
- The first run of the new numeric test crashed pytest with a faulthandler dump and no Python exception. My inputs included `-2**31` divided by `-1`, and the int32 case runs `torch.div(a, b, rounding_mode='trunc')`. Rerunning that expression alone, `python3 -I -c "import torch; a=torch.tensor([-2**31],dtype=torch.int32); print(torch.div(a, torch.tensor([-1],dtype=torch.int32), rounding_mode='trunc'))"`, exited with status 136 (SIGFPE), the same trap recorded in Step 3 for int64. The test now divides INT_MIN by `1` and INT_MAX by `-1`, with a comment; INT_MIN by `-1` stays covered by the JS test, where Kiln defines the result.
- My first smoke model used `7 // a` with a zero in `a`; `ShapeProp` raised `RuntimeError: ZeroDivisionError` while exporting. That was an input mistake.

### What I learned
- The sole-op graphs carry inputs whose dividends are nonnegative in the recorded metadata, but nothing in the importer depends on that; the numeric check used dividends in [-5000, 5000).
- The `bfloat16` and `float16` sole-op lists contain int64 division graphs too: the list name is the model's float dtype, not the dtype of the divided tensor.

### What was tricky to build
- Separating SymInt arithmetic from tensor arithmetic. The importer sees only exported FX nodes, so the reliable signal is the node's `tensor_meta`: a SymInt result has none. The corpus script uses the census heuristic (no `sym_` in the forward) only to choose which graphs to examine.

### What warrants a second pair of eyes
- `lower_division` requires positional operands; a keyword call such as `torch.div(input=a, other=b)` is refused as unsupported arguments. No corpus graph uses that form.
- `aten.*` spellings (`aten.floor_divide.default`, `aten.remainder.Tensor`, `aten.div.Tensor_mode`) are not mapped; the corpus does not contain them.

### What should be done in the future
- Phase 3 (float operands) would turn the Mask2Former graph from blocked to imported.

### Code review instructions
- `integrations/passnet/fx_import.py`: `INPLACE_BINARY`, `DIVISION_FUNCTIONS`, `DIVISION_METHODS`, `lower_division`.
- Validate: `cd integrations/passnet && python3 -m pytest -q test_fx_import.py test_fx_compose.py test_fx_trace.py`.

### Technical details
- Script lines produced for the smoke model: `N.floordiv(v0, v1)`, `N.remainder(v0, N.int(80))`, `N.div(v0, N.int(14), "trunc")`, `N.fmod(v0, v1)`, `N.div(v0, v1)` with expected dtype `"f32"`, `N.div(v0, v1, "floor")`, `N.floordiv(N.int(7), v1)`.

## Step 10: Phase 3, float32 floor division, remainder, fmod and trunc division

This step adds the float operands that the first slice refused. Four untyped f32 functions (`floordiv`, `remainder`, `fmod`, `truncdiv`) follow PyTorch's own algorithms rather than `floor(a / b)`, so mixed int/float operands now promote to f32 and resolve, `floor` of an integer is the identity, and the importer accepts float32 results and maps `torch.floor`. The Mask2Former `float32 // 2` graph now imports, which makes the corpus check 25 of 25 graphs imported and exact against PyTorch CPU.

Validation against 100576 PyTorch CPU float32 pairs found no mismatches in `//` and trunc division and no signed-zero differences, but 608 `fmod` and 608 `%` cases where PyTorch returns NaN and Kiln returns the exact C `fmodf` value. All 608 have a quotient `|a / b|` that overflows float32; PyTorch's vectorized CPU kernel computes through the quotient there. Kiln keeps C semantics, which is what the CUDA spelling computes.

### Prompt Context
**User prompt (verbatim):** see Step 7.
**Assistant interpretation:** Implement guide Phase 3 (Section 9, item 4) on CPU, with evidence against PyTorch.
**Inferred user intent:** Close the remaining corpus gap and make the importer's division coverage complete for float32.
**Commit (code):** a2dfa44 — "KILN-011 Phase 3: float32 floordiv, remainder, fmod and trunc division"

### What I did
- Read `torch/include/c10/util/generic_math.h:36-97` again for `div_floor_floating` and the floating `div_mod`.
- `fns.js`: `floordivF32` (port of `div_floor_floating`, each step rounded with `Math.fround`), `remainderF32` (`fmod` plus `b` when the signs differ; a zero `fmod` result is returned as is), `FNS.floordiv`, `FNS.remainder` (helpers `kiln_floordiv_f32`, `kiln_remainder_f32`), `FNS.fmod` (`fmodf`), `FNS.truncdiv` (`truncf((a) / (b))`), all `w: null`.
- `tensor.js` `resolveEw`: the four divisions accept f32 (literal-zero refusal only for integers); f16/bf16 are refused; `floor` over i32/i64 resolves to `copy`.
- `fx_import.py`: `ROUNDED_DIVISION_RESULTS` adds `torch.float32`; `UNARY` gained `torch.floor`.
- Tests: new `packages/kiln/test/float-division.mjs`; `integer-division.mjs` refusal lines became f32 and floor-identity assertions plus an f16 refusal; `test_fx_import.py` float cases now assert the imported script; new `test_fx_compose.py::test_float_division_matches_torch`.
- Ticket scripts: `scripts/09-torch-expected-float.py` (float32 bit patterns, 576 special-value pairs plus 100000 random), `scripts/10-validate-float-fns.mjs`, `scripts/11-host-check-float-helpers.mjs` (gcc, no fast-math, bit comparison of the C spellings with the JS references). Corpus rerun output: `sources/03-corpus-tensor-division-cpu-phase3.json`.

### Why
- `floor(a / b)` rounds the quotient before flooring; in f32, `1 // 0.1` is 9 in PyTorch and `floor(1 / 0.1f)` is 10. The guide's research found 427 of 200000 random pairs disagree; the new data set has 2402 of 100576 (`floor_of_quotient_differs_from_floordiv`).
- f16/bf16 are refused because PyTorch's kernel for those dtypes runs the same algorithm on the narrow type, rounding each step, while Kiln's untyped functions compute in f32 and round once. I did not verify the PyTorch half path; refusing is the conservative choice.

### What worked
- `node scripts/10-validate-float-fns.mjs <repo> expected-float.json`: floordiv 0 mismatches, truncdiv 0, remainder 0 (608 quotient_overflow), fmod 0 (608 quotient_overflow), 0 zero-sign-only differences.
- `node scripts/11-host-check-float-helpers.mjs <repo> expected-float.json <work>`: `{"cases":100576,"mismatches":{"floordiv":0,"remainder":0,"fmod":0,"truncdiv":0}}`.
- Corpus: `{'graphs': 25, 'imported': 25, 'exact': 25}`; census recheck: 30 of 30 still import.
- `npm test`: exit 0, "all 51 passed". `pytest -q`: exit 0, 180 passed.

### What didn't work
- First validation run: `MISMATCH remainder 1 1.401298464324817e-45 got 0 want NaN` and the same for `fmod`, 608 each. Classifying them (`scratchpad/KILN-011-impl/cat-float.mjs`, `cat-float2.mjs`): 412 have a subnormal divisor, 196 a normal one such as `fmod(1e30, 1e-30)` and `fmod(3.4e38, 0.1)`; the smallest `log2|a/b|` among them is 128.1, so every one overflows float32's quotient. A one-element tensor gives the exact answer (`torch.fmod(torch.tensor([1.0]), torch.tensor([1e-45]))` is `tensor([0.])`), so the NaN comes from the vectorized CPU path. The script now counts these as `quotient_overflow`.
- My hand-written expected value for `1 % 0.1` in `float-division.mjs` was wrong (`0.09999999403953552`; PyTorch gives `0.09999998658895493`). I regenerated every expected value of that test from PyTorch instead of writing them by hand.
- `assert.equal(Math.floor(1 / Math.fround(0.1)), 10)` failed with `9 !== 10`: the quotient was computed in double. The f32 quotient needs `Math.fround(1 / Math.fround(0.1))`.
- A CUDA regex expected `kiln_floordiv_f32(((float)(in0)), 2.5f)`; the kernel names the conversion as its own value (`v0 = ((float)(in0)); v1 = kiln_floordiv_f32(v0, 2.5f);`). The regex now matches that form.
- `test_float_division_matches_torch` first failed with `ValueError: floor: unsupported target torch.floor; implement semantic lowering`; fixed by mapping `torch.floor`.

### What I learned
- PyTorch CPU's float `%` returns fmod's zero (dividend's sign), confirming the research observation; the header's `div_mod` (`copysign(0, b)`) is not what the kernel runs. No zero-sign difference remained.
- PyTorch CPU vectorized `fmod`/`%` are not exact when the quotient overflows; C `fmodf` is. Kiln follows C.

### What was tricky to build
- Matching f32 rounding in JS. Each arithmetic step of `div_floor_floating` is rounded to f32 with `Math.fround`; this equals direct f32 arithmetic because a double has more than `2p + 2 = 50` bits for p = 24, so rounding to double and then to float gives the correctly rounded float for `+`, `-`, `*` and `/`. JS `%` is the exact IEEE fmod, as C `fmodf` is.

### What warrants a second pair of eyes
- The CUDA behavior of `fmodf` and of the PyTorch CUDA float remainder kernel at quotient overflow, and the sign of a zero remainder on CUDA. Both are GPU-host questions; the guide's open question about signed zeros is answered for CPU only.
- NVRTC's default `--fmad=true` cannot contract anything in `kiln_floordiv_f32` (there is no multiply), but this should be confirmed in PTX with the integer helpers.

### What should be done in the future
- Phase 4 on the GPU host (Step 11 lists the commands).

### Code review instructions
- `packages/kiln/src/std/fns.js`: `floordivF32`, `remainderF32`, the f32 entries, `kiln_floordiv_f32`, `kiln_remainder_f32`.
- `packages/kiln/src/std/tensor.js` `resolveEw`.
- Validate: `node packages/kiln/test/float-division.mjs`; scripts 09-11 as in "What worked".

### Technical details
- PyTorch CPU results used by `float-division.mjs`, e.g. `-7 // 2 = -4`, `0 // 3 = 0`, `-0 // 3 = -0`, `1 // 0.1 = 9`, `5.5 // 0 = inf`, `inf // 2 = nan`, `3 // inf = 0`, `-6 % 3 = -0`, `1 % 0.1 = 0.09999998658895493`, `trunc(1 / 0.1) = 10`.

## Step 11: Phase 4 preparation, GPU replay script and program fixtures

This step prepares everything the GPU host needs, without using it. A generator writes three Kiln programs (i32, i64 and f32 division, 4096 elements each, data and literal divisors of both signs) and exports them with `scripts/kiln-export.mjs` for the a100 target; the exporter's end-to-end check passes at the loop level for all three. A new `integrations/passnet/check_integer_division_cuda.py` replays them against PyTorch CUDA, records the zero-divisor and `INT_MIN / -1` behavior that the CPU host could not observe, and counts integer division instructions in NVRTC's PTX.

The export exposed one limitation that matters beyond this ticket: the exporter's end-to-end check uses all-zero integer reference inputs by default, so any program that divides by integer data fails the check with `integer division by zero` unless the project supplies reference data. Corpus graphs divide by literals, so they are unaffected.

### Prompt Context
**User prompt (verbatim):** see Step 7.
**Coordinator instruction (relayed, not a user message):** no GPU host; list exactly which GPU validations remain, with commands.
**Assistant interpretation:** Write the Phase 4 check so that the coordinator only has to run it.
**Inferred user intent:** A serial GPU queue run by the coordinator, fed by ready-to-run scripts.
**Commit (code):** 7c4ca98 — "KILN-011 Phase 4 prep: GPU replay script and division program fixtures"

### What I did
- `scripts/12-generate-division-programs.py <repo> [--target a100]` writes `sources/division-cuda-v1/division-{i32,i64,f32}.kiln.js` with `.data({...})` reference inputs (nonzero divisors, both signs) and exports `division-*.json` (kiln-program/1).
- `integrations/passnet/check_integer_division_cuda.py <dir> [--report out.json]`: (1) bit-exact replay of 11 integer outputs per dtype and 8 float outputs against PyTorch CUDA, with signed-zero differences counted separately; (2) edges: `[(INT_MIN, -1), (INT_MIN, 0), (7, 0), (-7, 0), (0, 0), (INT_MAX, -1)]` for the four integer functions, Kiln and PyTorch CUDA values recorded, Kiln's `INT_MIN / -1` results asserted against the reference; (3) NVRTC PTX for every kernel compiled for `compute_<capability>`, with counts of `div/rem.{s,u}{32,64}` and `mul.hi.*`.
- Checked tasks `4zqu`, `thmj`, `7tch`, `jgzu`; added and checked `ninw` (Phase 4 CPU prep). Task `9idx` (Phase 4 on the GPU host) stays open. Changelog updated; diary related to the 9 primary files.

### Why
- The PTX count makes the guide's claim checkable: a literal divisor should compile to a multiply-high sequence with the `b == -1` test folded, so `floor_lit`, `rem_lit`, `floor_neg`, `rem_neg`, `trunc_lit` and `fmod_lit` kernels should contain no `div.s*`/`rem.s*`.

### What worked
- Export: `: end-to-end check ok at loop` for i32, i64 and f32, with kernels such as `k_floordiv__8z663m71o TPB=64`.
- `python3 -m py_compile integrations/passnet/check_integer_division_cuda.py` succeeds; `pytest -q` still 180 passed (the check script is not collected).

### What didn't work
- First export: `: end-to-end check error: integer division by zero`. `scratchpad/KILN-011-impl/dbg-e2e.mjs` showed `inputsFor` returning all-zero `Int32Array` inputs because the project's `_data` was `null`: my first generator's string replacement that adds `.data(...)` had not matched, so the scripts had no reference data. I rewrote the generator without string patching; the exports then passed.
- The script cannot run here (no CUDA device); it has not been executed.

### What I learned
- `Project.inputsFor` (`packages/kiln/src/std/index.js:65`) fills integer inputs with zeros when no `.data()` is given, so the compile-time end-to-end check of any data-divisor integer division needs reference data.

### What was tricky to build
- Keeping the fixture's reference inputs deterministic and free of zero divisors in both dtypes without a seeded RNG in the script: the divisors are `((i * 104729) % 199) - 99`, with `0` replaced by `7`.

### What warrants a second pair of eyes
- The edge rows ask PyTorch CUDA for integer division by zero. The design expects garbage, not a trap, on the GPU; if PyTorch CUDA raises or the kernel faults, the script catches only `RuntimeError` from the expected-value computation.
- The fixtures target `a100`. If the GPU host requires another target spec, rerun script 12 with `--target`.

### What should be done in the future
- On the GPU host (coordinator): see Technical details. Then record the PTX counts, the edge values and measured `flops` in this ticket.
- Consider seeding nonzero reference inputs for integer divisors in `inputsFor` or in the importer's `attach_reference_data`, if data-divisor graphs enter the corpus.

### Code review instructions
- `integrations/passnet/check_integer_division_cuda.py`; `scripts/12-generate-division-programs.py`.

### Technical details
- GPU commands (from the repository root on the GPU host):
  - `python3 ttmp/2026/11/01/KILN-011-*/scripts/12-generate-division-programs.py . --target <spec>` (only if the target differs from a100; otherwise use the committed JSON);
  - `cd integrations/passnet && python3 check_integer_division_cuda.py ../../ttmp/2026/11/01/KILN-011-*/sources/division-cuda-v1 --report ../../ttmp/2026/11/01/KILN-011-*/sources/division-cuda-v1/report.json`.
- Corpus replay on the GPU (the 25 sole-op graphs): they are in `hf_sole_op_subgraphs*.txt`, not in the PassBench evaluation population; the CPU check is `scripts/07-corpus-tensor-division-cpu.py` (25/25 exact). A GPU replay needs a staging list built from `sources/03-corpus-tensor-division-cpu-phase3.json`'s graph paths with the coordinator's PassBench staging tools.

## Step 12: Vault report (milestone)

The deep-dive article for the go-go-parc vault is written and pushed: `/home/manuel/code/wesen/go-go-golems/go-go-parc/Projects/2026/11/01/ARTICLE - Kiln - Integer Floor Division and Modulo, Signs, Overflow and Exact Literals.md`, vault commit `87bd9ea` on `main` (`git pull --rebase` then `git push`; only the note was staged).

- Code commits on `impl/kiln-011-floordiv-mod`: e1fad06 (Phase 0), f83c346 (Phase 1), b093150 (Phase 2), a2dfa44 (Phase 3), 7c4ca98 (Phase 4 prep), 73d99d9 (docs).
- Last validation: `npm test` exit 0, "all 51 passed"; `pytest -q` exit 0, 180 passed; `docmgr doctor --ticket KILN-011 --stale-after 30`: all checks passed.
- Open: task `9idx`, Phase 4 on the GPU host (Step 11, Technical details).
