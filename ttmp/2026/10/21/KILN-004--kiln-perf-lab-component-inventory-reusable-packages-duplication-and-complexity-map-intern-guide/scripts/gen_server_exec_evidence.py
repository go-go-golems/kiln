#!/usr/bin/env python3
"""Write various/inventory/server-exec-evidence.json from inventory notes C.

Agent C stopped at its spend limit after diary Step 1 with an empty JSON file. The orchestrator derives the rows from
reference/04-inventory-notes-c-server-execution-core-and-evidence.md: route tables are parsed from the notes, the rest
is transcribed. Every row cites diary Step 1 of area C, which is where the notes were written.
"""
import json
import pathlib
import re

T = pathlib.Path(__file__).resolve().parent.parent
NOTES = T / 'reference/04-inventory-notes-c-server-execution-core-and-evidence.md'
OUT = T / 'various/inventory/server-exec-evidence.json'
STEP = {'diary_step': 1}


def table_after(text, heading):
    """Rows of the first markdown table after a heading, as lists of cell strings."""
    body = text.split(heading, 1)[1]
    rows = []
    for line in body.splitlines():
        if line.startswith('|'):
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if not set(''.join(cells)) <= set('-: '):
                rows.append(cells)
        elif rows:
            break
    return rows[1:]


def strip_ticks(s):
    return s.replace('`', '')


notes = NOTES.read_text()

endpoints = []
for method, path, handler, what in table_after(notes, '### 2.3 HTTP route table'):
    if path.startswith('/ and'):
        paths = ['/', '/index.html']
    else:
        paths = ['/api' + path]
    for p in paths:
        endpoints.append({'package': '@kiln/server', 'method': method, 'path': p,
                          'auth': 'none' if method == 'GET' else 'token',
                          'handler_path': 'apps/server/src/' + handler, 'description': strip_ticks(what), **STEP})
for method, path, contract in table_after(notes, '### 5.1 Routes'):
    endpoints.append({'package': 'runner', 'method': method, 'path': path.split('?')[0], 'auth': 'none',
                      'handler_path': 'runner/kiln_driver.py handler_for (879)', 'description': strip_ticks(contract),
                      **STEP})

packages = [
    {'name': '@kiln/server', 'path': 'apps/server', 'kind': 'app', 'language': 'typescript', 'runtime': 'node',
     'port': '5280 (KILN_PORT; 5380 in this session)', 'entrypoint': 'apps/server/src/index.ts',
     'purpose': 'Hono + node:sqlite server: records, devices, hosts, jobs, archives, SSE events, the Anthropic model '
                'gateway and the Perf Lab data routes; serves the built workbench page.',
     'loc_prod': 3022, 'notes': '79 tests in 9 files; jobs.test.ts drives the real driver against fake docker/nvidia-smi.',
     **STEP},
    {'name': '@kiln/exec', 'path': 'packages/exec', 'kind': 'library', 'language': 'typescript',
     'runtime': 'node + browser', 'entrypoint': 'packages/exec/src/index.ts',
     'purpose': 'Browser-safe execution model: host profiles, facts, requirements, offers, the WorkloadKind/Collector '
                'plug-in contracts, two kinds, eleven collectors, the planner and capture identity.',
     'loc_prod': 1964, 'notes': 'Only dependency: @kiln/evidence. 21 tests.', **STEP},
    {'name': '@kiln/evidence', 'path': 'packages/evidence', 'kind': 'library', 'language': 'typescript',
     'runtime': 'node + browser', 'entrypoint': 'packages/evidence/src/index.ts',
     'purpose': 'Provenance-carrying values, statistics (bootstrap CI, paired ratio), repetition order, pure-JS sha256, '
                'canonical JSON, identities, the kiln-measure/1 record and hypothesis verdicts.',
     'loc_prod': 1051, 'notes': 'Zero runtime dependencies, no node: imports, 133 tests; consumed by four packages.',
     **STEP},
]

