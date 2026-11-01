---
Title: P3a typed values and data-dependent indexing — implementation plan
Ticket: KILN-005
Status: active
Topics:
    - kiln
    - passnet
    - compiler-optimization
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: packages/kiln/src/std/loop.js
      Note: E grammar (num/in/op/red) that gains value types and indirect loads
    - Path: packages/kiln/src/std/emit.js
      Note: toCuda — float temporaries and widening loads today
    - Path: integrations/passnet/fx_import.py
      Note: placeholder guard that rejects every non-floating input
ExternalSources: []
Summary: Three measured slices for typed values through the Loop IR — integer storage pass-through, then gathers via one indirect-load kind, then integer arithmetic and masks — each with a fail-loudly boundary and a census/GPU gate
LastUpdated: 2026-10-31T23:59:00-04:00
WhatFor: Implementing review §B2 / reference 42 Q1 without building a second compiler
WhenToUse: Before changing E, kernel registers, CUDA emission or the importer's input contract
---

# P3a typed values and data-dependent indexing: implementation plan

## Why this is the next capability

The largest import blocker in the capability frontier is `in_0: only supported floating tensor inputs accepted`. It is the first blocker for 119 graphs in 18 families, and for every one of those families it is the only first blocker (`sources/current-capability-wave-frontier-v1.json`). Script 653 and a manual read of samples show that the integer input serves three different purposes, and those purposes define the slices:

| Purpose | Example (sample prefix) | Needs |
|---|---|---|
| Storage pass-through | `in_0.view(-1, 1)` returned (0d135bc0); `.long()` on int64 (acb5482a) | typed loads/stores, identity casts, integer outputs |
| Dead scalar arithmetic | `in_0 // 8` → dead `sym_sum` (2f622ee9, 6744e9b4) | dead-code elimination before the dtype check (already in `corpus.eliminate_dead_code`) |
| Gather | `index_select` (e325920e); `embedding` (acb5482a, 5fc65ba8, a22a6160, c251f09f) | data-dependent indices in loads |
| Integer arithmetic and masks | `cumsum`, `ne`, `eq`, `masked_fill`, `floordiv` (1fcf9384, 390b4b97, 89d445d1, b1808162) | typed arithmetic and Boolean values |

## The constraint from today's code

`E` values are untyped doubles: `E.num` coerces with `+v`, and constant folding uses `Math.fround` (`loop.js:50-56`). Kernel temporaries are `float` (`emit.js`: `K.floats`), and loads widen (`u8` → `(float)`). An `int64` value above 2^24 would be corrupted silently. Integer support therefore cannot start in the importer. It has to start with a value type on `E`, as review §B2 says: one typed `E`, not a parallel scalar layer.

## Slice 1: integer storage pass-through

**Boundary.** `i64` and `bool` values may be loaded, stored, viewed (all index-map views) and identity-cast. Any arithmetic, comparison or float conversion on them is a compile error that names the op: `integer arithmetic is not lowered (slice 3)`. Failures are loud, so the census counts them instead of hiding wrong numbers.

**Changes.**
1. `E`: give each node a `dtype` (`E.load` takes its input's storage dtype; `num` defaults to f32). `op` and `red` refuse integer operands except the identity cast.
2. Kernel IR (`kernel.js`): typed value registers alongside `K.floats`. A load of an `i64` input declares a `long long` temporary; a store writes it unchanged.
3. `toCuda`: storage types `i64 → long long` and `bool → bool`, with no widening for integer loads. WGSL: `wgslUnavailable: "i64 storage"` (WebGPU has no 64-bit integers).
4. Runtime and dispatch (`runtime.py`): add `i64` and `bool` to `DTYPES`, taken from the single shared dtype table (review B1).
5. Export (A5): typed constants as exact little-endian bytes per dtype, with one test per dtype.
6. Importer: accept `torch.int64`/`torch.bool` placeholders. `.long()` on int64 and `.bool()` on bool are identity casts. Integer outputs are allowed.

**Gate.**
- An import census of the 18 families shows which graphs now import and the next first blocker of the rest.
- A CUDA fixture round-trips int64 values above 2^53 exactly.
- Only then is the first GPU replay frozen, for the families with no remaining blocker.

## Slice 2: gathers through one indirect-load kind

**Representation.** `{k: "in", i, idx}` where an `idx` entry may be an integer-typed `E` (another load) instead of an affine `IX` term (review §B2). `substE`, `inlineInto` and `free()` recurse into such entries.

**Legality.**
- `legalMaps` excludes `tiled` for kernels containing an indirect load.
- The cost model treats an indirect access as uncoalesced unless the index is a function of the outermost loop variables only. In that case each warp reads one row, which `embedding` does.

**Bounds.** PyTorch CUDA `embedding` and `index_select` device-assert on out-of-range indices. Kiln will record `bounds: "assume"` on the load (no check, matching release-mode CUDA behavior) and reject negative-index normalization unless the source proves non-negativity. Changing this is a protocol choice, so it stays declared and explicit.

**FX lowering.** `embedding(ids, W)` → `out[..., j] = W[ids[...], j]`; `index_select(x, d, ids)` → indirect load on dim `d`; `x[tensor]` (`getitem` with a tensor index) → the same form on dim 0.

**Gate.** As in slice 1: census, then a CUDA fixture (embedding with repeated and boundary indices), then a frozen replay.

## Slice 3: integer arithmetic and Boolean values

Typed function tables per dtype: integer `+ − × // %` with PyTorch's floor-division semantics, comparisons producing `bool`, `where/masked_fill` with Boolean conditions, and `cumsum` on integers, a scan that needs its own reduction form. Constant folding is per dtype, with BigInt for `i64`. This slice touches the reference interpreter (`compileSerial`/`compilePoint`) most heavily, and it comes last because it has the largest semantic surface.

## Order and measurement

Each slice ends with:
1. the import census of the 18 families;
2. the unit and CUDA fixtures;
3. a frozen GPU replay of the families that become fully importable, under the original checker.

A slice that imports graphs but fails numerically is reported as such, not merged into a coverage claim. Optimization work on gathers (gather fusion, index layout) waits until slice 2 is accepted.
