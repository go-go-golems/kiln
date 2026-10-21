---
Title: 'One execution core for Kiln and Perf Lab: hosts, environments, workload kinds and collectors'
Ticket: KILN-003
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - backend
    - evidence
DocType: index
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: "Replace Kiln executors, the Perf Lab runner and the designed ML-PERF-003 SSH executor with one execution core: captures run by jobs on probed hosts, planned from workload kinds and collectors, executed by one generic driver, imported from result archives into one catalog."
LastUpdated: 2026-10-20T19:53:06.09523-04:00
WhatFor: ""
WhenToUse: ""
---

# One execution core for Kiln and Perf Lab: hosts, environments, workload kinds and collectors

## Overview

Kiln runs generated kernels on GPU hosts through its CUDA executors; Perf Lab runs Python workloads only on the Mac;
ML-PERF-003 designed a third, SSH-based executor for Playback code on the DGX. This ticket replaces all three with one
core model: every measurement is a set of captures that a job runs on a host; hosts report probed facts from which
the server derives what they can run and why not; workload kinds (`kiln-kernels/1`, `kiln-program/1`,
`playback-dino/1`, `playback-redaction/1`, …) and collectors (CUDA events, `ncu`, `nsys`, NVTX, memory, stage timers,
a GPU sampler) are two registries in a browser-safe package; a standard-library driver runs the plan's steps as
containers under a per-GPU lock and packs a result archive. The design removes paths deliberately (guide §12.2).
ML-PERF-003 is closed as superseded by this ticket.

- Guide: [Intern guide: one execution core for Kiln and Perf Lab](design-doc/01-intern-guide-one-execution-core-for-kiln-and-perf-lab.md)
- Diary: [Investigation diary](reference/01-investigation-diary.md)
- Tasks: phases P0–P6 in [tasks.md](tasks.md)
- Status: guide written; no phase implemented yet.

## Key Links

- **Related Files**: See frontmatter RelatedFiles field
- **External Sources**: See frontmatter ExternalSources field

## Status

Current status: **active**

## Topics

- kiln
- perf-lab
- gpu
- backend
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
