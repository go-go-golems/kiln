---
Title: Kiln integer floor division and modulo — intern analysis, design and implementation guide
Ticket: KILN-011
Status: active
Topics:
    - kiln
    - compiler
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Design for typed integer floor division, modulo, trunc division and fmod in Kiln; CPU-first phases; corpus demand limited to 25 sole-op graphs."
LastUpdated: 2026-11-01T07:27:33.422838042-05:00
WhatFor: ""
WhenToUse: ""
---

# Kiln integer floor division and modulo — intern analysis, design and implementation guide

## Overview

This ticket is the design for adding integer floor division and modulo to Kiln: `//`, `%`, `torch.div(..., rounding_mode="floor"|"trunc")`, `torch.fmod`, and promoting integer true division (`a / b`) to f32. Today Kiln refuses every one of these with `div over i64 values is not lowered`. The difficulty is in the signs: C and CUDA truncate toward zero, PyTorch floors toward negative infinity.

The design adds four typed function families (`floordiv`, `remainder`, `truncdiv`, `fmod` over i32 and i64) in the existing `FNS` table, new rules in `resolveEw`, `N` API entries, CUDA helpers that make `INT_MIN / -1` explicit, and importer mappings. A prerequisite fix keeps i64 constant folding exact. The proposed JS reference and C helpers were checked on CPU against PyTorch on 31974 cases with 0 mismatches.

Corpus demand is small. The KILN-005 census has no tensor-level floor division or modulo; 25 upstream sole-op graphs use them, all with nonnegative dividends and positive literal divisors. Phases 0-3 build and validate on CPU only; Phase 4 (NVRTC compile, GPU replay) needs the GPU host.

Status: design delivered; no code implemented.

- Design guide: [design-doc/01-integer-floor-division-and-modulo-analysis-design-and-implementation-guide.md](./design-doc/01-integer-floor-division-and-modulo-analysis-design-and-implementation-guide.md)
- Diary: [reference/01-diary.md](./reference/01-diary.md)
- Evidence scripts: `scripts/01-census-div-mod.py`, `scripts/02-*`, `scripts/03-validate-c-helpers.c`, `scripts/04-probe-kiln-current.mjs`; census output in `sources/01-census-div-mod.out`.

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
