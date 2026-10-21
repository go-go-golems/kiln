---
Title: 'Inventory database contract: JSON rows, diaries and crosslinks'
Ticket: KILN-004
Status: active
Topics:
    - kiln
    - perf-lab
    - compiler
    - backend
    - frontend
    - evidence
    - workbench-ui
DocType: playbook
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide/scripts/load_inventory.py
      Note: The loader this contract describes
    - Path: repo://ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide/scripts/schema.sql
      Note: PB-ARCH-001 inventory schema as received
    - Path: repo://ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide/scripts/schema-kiln.sql
      Note: KILN-004 extension (formats, diary_links, prompt_context)
ExternalSources: []
Summary: 'How KILN-004 inventory facts reach the SQLite database: one JSON file per area, diaries parsed from markdown, crosslinks by diary_step tags and by mention; vocabularies and package names shared by every area.'
LastUpdated: 2026-10-21T10:40:00-04:00
WhatFor: Writing inventory rows for KILN-004, or building the browsable site from its database.
WhenToUse: Before adding rows to various/inventory/<area>.json, or before querying various/kiln-inventory.sqlite.
---

# Inventory database contract: JSON rows, diaries and crosslinks

## Purpose

Every fact the KILN-004 inventory finds lands in one SQLite database,
`various/kiln-inventory.sqlite`, so that a browsable site can be built over it and every claim links back to source.
The database is **derived**: nobody writes it directly. It is rebuilt from two kinds of committed source files:

1. **Inventory JSON**, one file per area: `various/inventory/<area>.json`.
2. **Markdown diaries**, one per area, in `reference/`. The loader parses each `## Step N: …` into a
   `diary_entries` row, with one column per `### …` section.

Rebuilding from scratch on every load makes the load idempotent. The loader writes to a temporary file and renames it
into place, so concurrent runs are safe.

```bash
T=/Volumes/SSD/code/kiln/ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide
python3 $T/scripts/load_inventory.py --check   # validate everything; exit 1 on any problem
python3 $T/scripts/load_inventory.py           # rebuild the database
sqlite3 -header -column $T/various/kiln-inventory.sqlite 'select * from v_area_counts'
```

## Areas

| Area (`source_area`)   | Agent | Inventory JSON                                | Diary                                                                |
| ---------------------- | ----- | --------------------------------------------- | -------------------------------------------------------------------- |
| `orchestrator`         | —     | `various/inventory/orchestrator.json`         | `reference/01-investigation-diary.md`                                |
| `compiler-runtime`     | A     | `various/inventory/compiler-runtime.json`     | `reference/07-diary-a-compiler-runtime-launchers-and-cuda-runner.md` |
| `workbench-ui`         | B     | `various/inventory/workbench-ui.json`         | `reference/08-diary-b-the-kiln-workbench-page.md`                    |
| `server-exec-evidence` | C     | `various/inventory/server-exec-evidence.json` | `reference/09-diary-c-server-execution-core-and-evidence.md`         |
| `perf-lab`             | D     | `various/inventory/perf-lab.json`             | `reference/10-diary-d-perf-lab-and-the-kiln-lab-package.md`          |
| `history`              | E     | `various/inventory/history.json`              | `reference/11-diary-e-design-history-of-kiln-and-ml-perf-tickets.md` |

`various/inventory/agents.json` fills the `agents` table. The loader fills each agent's `commits` from `git log`
subjects that start with `KILN-004 A: ` … `KILN-004 E: `; orchestrator commits start with `KILN-004: `.

## JSON shape

An object whose keys are table names, each holding a list of rows keyed by column name. The loader fills
`source_area` from the file name. Lists and objects are stored as JSON text. On any row, two extra keys are
accepted that are not columns:

- `"diary_step": 3`, or `"diary_steps": [2, 3]`: the steps of **this area's diary** that found the row. Each one
  becomes an `explicit` row in `diary_links`, which is how a diary step links to what it found.

```json
{
  "modules": [
    {"package": "@kiln/kiln", "path": "packages/kiln/src/std/tile.js", "name": "tile IR stage", "kind": "ir-stage",
     "purpose": "…", "loc": 364, "key_exports": "lowerToTile; TileOp", "diary_step": 2}
  ],
  "facts": [
    {"subject": "@kiln/kiln", "fact": "…", "evidence_path": "packages/kiln/src/core/kiln.js", "evidence_lines": "40-88",
     "category": "architecture", "confidence": "observed", "diary_steps": [2, 4]}
  ]
}
```

The loader also adds `mentioned` links. When a step's text contains a row's key (a module, hotspot or reusable path,
a format name, a doc path, or a package name of eight or more characters), the step links to that row. Write paths in
the diary exactly as in the JSON (repo-relative) and the links come for free.

## Diary rules that the parser depends on

- Each step is a level-2 heading, `## Step N: Title`.
- Sections are level-3 headings named as in the diary skill's investigation format: `### Prompt Context`,
  `### What I did`, `### Why`, `### What worked`, `### What didn't work`, `### What I learned`,
  `### What was tricky to build` (or `### What was tricky`), `### What warrants a second pair of eyes`,
  `### What should be done in the future`, `### Code review instructions`, `### Technical details`. Any other
  level-3 section is appended to `technical_details` under its own heading.
- The prose between the step heading and its first `###` becomes `summary`.
- A `**Commit…**: <hash>` line inside the step sets `commit_hash`. Without one, the loader uses the commit that first
  added the step heading. `created_at` is that commit's author date.

