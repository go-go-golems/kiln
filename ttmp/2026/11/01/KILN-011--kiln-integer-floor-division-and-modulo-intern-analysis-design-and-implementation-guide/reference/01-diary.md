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
RelatedFiles: []
ExternalSources: []
Summary: "Chronological investigation diary for the KILN-011 integer floor division and modulo design guide."
LastUpdated: 2026-11-01T07:32:41.937635327-05:00
WhatFor: "Records how the KILN-011 design guide was researched, what evidence it rests on, and what remains open."
WhenToUse: "Read before implementing integer div/mod in Kiln or when reviewing the KILN-011 design doc."
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
