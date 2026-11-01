---
Title: Kiln direct writes of mutated inputs — intern analysis, design and implementation guide
Ticket: KILN-009
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
Summary: "Design for direct in-place writes of mutated inputs in the Kiln exporter, plus the family 162 matcher fixes; implementation pending."
LastUpdated: 2026-11-01T07:27:33.294058815-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln direct writes of mutated inputs — intern analysis, design and implementation guide

## Overview

Kiln compiles PassBench graphs that update an input in place (`x.relu_()`, `x += y`). Since commit 2be8918, the exported program writes the mutated input itself with a final write-back copy kernel, because PassBench's dispatch subclass refuses `copy_`. This ticket designs the optimization that lets the producer kernel write the input buffer directly, which removes one launch, 2·n·b bytes of traffic and a scratch buffer per mutation. The direct write is applied when a launch-order proof and a same-index proof over the exported kiln-program/1 succeed. The ticket also designs the two fixes that unblock family 162 (an unused in-place result rejected as dead code by SubgraphMatcher, and an `__eq__` spelling mismatch), both reproduced and checked on CPU.

Status: design delivered; implementation not started (Phases 1-5 in tasks.md). Phases 1-4 can be built and validated on a CPU-only host. Phase 5 (PassBench acceptance and timing) needs the GPU.

- Design guide: [design-doc/01-direct-writes-of-mutated-inputs-analysis-design-and-implementation-guide.md](./design-doc/01-direct-writes-of-mutated-inputs-analysis-design-and-implementation-guide.md)
- Diary: [reference/01-diary.md](./reference/01-diary.md)
- CPU experiments: `scripts/01-…` to `scripts/04-…`

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