## Natural keys

Rows are upserted on these keys (`INSERT OR REPLACE`). The same key from two areas is reported as a collision, and
the later file wins.

| Table                   | Key                                                     |
| ----------------------- | ------------------------------------------------------- |
| `packages`              | `name`                                                  |
| `modules`               | `path` (repo-relative file or directory)                |
| `functionalities`       | `name`                                                  |
| `functionality_modules` | `functionality`, `module_path`                          |
| `endpoints`             | `package`, `method`, `path`                             |
| `db_tables`             | `schema_name`, `name`                                   |
| `service_calls`         | `from_package`, `to_package`, `protocol`, `description` |
| `reusable_components`   | `name`                                                  |
| `duplications`          | `title`                                                 |
| `complexity_hotspots`   | `path`                                                  |
| `facts`                 | `subject`, `fact`                                       |
| `dependencies`          | `package`, `name`, `kind`                               |
| `docs`                  | `path`                                                  |
| `diagrams`              | `title`                                                 |
| `formats`               | `name`                                                  |

## Shared package names

`modules.package`, `endpoints.package`, `service_calls.*_package` and `dependencies.package` use these names, so
that rows from different areas join. The owner writes the `packages` row; other areas only refer to it.

| `packages.name`              | Path                         | Owner area             | `kind`           |
| ---------------------------- | ---------------------------- | ---------------------- | ---------------- |
| `@kiln/kiln`                 | `packages/kiln`              | `compiler-runtime`     | `library`        |
| `runtime/webgpu`             | `runtime/webgpu`             | `compiler-runtime`     | `library`        |
| `runtime/python`             | `runtime/python`             | `compiler-runtime`     | `python-runtime` |
| `runner`                     | `runner` (runner + driver)   | `compiler-runtime`     | `python-runtime` |
| `runner/docker`              | `runner/docker` (kiln-perf)  | `compiler-runtime`     | `docker-image`   |
| `imports/kiln-workbench-src` | `imports/kiln-workbench-src` | `compiler-runtime`     | `imported`       |
| `@kiln/workbench`            | `apps/workbench`             | `workbench-ui`         | `app`            |
| `scripts`                    | `scripts`                    | `workbench-ui`         | `tooling`        |
| `@kiln/server`               | `apps/server`                | `server-exec-evidence` | `app`            |
| `@kiln/exec`                 | `packages/exec`              | `server-exec-evidence` | `library`        |
| `@kiln/evidence`             | `packages/evidence`          | `server-exec-evidence` | `library`        |
| `@kiln/lab`                  | `packages/lab`               | `perf-lab`             | `library`        |
| `lab-workbench`              | `lab-workbench` (UI + lang)  | `perf-lab`             | `imported`       |
| `lab-workbench/server`       | `lab-workbench/server`       | `perf-lab`             | `imported`       |
| `lab-workbench/workloads`    | `lab-workbench/workloads`    | `perf-lab`             | `python-runtime` |

## Vocabularies

These replace the Playback-specific comments in `schema.sql`.

- `modules.kind`: `compiler-core`, `ir-stage`, `pass`, `emitter`, `simulator`, `cost-model`, `device-model`,
  `launcher`, `runner`, `driver`, `route`, `service`, `store`, `schema`, `job`, `kind`, `collector`, `evidence`,
  `statistics`, `lang`, `view`, `component`, `page`, `state`, `agent`, `tool`, `config`, `script`, `test-infra`,
  `preset`, `docs`.
- `functionalities.category`: `compiler`, `codegen`, `simulation`, `cost-model`, `tuning`, `presets`, `launch`,
  `measurement`, `jobs`, `hosts`, `evidence`, `statistics`, `lab-language`, `import`, `datasets`, `agent`,
  `views`, `reports`, `design-system`, `tooling`, `docs`. `surface`: `ui`, `api`, `cli`, `agent`, `background`,
  `library`.
- `functionality_modules.role`: `entry`, `ui`, `api`, `worker`, `schema`, `shared`, `test`.
- `endpoints.auth`: `none`, `local-only`, `token`, or as observed.
- `db_tables.schema_name`: `kiln` (the `apps/server` SQLite) or `perf-lab` (the `lab-workbench/server` SQLite).
- `service_calls.protocol`: `http`, `websocket`, `sse`, `process`, `fs`, `sqlite`, `docker`, `ssh`, `webgpu`,
  `cuda`, `llm-api`.
- `reusable_components.reuse_readiness`: `ready`, `needs-extraction`, `entangled`, `domain-specific`.
- `duplications.locations`: a JSON list of `{"path", "lines", "note"}`; `severity`: `low`, `medium`, `high`.
- `facts.category`: `architecture`, `contract`, `invariant`, `gotcha`, `decision`, `metric`, `history`,
  `security`, `performance`. `confidence`: `observed` (you read it) or `inferred`.
- `dependencies.kind`: `prod`, `dev`, `system`, `model`, `image`.
- `formats.kind`: `record`, `wire`, `file`, `archive`, `ir`, `manifest`, `protocol`.
- `docs.kind`: `readme`, `design-doc`, `reference`, `playbook`, `diary`, `memo`, `index`.
- `nats_subjects` does not apply to this codebase.

## Duplications that span areas

Name a duplication by what is duplicated, not by where you found it, for example "lab language compiler:
lab-workbench/src/lang vs packages/lab/src/lang". Two areas may describe the same duplication from their own side;
the loader reports the title collision, and the orchestrator reconciles both into one row in `orchestrator.json`.
