---
Title: Kiln index values, factory ops and slice assignment — intern analysis, design and implementation guide
Ticket: KILN-010
Status: active
Topics:
    - kiln
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Index values in Loop IR, factory ops, functional slice assignment; unblocks BEiT/ConViT/MPNet get_attr graphs, argmax, causal SDPA and a table-free cumsum mask."
LastUpdated: 2026-11-01T07:27:33.358285491-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln index values, factory ops and slice assignment — intern analysis, design and implementation guide

## Overview

Kiln can use loop coordinates only as addresses. This ticket designs an index-value expression node (`E.ix`) for the Loop IR, a Tensor IR primitive `tensor.ixval`, factory ops (`arange`, typed `zeros`/`full`, `meshgrid` as views), functional slice assignment (`nn.assign`, for `x[...] = y` and in-place arithmetic on views), and three consumers: argmax via an index-valued key, `is_causal=True` attention, and a cumsum mask without a data table.

Key finding: the 17 corpus graphs blocked by `get_attr` (BEiT, ConViT, MPNet) contain no constants; Kiln's symbolic tracer folds their factory code into `_tensor_constant0`. Dynamo, which feeds PassBench, keeps the factory nodes, and a prototype factory-preserving tracer removes every `get_attr`. All design and correctness work is CPU-only; NVRTC and PassBench replays need the GPU host.

Status: design delivered; implementation not started (Phases 0-6 in tasks.md).

- Design guide: [design-doc/01-index-values-factory-ops-and-slice-assignment-analysis-design-and-implementation-guide.md](./design-doc/01-index-values-factory-ops-and-slice-assignment-analysis-design-and-implementation-guide.md)
- Diary: [reference/01-diary.md](./reference/01-diary.md)
- Evidence scripts: `scripts/01-05` (CPU, torch 2.11)

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- kiln
- compiler

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
