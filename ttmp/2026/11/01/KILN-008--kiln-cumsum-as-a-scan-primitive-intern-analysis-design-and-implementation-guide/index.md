---
Title: Kiln cumsum as a scan primitive — intern analysis, design and implementation guide
Ticket: KILN-008
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
Summary: "Design guide for a scan primitive replacing the O(n^2) masked-reduction lowering of cumsum; CPU-only build and validation plan."
LastUpdated: 2026-11-01T07:27:33.231078574-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln cumsum as a scan primitive — intern analysis, design and implementation guide

## Overview

Kiln lowers `nn.cumsum` today as a masked reduction over a new last axis (`packages/kiln/src/std/tensor.js:524-533`), which costs n^2 work per row, is mapped onto the tiled matrix-product materializer for long rows, and fails to compile for the probed integer shapes with rows of 1,024 or more. This ticket's deliverable is an intern-facing analysis, design and implementation guide for a real scan primitive: `tensor.scan` in Tensor IR, an index-defined `E.scan` expression in Loop IR realized by a carried accumulator in the scheduler, fusion legality for scans, two first-slice GPU mappings (one thread per row; one block per row with a Hillis-Steele shared-memory scan) built from existing Kernel IR statements, cost-model branches, and deferred warp-shuffle and decoupled look-back mappings. It also answers whether the work can be built with only a CPU: Phases 0-5 yes (after extending the SIMT simulator to integer kernels), Phase 6 (CUDA compile, timing, replay) needs the GPU host.

Status: the design is written; no implementation has started. The phases are listed in [tasks.md](./tasks.md).

- Design guide: [design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md](./design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md)
- Investigation diary: [reference/01-diary.md](./reference/01-diary.md)
- Probe: [scripts/01-inspect-cumsum-lowering.mjs](./scripts/01-inspect-cumsum-lowering.mjs)

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
