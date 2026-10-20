---
Title: 'Kiln and Perf Lab on real work: concrete kernels from factory-videos and Playback — intern analysis, design and implementation guide'
Ticket: KILN-002
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - compiler
    - evidence
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: 'Bring Kiln and Perf Lab onto real work: the factory web UI similarity matrix (WebGPU), zone-motion grey conversion in the factory runtime, and redaction mask post-processing in Playback.'
LastUpdated: 2026-10-20T11:06:09.927043-04:00
WhatFor: ""
WhenToUse: ""
---

# Kiln and Perf Lab on real work: concrete kernels from factory-videos and Playback — intern analysis, design and implementation guide

## Overview

KILN-001 joined Kiln (kernel compiler workbench) and Perf Lab (measurement workbench). Neither has yet produced a
kernel that a real program runs, and no Kiln kernel has been timed on NVIDIA hardware. This ticket chooses three real
workloads and carries each through measure → kernel → consumer reference → integration behind a switch → paired
comparison → consumer quality gate → evidence with identity:

- **A.** Window similarity matrix in the factory-videos web UI (WGSL / WebGPU).
- **B.** Grey conversion for zone motion in the factory runtime (WGSL via `wgpu` on the Mac, CUDA on the Spark).
- **C.** Redaction mask post-processing in Playback (CUDA).

Status: guide written; implementation phases P0, A, B, C, PN, PE, PR are tracked in `tasks.md`.

## Key Links

- Guide: `design-doc/01-kiln-and-perf-lab-on-real-work-intern-guide-to-the-first-production-kernels.md`
- Diary: `reference/01-investigation-diary.md`
- Research notes: `sources/01-factory-videos-research.md`, `sources/02-kiln-and-perf-lab-research.md`,
  `sources/03-playback-research.md`
- Previous ticket: `ttmp/2026/10/19/KILN-001--…/`

## Status

Current status: **active**

## Topics

- kiln
- perf-lab
- gpu
- compiler
- evidence

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