S = 'apps/server/src/'
X = 'packages/exec/src/'
E = 'packages/evidence/src/'
mod_rows = [
    ('@kiln/server', S + 'index.ts', 'server boot', 'config', 38, 'boot', ''),
    ('@kiln/server', S + 'config.ts', 'env → config', 'config', 66, 'env to config', 'loadConfig'),
    ('@kiln/server', S + 'security.ts', 'request guard', 'service', 48,
     'Host/Origin allow-list, X-Kiln-Token on non-GET, content-type guard', ''),
    ('@kiln/server', S + 'app.ts', 'Hono app', 'route', 126, '/api routes, health, records, devices, SSE, page', 'createApp'),
    ('@kiln/server', S + 'db.ts', 'kiln SQLite schema', 'schema', 415,
     'three migrations; helpers migrate/tx/all/get/run copied from PL/db.ts:330-363', 'openDb'),
    ('@kiln/server', S + 'records.ts', 'records store', 'store', 89,
     'validate with @kiln/evidence validateRecord, insert-or-ignore by record id, upsert device',
     'insertRecords; deleteRecords; recordIdsOfJob'),
    ('@kiln/server', S + 'devices.ts', 'device list', 'store', 23, 'devices with record counts', 'listDevices'),
    ('@kiln/server', S + 'events.ts', 'event bus', 'service', 23, 'synchronous on/emit/size; fed to SSE', 'EventBus'),
    ('@kiln/server', S + 'agent.ts', 'model gateway', 'service', 322,
     'Anthropic Messages proxy re-emitted as NDJSON; one llm_calls row per call; no tools, no transcripts',
     'parseSample; estimatePromptTokens; withBreakpoint'),
    ('@kiln/server', S + 'exec/jobs.ts', 'job state machine', 'job', 495,
     'proposed→approved→running→importing→done/failed/cancelled (+ replan approved→proposed); driver follower; import',
     'Jobs'),
    ('@kiln/server', S + 'exec/hosts.ts', 'host registry', 'service', 190,
     'kiln-hosts/1, capabilities cache (10 min), probe, driver self-update via PUT /v1/self', 'loadHosts; Hosts; HostView'),
    ('@kiln/server', S + 'exec/driver-client.ts', 'kiln-driver/1 client', 'service', 117,
     'typed client of the driver protocol', 'DriverClient; DriverError'),
    ('@kiln/server', S + 'exec/assets.ts', 'staged workload revision', 'service', 23,
     'revision of perf_lab_local sources, as probe.py computes it', ''),
    ('@kiln/server', S + 'exec/routes.ts', 'hosts/jobs/archives routes', 'route', 102, 'HTTP surface of the execution core', ''),
    ('@kiln/server', S + 'exec/import.ts', 'archive importer', 'service', 131,
     'result.tar.gz → captures, runs, run_bundles, records', 'importArchive'),
    ('@kiln/server', S + 'exec/nsys-sqlite.ts', 'nsys sqlite reader', 'service', 47,
     'opens an nsys sqlite export with node:sqlite for the browser-safe nsys collector', 'NsysTables'),
    ('@kiln/server', S + 'lab/routes.ts', 'Perf Lab data routes', 'route', 76, '/api/lab/* with Perf Lab response shapes', ''),
    ('@kiln/server', S + 'lab/store.ts', 'lab catalog store', 'store', 133,
     'CatalogEntry from captures, bundles, programs, annotations, gzip JSON pack', 'catalog; pack'),
    ('@kiln/server', S + 'lab/datasets.ts', 'COCO datasets', 'store', 206, 'selection datasets, images, annotations',
     'registerCocoDataset'),
    ('@kiln/server', S + 'lab/evidence.ts', 'evidence archive registration', 'service', 118,
     'gzip check, extract under lab/evidence/<sha>/, register COCO selections; 64 MiB cap',
     'registerArchive; readArchivePath'),
    ('@kiln/server', S + 'lab/tar.ts', 'safe tar.gz', 'service', 98,
     'reader refusing links, absolute paths, .. and bad checksums; writer', 'readTarGz'),
    ('@kiln/server', S + 'lab/files.ts', 'file helpers', 'service', 37, 'sha256 (node:crypto), atomic write',
     'sha256; writeFileAtomic'),
    ('@kiln/server', S + 'lab/importer.ts', 'Perf Lab store importer', 'script', 326,
     'copies a Perf Lab SQLite store into Kiln; re-verifies cyrb53 capture hashes', 'importPerfLabStore'),
    ('@kiln/server', S + 'lab/import.ts', 'lab:import CLI', 'script', 34, 'pnpm lab:import', ''),
    ('@kiln/exec', X + 'model.ts', 'execution model types', 'schema', 331,
     'HostProfile, Facts, ProbeRequest, capture identity, Capabilities, Plan, observations', ''),
    ('@kiln/exec', X + 'registry.ts', 'kind/collector contracts', 'kind', 136,
     'WorkloadKind and Collector plug-in interfaces', 'WorkloadKind; Collector; environmentBlock'),
    ('@kiln/exec', X + 'hosts.ts', 'kiln-hosts/1 parser', 'schema', 99, 'host profiles', 'parseHosts; HOSTS_FORMAT'),
    ('@kiln/exec', X + 'requirements.ts', 'requirement checks', 'service', 85, 'kind requirements vs kiln-facts/1',
     'check; checkAll; probeRequest'),
    ('@kiln/exec', X + 'offers.ts', 'offers', 'service', 61, 'which environment runs which kind; kiln-capabilities/1',
     'capabilities; offers'),
    ('@kiln/exec', X + 'identity.ts', 'capture identity', 'evidence', 25, 'sha256 of canonical kiln-capture/1',
     'captureId; deviceKey'),
    ('@kiln/exec', X + 'lab-hash.ts', 'cyrb53 copy', 'evidence', 43, 'bit-identical copy of Perf Lab capture hash',
     'cyrb53; labCaptureHash; stableStringify'),
    ('@kiln/exec', X + 'plan.ts', 'planner', 'service', 199,
     'verdicts, grouping, ncu timing companion, interleaved repetitions, kiln-plan/1', 'planJob; PLAN_LIMITS'),
    ('@kiln/exec', X + 'runs.ts', 'step → runs', 'service', 86, 'observations to run bundles', 'stepRuns; captureRef'),
    ('@kiln/exec', X + 'collectors/index.ts', 'collector registry', 'collector', 66, '11 collectors, 6 modes',
     'COLLECTORS; MODES'),
    ('@kiln/exec', X + 'collectors/ncu.ts', 'Nsight Compute collector', 'collector', 100, 'ncu CSV',
     'parseNcuCsv; NCU_METRICS'),
    ('@kiln/exec', X + 'collectors/nsys.ts', 'Nsight Systems collector', 'collector', 99, 'nsys tables → entities',
     'nsysEntities; kilnIdentityOf'),
    ('@kiln/exec', X + 'gpu-sampler.ts', 'nvidia-smi sampler parser', 'collector', 40, 'nvidia-smi -lms 100 CSV',
     'parseGpuCsv'),
    ('@kiln/exec', X + 'kinds/kiln-kernels.ts', 'kiln-kernels/1 kind', 'kind', 244,
     'CUDA kernel timing: bundle, results, kiln-measure/1 records', 'kernelContentId; entrySymbol; kernelRecords'),
    ('@kiln/exec', X + 'kinds/perf-lab-sampler.ts', 'perf-lab-sampler/1 kind', 'kind', 367,
     'Perf Lab sampler kind; half of it is a port of PL/importer.ts', 'samplerEntities'),
    ('@kiln/evidence', E + 'values.ts', 'provenance values', 'evidence', 174, 'observed/derived/heuristic/illustrative/missing',
     'observed; derived; seal'),
    ('@kiln/evidence', E + 'stats.ts', 'statistics', 'statistics', 142, 'median, quantile, mulberry32, bootstrap CI',
     'summarize; pairedRatio; separated'),
    ('@kiln/evidence', E + 'protocol.ts', 'repetition protocol', 'statistics', 60, 'interleaved repetition order',
     'repetitionOrder; checkSamples'),
    ('@kiln/evidence', E + 'sha256.ts', 'pure-JS sha256', 'evidence', 65, '', 'sha256Hex; isSha256Hex'),
    ('@kiln/evidence', E + 'canonical.ts', 'canonical JSON', 'evidence', 65, '', 'canonicalJSON'),
    ('@kiln/evidence', E + 'identity.ts', 'content and device identity', 'evidence', 107, '',
     'contentId; deviceId; cudaDevice'),
    ('@kiln/evidence', E + 'record.ts', 'kiln-measure/1 record', 'evidence', 287, 'record validation and identity',
     'validateRecord; recordId; poolKey; isDecisive'),
    ('@kiln/evidence', E + 'verdict.ts', 'hypothesis verdict', 'evidence', 151, 'supported/refuted/open/unqualified',
     'verdict; below; above'),
    ('runner', 'runner/kiln_driver.py', 'GPU host driver', 'driver', 1044,
     'kiln-driver/1 HTTP server, queue, GPU flock, docker steps, sidecars, recovery, self-update; no auth', ''),
]
modules = [{'package': p, 'path': path, 'name': n, 'kind': k, 'loc': loc, 'purpose': pur, 'key_exports': ex, **STEP}
           for p, path, n, k, loc, pur, ex in mod_rows]

