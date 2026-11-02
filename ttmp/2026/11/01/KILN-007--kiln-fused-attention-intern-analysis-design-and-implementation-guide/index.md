---
Title: Kiln fused attention — intern analysis, design and implementation guide
Ticket: KILN-007
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
Summary: "Design for one flash-style fused SDPA kernel in Kiln: recognizer, fusion rule, MAP=flash mapping and matFlash materializer; CPU-first validation."
LastUpdated: 2026-11-01T07:27:33.1666567-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln fused attention — intern analysis, design and implementation guide

## Overview

Kiln compiles PyTorch's scaled dot-product attention as three kernels (QK^T, softmax, P·V) and
materializes the L×S score matrix in global memory. This ticket designs a single flash-style kernel
(online softmax over key tiles) for it. The guide's key finding is that the fully fused attention is
already one Loop IR expression; the work is a recognizer, a fusion rule, a `MAP=flash` Tile mapping
and a Kernel IR materializer. Everything through CUDA source and NVRTC compilation can be built and
validated on a CPU-only host; timing, `ptxas` reports, the PassBench replay and an f16/bf16 numerics
probe need the GB10.

**Status:** design delivered; implementation not started (see tasks).

- Design doc: [design-doc/01-fused-attention-analysis-design-and-implementation-guide.md](./design-doc/01-fused-attention-analysis-design-and-implementation-guide.md)
- Diary: [reference/01-diary.md](./reference/01-diary.md)
- Experiments: `scripts/01-dump-attention-kernels.mjs`, `scripts/02-online-softmax-reference.mjs`, `scripts/03-forced-fusion-single-kernel.mjs`
- Related tickets: KILN-006 (tensor-core products), KILN-010 (index values, causal masks), KILN-011 (floor division, GQA)

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
