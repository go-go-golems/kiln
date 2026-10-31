---
Title: Reproduce PassNet and evaluate reusable Kiln compiler transformations
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: index
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/loop.js
      Note: Existing fusion profitability rule
    - Path: repo://runtime/python/kiln_launch.py
      Note: CUDA pointer stream and scratch ownership
    - Path: repo://scripts/kiln-export.mjs
      Note: Compiler artifact export and validation
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-30T20:23:37.065533013-04:00
WhatFor: ""
WhenToUse: ""
---

# Reproduce PassNet and evaluate reusable Kiln compiler transformations

## Overview

Reproduce the original PassNet experiment independently, then evaluate Kiln-generated implementations and reusable compiler transformations through its benchmark. The work includes pinned source/dataset acquisition, compiler and runtime support, original-evaluator qualification, controlled measurements, agent synthesis and durable technical reporting. The goal remains active; import eligibility, fixture checks, benchmark acceptance and optimization results are separate evidence categories.

## Key Links

- [Project phases and current completion gates](reference/03-project-roadmap.md)
- [Capability waves for coverage and optimization breadth](reference/42-capability-waves-for-coverage-and-optimization-breadth.md)
- [Typed values and data-dependent indexing design](design-doc/21-typed-values-and-data-dependent-indexing.md)
- [Intern architecture and implementation guide](design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md)
- [Detailed chronological diary](reference/01-detailed-investigation-diary.md)
- [Latest qualification and original-agent audit report](reference/21-singleton-view-qualification-and-audited-original-agent-failure.md)
- [Current convolution numerical investigation](design-doc/19-convolution-accumulation-precision-and-protected-export-failure.md)
- [Complete project reassessment and next agent experiment](reference/22-project-reassessment-from-passnet-integration-to-reusable-compiler-optimization.md)
- [Meta-compiler study assessment and implementation priorities](design-doc/20-meta-compiler-study-assessment-and-optimization-artifact-implementation-priorities.md)
- [Softmax source contracts and qualification](design-doc/14-softmax-source-contracts-and-complete-family-qualification.md)
- [Cumulative original-evaluator coverage ledger](sources/kiln-coverage.json)
- Source papers, dataset receipts, archived references and experiment evidence: `sources/`.

## Status

Current status: **active**

## Topics

- kiln

## Tasks

See [tasks.md](./tasks.md) for the current task list.

## Changelog

See [changelog.md](./changelog.md) for recent changes and decisions.

## Structure

- design-doc/ - Architecture and design documents
- reference/ - Prompt packs, API contracts, context summaries
- playbooks/ - Command sequences and test procedures
- scripts/ - Temporary code and tooling
- various/ - Working notes and research
- archive/ - Deprecated or reference-only artifacts