db_rows = [
    ('schema_migrations', 'applied migrations', 'db.ts', 'db.ts', ''),
    ('records', 'kiln-measure/1 records', 'records.ts, exec/import.ts', 'app.ts, workbench', 'insert or ignore on id'),
    ('devices', 'devices', 'records.ts, exec/import.ts:121', 'devices.ts', 'spec_json added in migration 3, never written'),
    ('sources', 'unused', '', '', 'never read or written'),
    ('llm_calls', 'model gateway accounting', 'agent.ts', 'agent.ts /agent/usage', 'reasoning_tokens always null'),
    ('jobs', 'jobs (migration 3)', 'exec/jobs.ts', 'exec/jobs.ts, routes', 'status machine, plan and archive sha256'),
    ('job_events', 'per-job event log', 'exec/jobs.ts', 'GET /jobs/:id', 'at most 400 step.output per job'),
    ('job_captures', 'planned captures with verdict', 'exec/jobs.ts', 'GET /jobs/:id', 'execute/cached/blocked'),
    ('captures', 'capture identity and status', 'exec/import.ts, lab/importer.ts', 'lab/store.ts catalog',
     'seeded from lab_artifacts where origin=measured'),
    ('runs', 'runs per capture', 'exec/import.ts', 'lab/store.ts', ''),
    ('run_bundles', 'gzip JSON run bundles', 'exec/import.ts', 'GET /lab/bundles', 'packed by lab/store.ts pack'),
    ('archives', 'evidence and job archives', 'lab/evidence.ts, exec/jobs.ts', 'GET /archives', 'renamed from lab_evidence_archives'),
    ('lab_programs', 'saved lab programs', 'lab/routes.ts', 'lab/routes.ts', ''),
    ('lab_annotations', 'lab annotations', 'lab/routes.ts', 'lab/routes.ts', ''),
    ('lab_datasets', 'COCO datasets', 'lab/datasets.ts', 'lab/routes.ts', ''),
    ('lab_dataset_images', 'dataset images', 'lab/datasets.ts', 'lab/routes.ts', ''),
    ('lab_dataset_annotations', 'dataset annotations', 'lab/datasets.ts', 'lab/routes.ts', ''),
    ('lab_media', 'content-addressed media', 'lab/datasets.ts', 'GET /lab/media/:sha', ''),
    ('lab_artifacts', 'migration 2 artifacts', 'lab/importer.ts', 'migration 3 seed', 'remaining readers unchecked'),
    ('lab_runs', 'migration 2 runs', 'lab/importer.ts', 'migration 3 seed', 'remaining readers unchecked'),
    ('lab_run_bundles', 'migration 2 run bundles', 'lab/importer.ts', 'migration 3 seed', 'remaining readers unchecked'),
]
db_tables = [{'schema_name': 'kiln', 'name': n, 'purpose': p, 'owner_package': '@kiln/server', 'writers': w,
              'readers': r, 'notes': no, **STEP} for n, p, w, r, no in db_rows]

