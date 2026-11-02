---
Title: Kiln tensor-core matrix products — intern analysis, design and implementation guide
Ticket: KILN-006
Status: active
Topics:
    - kiln
    - compiler
    - gpu
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Intern guide and diary for adding tensor-core (mma.sync) matrix products to Kiln as MAP=mma; CPU-only buildable except NVRTC and timing."
LastUpdated: 2026-11-01T07:27:33.096136092-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln tensor-core matrix products — intern analysis, design and implementation guide

## Overview

Kiln computes every matrix product (linear, matmul, bmm, pointwise convolution) with FP32 instructions on CUDA cores (`MAP=tiled`), while the cuBLAS/cuDNN reference uses tensor cores. This ticket holds the intern-facing analysis, design and implementation guide for a tensor-core path. The design adds a `MAP=mma` mapping beside `thread`/`row`/`tiled` and a warp-collective Kernel IR `mma` statement, emitted as PTX `mma.sync` (`m16n8k8` TF32, `m16n8k16` f16/bf16, FP32 accumulate) and emulated in the SIMT simulator. A per-precision tensor term is added to the cost model. The mapping is legal only for operands of tensor-core precision: f16/bf16 storage, or `round_tf32` producers under `--matmul-precision tf32`.

Design, code generation and correctness checks can all be built and run CPU-only, through the JS reference and the simulator. NVRTC compile checks and performance measurement need the GB10 host.

Status: the guide and diary are written; implementation (Phases 0-5 in tasks.md) has not started.

- Design guide: [design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md](./design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md)
- Diary: [reference/01-diary.md](./reference/01-diary.md)
- Probe script: [scripts/01-print-linear-contraction.mjs](./scripts/01-print-linear-contraction.mjs)

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- kiln
- compiler
- gpu

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