formats = []
for name, kind, flow, where in table_after(notes, '## 6. Wire and file formats'):
    name = strip_ticks(name)
    if name not in ('kiln-hosts/1', 'kiln-driver/1', 'kiln-capabilities/1', 'result.tar.gz'):
        continue  # the other formats are described in full by compiler-runtime, perf-lab or history
    prod, _, cons = strip_ticks(flow).partition('→')
    formats.append({'name': name, 'kind': kind if kind != 'identity' else 'record', 'producers': prod.strip(),
                    'consumers': cons.strip(), 'definition_path': strip_ticks(where).split(';')[0].split(':')[0],
                    'definition_lines': ':'.join(strip_ticks(where).split(';')[0].split(':')[1:]), **STEP})

def loc(path, lines='', note=''):
    return {'path': path, 'lines': lines, 'note': note}

duplications = [
    {'title': 'Perf Lab server ported into apps/server and @kiln/exec',
     'description': 'lab-workbench/server is frozen since its import (92daa13); Kiln is canonical. difflib ratios: tar '
                    '0.73, events 0.73, importer→perf-lab-sampler 0.65, datasets 0.64, evidence 0.64, db 0.39, store '
                    '0.18; app, runner and assistant are separate designs (≤0.11).',
     'locations': [loc('lab-workbench/server/tar.ts'), loc('apps/server/src/lab/tar.ts'),
                   loc('lab-workbench/server/importer.ts'), loc('packages/exec/src/kinds/perf-lab-sampler.ts'),
                   loc('lab-workbench/server/datasets.ts'), loc('apps/server/src/lab/datasets.ts'),
                   loc('lab-workbench/server/evidence.ts'), loc('apps/server/src/lab/evidence.ts'),
                   loc('lab-workbench/server/db.ts', '330-363'), loc('apps/server/src/db.ts', '383-415')],
     'severity': 'medium', 'suggested_consolidation': 'Retire lab-workbench/server once qualification evidence has a home in Kiln.'},
    {'title': 'Perf Lab schema 5: three copies',
     'description': 'The importer test fixture builds a Perf Lab store from a hand copy of schema 5.',
     'locations': [loc('apps/server/test/support/lab.ts', '', 'PL_SCHEMA_5'), loc('lab-workbench/server/db.ts'),
                   loc('apps/server/src/db.ts', '89-246', 'migration 2')],
     'severity': 'low', 'suggested_consolidation': 'Generate the fixture from lab-workbench/server/db.ts, or drop it with the importer.'},
    {'title': 'cyrb53 + stableStringify: three bit-identical copies',
     'description': 'Must stay bit-identical or imported capture hashes stop verifying (importer.ts:222).',
     'locations': [loc('packages/exec/src/lab-hash.ts'), loc('packages/lab/src/lang/util.ts'),
                   loc('lab-workbench/src/lang/util.ts')],
     'severity': 'high', 'suggested_consolidation': 'One export from @kiln/evidence, with a golden-vector test.'},
    {'title': 'SHA-256 helpers beside @kiln/evidence',
     'description': '@kiln/evidence sha256Hex is pure JS; three server sites use node:crypto directly.',
     'locations': [loc('packages/evidence/src/sha256.ts'), loc('apps/server/src/lab/files.ts'),
                   loc('apps/server/src/exec/hosts.ts'), loc('apps/server/src/exec/assets.ts')],
     'severity': 'low', 'suggested_consolidation': 'Keep node:crypto for speed but behind one server helper.'},
    {'title': 'Archive registration: two paths, two limits, two directories',
     'description': 'lab/evidence.ts registerArchive extracts and registers datasets (64 MiB cap); exec/jobs.ts:434 '
                    'lists only (2 GiB read limit, 1 GiB plan limit). GET /archives/:sha searches both directories.',
     'locations': [loc('apps/server/src/lab/evidence.ts', '65'), loc('apps/server/src/exec/jobs.ts', '434'),
                   loc('apps/server/src/exec/routes.ts', '72')],
     'severity': 'medium', 'suggested_consolidation': 'One archive store with one limit and one directory.'},
    {'title': 'HostView wire type re-declared',
     'description': 'No shared type package; the page reads hosts untyped.',
     'locations': [loc('apps/server/src/exec/hosts.ts', '', 'HostView'),
                   loc('packages/lab/src/data/capabilities.ts', '48', 'HostViewLike'),
                   loc('apps/workbench/src/server-sync.js', '94-142', 'untyped')],
     'severity': 'medium', 'suggested_consolidation': 'Export the wire types from @kiln/exec (or a kiln-api types package).'},
]

complexity_hotspots = [
    {'path': S + 'exec/jobs.ts', 'loc': 495, 'metric': 'state machine',
     'reason': 'Seven states over eight methods, two schedulers, resumable long-poll, budget cancel ends as failed, '
               'a replan edge missing from its diagram; restart correctness needs driver_seq, submitted_at and plan files to agree.',
     'suggestion': 'Make the transition table explicit data and test every edge; decide what replan does.'},
    {'path': 'runner/kiln_driver.py', 'loc': 1044, 'metric': 'LOC',
     'reason': 'HTTP server, queue, GPU flock, docker argv, sidecars, output enforcement, recovery and self-update in one file, no auth.',
     'suggestion': 'Split into protocol, worker and container modules; keep stdlib-only.'},
    {'path': S + 'db.ts', 'loc': 415, 'metric': 'schema history',
     'reason': 'Migration 3 rewrites migration 2 tables and seeds captures from lab_artifacts; stale comments; unused sources and devices.spec_json.',
     'suggestion': 'Drop dead columns/tables in migration 4; fix the comments.'},
    {'path': X + 'plan.ts', 'loc': 199, 'metric': 'contract surface',
     'reason': 'Kinds and collectors go wrong at the shape/disturbs/exclusive/companion contract; nvtx and stage-timers registered but unusable.',
     'suggestion': 'Contract tests per collector shape.'},
    {'path': X + 'kinds/perf-lab-sampler.ts', 'loc': 367, 'metric': 'LOC',
     'reason': 'Largest kind; half is a port of Perf Lab importer.', 'suggestion': 'Move the importer port beside the kind contract.'},
    {'path': S + 'lab/importer.ts', 'loc': 326, 'metric': 'two schemas',
     'reason': 'One-shot migration tool that must track two schemas.', 'suggestion': 'Retire after the last Perf Lab store is imported.'},
    {'path': S + 'agent.ts', 'loc': 322, 'metric': 'streaming',
     'reason': 'Streaming re-encoding and token accounting.', 'suggestion': 'Extract as a model-gateway package.'},
]

reusable_components = [
    {'name': '@kiln/evidence', 'path': 'packages/evidence', 'kind': 'library', 'reuse_readiness': 'ready',
     'description': 'Values with provenance, stats, canonical JSON, sha256, identity, kiln-measure/1 records, verdicts.',
     'current_consumers': '@kiln/server; @kiln/exec; @kiln/kiln std (6 files); @kiln/lab (7 files)',
     'external_deps': 'none', 'internal_deps': 'none', 'packaging_notes': 'Publishable as is; 133 tests.'},
    {'name': '@kiln/exec', 'path': 'packages/exec', 'kind': 'library', 'reuse_readiness': 'needs-extraction',
     'description': 'Execution model, planner, kinds and collectors.', 'current_consumers': '@kiln/server; @kiln/lab',
     'external_deps': 'none', 'internal_deps': '@kiln/evidence',
     'packaging_notes': 'Embeds two concrete kinds (one Perf Lab) and a cyrb53 copy; the WorkloadKind/Collector contract could stand alone.'},
    {'name': 'kiln-driver', 'path': 'runner/kiln_driver.py', 'kind': 'tool', 'reuse_readiness': 'ready',
     'description': 'Stdlib-only GPU host driver speaking kiln-driver/1.', 'current_consumers': '@kiln/server DriverClient',
     'external_deps': 'docker, nvidia-smi on the host', 'internal_deps': 'none',
     'packaging_notes': 'Missing auth is a deployment constraint: loopback bind plus ssh -L tunnel.'},
    {'name': 'DriverClient', 'path': S + 'exec/driver-client.ts', 'kind': 'library', 'reuse_readiness': 'needs-extraction',
     'description': 'Typed kiln-driver/1 client.', 'current_consumers': 'exec/hosts.ts; exec/jobs.ts',
     'external_deps': 'none', 'internal_deps': 'types only',
     'packaging_notes': 'Belongs beside the driver protocol, e.g. in @kiln/exec or a kiln-driver-client package.'},
    {'name': 'safe tar.gz reader', 'path': S + 'lab/tar.ts', 'kind': 'library', 'reuse_readiness': 'needs-extraction',
     'description': 'tar.gz reader refusing links, absolute paths, .. and bad checksums.',
     'current_consumers': 'lab/evidence.ts; exec/jobs.ts; exec/import.ts', 'external_deps': 'node:zlib',
     'internal_deps': 'none', 'packaging_notes': 'Lives under lab/ but serves the execution core.'},
    {'name': 'EventBus + SSE', 'path': S + 'events.ts', 'kind': 'pattern', 'reuse_readiness': 'ready',
     'description': '23-line synchronous bus fed to /api/events.', 'current_consumers': 'app.ts; exec; lab',
     'external_deps': 'none', 'internal_deps': 'none', 'packaging_notes': 'Trivial; event names belong in a shared list.'},
    {'name': 'job pipeline', 'path': S + 'exec/jobs.ts', 'kind': 'service', 'reuse_readiness': 'entangled',
     'description': 'Job state machine, driver follower and importer.', 'current_consumers': 'exec/routes.ts',
     'external_deps': 'none', 'internal_deps': 'lab/files.ts; lab/tar.ts; lab/store.ts pack; records; db; bus',
     'packaging_notes': 'Move files/tar/pack out of lab/ first.'},
    {'name': 'model gateway', 'path': S + 'agent.ts', 'kind': 'service', 'reuse_readiness': 'needs-extraction',
     'description': 'Anthropic Messages proxy with token accounting.', 'current_consumers': 'apps/workbench agent',
     'external_deps': 'Anthropic API', 'internal_deps': 'config; db',
     'packaging_notes': 'Could front any client, including Perf Lab’s assistant.'},
]
for r in reusable_components:
    r.update(STEP)
for r in duplications + complexity_hotspots:
    r.update(STEP)


def fact(subject, text, path, lines='', category='gotcha', confidence='observed'):
    return {'subject': subject, 'fact': text, 'evidence_path': path, 'evidence_lines': lines, 'category': category,
            'confidence': confidence, **STEP}


facts = [
    fact('@kiln/server', 'Every non-GET /api route requires X-Kiln-Token; Host and Origin are checked.', S + 'security.ts',
         '', 'security'),
    fact('@kiln/server', 'An agent-proposed job cannot be approved by the agent (403 agent_cannot_approve) and agent '
         'jobs share a 24-hour executor budget (429 agent_budget_exhausted).', S + 'exec/jobs.ts', '158-210', 'security'),
    fact('@kiln/server', 'The replan edge approved→proposed (jobs.ts:345-351) keeps the old plan file; re-approving '
         're-submits the same plan, which replans again. Approval cannot be bypassed (approve only from proposed), '
         'but the edge is a dead end.', S + 'exec/jobs.ts', '345-351', 'gotcha'),
    fact('@kiln/server', 'A budget-forced cancellation ends as failed, not cancelled.', S + 'exec/jobs.ts', '393', 'invariant'),
    fact('@kiln/server', 'Job submission is serial per host; the driver additionally serialises steps under a GPU flock.',
         S + 'exec/jobs.ts', '332', 'architecture'),
    fact('@kiln/server', 'loadHosts refuses to start while the data directory still holds the retired executors.json.',
         S + 'exec/hosts.ts', '15', 'gotcha'),
    fact('@kiln/server', 'DriverClient.jobs() has no caller: the server never reconciles driver-side jobs it lost.',
         S + 'exec/driver-client.ts', '109', 'gotcha'),
    fact('@kiln/server', 'The execution core imports helpers of the Perf Lab port (lab/files.ts, lab/tar.ts, lab/store.ts pack).',
         S + 'exec/jobs.ts', '', 'architecture'),
    fact('@kiln/server', 'apps/server/README.md documents executors, KILN_EXECUTORS, pnpm dev/serve and 501 lab routes that '
         'do not exist; executors were deleted in 49f5156.', 'apps/server/README.md', '', 'history'),
    fact('@kiln/server', 'The sources table is never read or written; devices.spec_json is never written.', S + 'db.ts',
         '368', 'gotcha'),
    fact('@kiln/server', 'CatalogEntry.origin admits job but is always measured.', S + 'lab/store.ts', '85', 'gotcha'),
    fact('@kiln/server', 'lab/import.ts help claims jobs are copied; the importer skips jobs, synthetic artifacts and transcripts.',
         S + 'lab/import.ts', '', 'gotcha'),
    fact('@kiln/server', 'Kiln registers only COCO datasets from evidence archives; detection-qualification/v1 evidence is '
         'not recognised (PL/qualification.ts not ported).', S + 'lab/evidence.ts', '65', 'gotcha', 'inferred'),
    fact('@kiln/server', 'The model gateway stores no transcripts and runs no tools; Perf Lab’s pi-coding-agent assistant '
         '(difflib 0.07) was not ported.', S + 'agent.ts', '251', 'architecture'),
    fact('@kiln/server', 'jobs.test.ts runs the real kiln_driver.py against fake docker, nvidia-smi and nvcc binaries, so '
         'the driver protocol is tested end to end without a GPU.', 'apps/server/test/support/bin', '', 'architecture'),
    fact('@kiln/server', 'Live snapshot 2026-10-21: 3 migrations, hosts mac (127.0.0.1:5381, CPU) and bling '
         '(127.0.0.1:5481, GB10), 20 jobs all done (16 bling, 4 mac), 21 archives, one device with 12 records.',
         'GET /api/health', '', 'metric'),
    fact('@kiln/exec', 'packages/exec is browser-safe: no node: import anywhere in src.', X + 'index.ts', '', 'invariant'),
    fact('@kiln/exec', 'KINDS holds exactly kiln-kernels/1 and perf-lab-sampler/1; kiln-probe/1 and kiln-program/1 exist '
         'only in the design doc.', X + 'kinds/index.ts', '', 'history'),
    fact('@kiln/exec', 'The nvtx and stage-timers collectors are registered but never usable: no registered kind cooperates.',
         X + 'collectors/index.ts', '', 'gotcha'),
    fact('@kiln/exec', 'ncu and nsys collectors are implemented although KILN-003 tasks.md lists P2 as open.',
         X + 'collectors/ncu.ts', '', 'history', 'inferred'),
    fact('@kiln/exec', 'Capture identity is sha256 of canonical {format: kiln-capture/1, kind, content, collectors, '
         'protocol, device, environment}; cyrb53 survives only as lab_hash.', X + 'identity.ts', '6', 'contract'),
    fact('@kiln/exec', 'When ncu is requested the planner adds a timing companion step, because counters disturb timing.',
         X + 'plan.ts', '', 'invariant'),
    fact('@kiln/exec', 'kiln-bundle/1 still carries ncu: false, which kiln_runner.py no longer reads.',
         X + 'kinds/kiln-kernels.ts', '121', 'gotcha'),
    fact('@kiln/exec', "Observation types 'program' and 'device-spec' and WorkloadKind.nvtxRange have no producer.",
         X + 'model.ts', '320-321', 'gotcha'),
    fact('@kiln/evidence', '@kiln/evidence has zero runtime dependencies, no node: imports, and 133 tests in nine files.',
         E + 'index.ts', '', 'metric'),
    fact('runner', 'kiln_driver.py is unauthenticated plain HTTP by decision; it must bind the one address the server '
         'reaches (loopback + ssh tunnel in this deployment).', 'runner/kiln_driver.py', '1-30', 'security'),
    fact('runner', 'Each step runs as docker run --rm --init --network <profile, default none> --user uid:gid with the '
         'bundle mounted read-only; the GPU lock is fcntl.flock on /run/lock/kiln-gpu-<uuid>.lock.',
         'runner/kiln_driver.py', '670-790', 'architecture'),
    fact('runner', 'The archive’s events.ndjson is packed before the final result event, so it lacks it.',
         'runner/kiln_driver.py', '', 'gotcha'),
    fact('runner', 'PUT /v1/self replaces the driver source after a compile check and re-execs; the server pushes it when '
         'the remote sha256 differs and the driver is idle.', 'runner/kiln_driver.py', '1008', 'architecture'),
]

service_calls = [
    {'from_package': '@kiln/workbench', 'to_package': '@kiln/server', 'protocol': 'http',
     'description': 'records, devices, hosts, jobs, archives, agent/sample, lab/*', 'evidence': 'apps/workbench/src/server-client.js'},
    {'from_package': '@kiln/workbench', 'to_package': '@kiln/server', 'protocol': 'sse',
     'description': '/api/events bus events', 'evidence': 'apps/workbench/src/server-client.js subscribe'},
    {'from_package': '@kiln/server', 'to_package': 'runner', 'protocol': 'http',
     'description': 'kiln-driver/1: probe, blobs, jobs, events long-poll, archive, self-update',
     'evidence': 'apps/server/src/exec/driver-client.ts'},
    {'from_package': 'runner', 'to_package': 'runner/docker', 'protocol': 'docker',
     'description': 'docker run --network none per step', 'evidence': 'runner/kiln_driver.py:773-790'},
    {'from_package': '@kiln/server', 'to_package': '@kiln/server', 'protocol': 'sqlite',
     'description': 'node:sqlite kiln schema', 'evidence': 'apps/server/src/db.ts'},
    {'from_package': '@kiln/server', 'to_package': 'Anthropic API', 'protocol': 'llm-api',
     'description': 'Messages API stream proxied as NDJSON', 'evidence': 'apps/server/src/agent.ts'},
]
for r in service_calls:
    r.update(STEP)

diagrams = [
    {'title': 'Kiln job state machine', 'format': 'mermaid', 'related': 'apps/server/src/exec/jobs.ts', **STEP,
     'source': 'stateDiagram-v2\n  [*] --> proposed\n  proposed --> approved: approve\n  approved --> proposed: replan '
               '(image mismatch)\n  approved --> running: driver.started\n  running --> importing: result\n  importing '
               '--> done\n  importing --> failed: importer refused\n  running --> failed: driver failed / budget\n  '
               'proposed --> cancelled: cancel\n  approved --> cancelled: cancel\n  running --> cancelled: cancel\n'},
    {'title': 'Kiln job end to end', 'format': 'mermaid', 'related': 'apps/server; packages/exec; runner', **STEP,
     'source': 'sequenceDiagram\n  participant P as page / lab UI\n  participant S as apps/server Jobs\n  participant X as '
               '@kiln/exec\n  participant D as kiln_driver.py\n  P->>S: POST /api/jobs\n  S->>D: POST /v1/probe (TTL 10 '
               'min)\n  D-->>S: kiln-facts/1\n  S->>X: planJob\n  X-->>S: kiln-plan/1\n  P->>S: POST /api/jobs/:id/approve\n  '
               'S->>D: HEAD/PUT /v1/blobs/:sha\n  S->>D: POST /v1/jobs\n  loop long-poll\n    S->>D: GET events?after=seq\n  '
               'end\n  D-->>S: result {sha256}\n  S->>D: GET archive\n  S->>S: importArchive → captures, runs, records\n  '
               'S->>D: DELETE /v1/jobs/:id\n'},
]

functionalities = [
    ('Kiln: propose, approve and run a GPU job', 'jobs', 'api', 1,
     [(S + 'exec/routes.ts', 'api'), (S + 'exec/jobs.ts', 'entry'), (X + 'plan.ts', 'shared'),
      (S + 'exec/driver-client.ts', 'shared'), ('runner/kiln_driver.py', 'worker')]),
    ('Kiln: host registry, probe and capabilities', 'hosts', 'api', 1,
     [(S + 'exec/hosts.ts', 'entry'), (X + 'requirements.ts', 'shared'), (X + 'offers.ts', 'shared'),
      (X + 'hosts.ts', 'schema')]),
    ('Kiln: import a job archive into captures, runs and records', 'import', 'background', 0,
     [(S + 'exec/import.ts', 'entry'), (X + 'kinds/kiln-kernels.ts', 'shared'),
      (X + 'kinds/perf-lab-sampler.ts', 'shared'), (S + 'lab/tar.ts', 'shared')]),
    ('Kiln: store and list measurement records', 'evidence', 'api', 1,
     [(S + 'records.ts', 'entry'), (E + 'record.ts', 'schema')]),
    ('Kiln: server event stream', 'jobs', 'api', 0, [(S + 'events.ts', 'entry'), (S + 'app.ts', 'api')]),
    ('Kiln: model gateway for the page agent', 'agent', 'api', 1, [(S + 'agent.ts', 'entry')]),
    ('Kiln: Perf Lab data routes (catalog, bundles, programs, datasets)', 'datasets', 'api', 1,
     [(S + 'lab/routes.ts', 'api'), (S + 'lab/store.ts', 'shared'), (S + 'lab/datasets.ts', 'shared')]),
    ('Kiln: register an outside evidence archive', 'evidence', 'api', 1,
     [(S + 'lab/evidence.ts', 'entry'), (S + 'lab/tar.ts', 'shared')]),
    ('Kiln: import a Perf Lab store', 'import', 'cli', 0, [(S + 'lab/import.ts', 'entry'), (S + 'lab/importer.ts', 'shared')]),
    ('Evidence: statistics and hypothesis verdicts', 'statistics', 'library', 0,
     [(E + 'stats.ts', 'entry'), (E + 'verdict.ts', 'shared'), (E + 'protocol.ts', 'shared')]),
]
func_rows, fm_rows = [], []
for name, cat, surface, uf, mods in functionalities:
    func_rows.append({'name': name, 'category': cat, 'surface': surface, 'user_facing': uf,
                      'description': name.split(': ', 1)[1], **STEP})
    fm_rows += [{'functionality': name, 'module_path': p, 'role': r} for p, r in mods]

out = {'packages': packages, 'modules': modules, 'functionalities': func_rows, 'functionality_modules': fm_rows,
       'endpoints': endpoints, 'db_tables': db_tables, 'service_calls': service_calls,
       'reusable_components': reusable_components, 'duplications': duplications,
       'complexity_hotspots': complexity_hotspots, 'facts': facts, 'formats': formats, 'diagrams': diagrams}
# Rows another area owns (the runner belongs to compiler-runtime, the tar reader row to perf-lab): keep theirs.
OWNED = {'modules': {'runner/kiln_driver.py'}, 'complexity_hotspots': {'runner/kiln_driver.py'},
         'reusable_components': {'safe tar.gz reader'}, 'formats': {'kiln-driver/1'}}
for table, keys in OWNED.items():
    out[table] = [r for r in out[table] if (r.get('path') if table in ('modules', 'complexity_hotspots') else r['name']) not in keys]
OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + '\n')
print({k: len(v) for k, v in out.items()})
