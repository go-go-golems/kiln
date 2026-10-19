import { cocoBox, evaluateDetections, overlap, verdicts, type Detection, type GroundTruth } from '../src/lang/detections';
import type { Link } from '../src/lang/rows';
import { missing, val } from '../src/lang/values';
import type { DatasetDetail } from './datasets';
import type { Bundle, RawEntity } from './importer';

/**
 * Importer for format 'detection-qualification/v1': the JSON reports PR 1005's benchmark and qualification
 * scripts write (services/detection/benchmarks/grounding_dino.py at d59d9ad and the DGX reproduction's
 * stage, prompt and prediction reports), laid out as services/detection/GPU.md prescribes. The same importer
 * reads an archived DGX run and a local run of the dino workload; only `read` and the report paths differ.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const QUALIFICATION_FORMAT = 'detection-qualification/v1';

export interface QualificationInput {
  /** reads a file by path relative to the archive (or run directory); undefined if absent */
  read: (path: string) => Buffer | undefined;
  /** 'evidence:<sha256>' or 'local' */
  source: string;
  /** where reports live: 'qualification/reports/' in an archive, 'reports/' in a local run directory */
  reportsDir: string;
  spec: Json;
  hash: string;
  /** experiment/arm/mode */
  ref: string;
  host: string;
  dataset?: DatasetDetail;
  /** first repetition number; a local run imports one repetition at a time */
  rep0?: number;
  /** report files instead of the format's defaults (a local run writes one report per repetition) */
  files?: string[];
}

const DEFAULT_REPORTS: Record<string, string[]> = {
  timing: ['paired.json', 'paired-repeat.json'],
  stages: ['stage-timings.json'],
  predictions: ['example-predictions.json'],
};
const DEFAULT_STATES = ['cold', 'warm', 'warm-repeat'];

/** Report file names for a capture, one per repetition. Memory reports are per state and variant. */
export function reportsFor(spec: Json, mode: string, variant: string): string[] {
  const override = (spec.evidence?.reports as Record<string, string[]> | null | undefined)?.[mode];
  if (override?.length) return override;
  if (mode === 'memory') return ((spec.collection?.states as string[] | undefined) ?? DEFAULT_STATES).map((s) => `${s}-${variant}.json`);
  // the qualification profiles and tests the candidate only; a baseline looks for its own file and finds none
  if (mode === 'kernels') return [`${variant}-profiler-summary.txt`];
  if (mode === 'tests') return [variant === 'candidate' ? 'compatibility.xml' : `${variant}-compatibility.xml`];
  return DEFAULT_REPORTS[mode] ?? [];
}

export const imageIdOf = (file: string) => Number(/(\d+)\.(?:jpe?g|png)$/i.exec(file)?.[1] ?? NaN);

/** "20.057ms" / "956.750us" / "1.2s" → milliseconds */
export function durationMs(s: string): number | null {
  const m = /^([\d.]+)\s*(us|ms|s)$/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'us' ? n / 1000 : m[2] === 's' ? n * 1000 : n;
}

/** torch.profiler key_averages().table(): rows between dashed rules, columns separated by two or more spaces. */
export function parseProfilerTable(text: string) {
  const lines = text.split('\n');
  const rule = (l: string) => /^-{10,}/.test(l.trim());
  const headerAt = lines.findIndex((l, i) => i > 0 && rule(lines[i - 1]) && /\bName\b/.test(l));
  if (headerAt < 0) return { rows: [] as Json[], totals: {} as Record<string, number> };
  const header = lines[headerAt].trim().split(/\s{2,}/);
  const rows: Json[] = [];
  for (let i = headerAt + 2; i < lines.length && !rule(lines[i]); i++) {
    const cells = lines[i].trim().split(/\s{2,}/);
    if (cells.length < header.length) continue;
    rows.push(Object.fromEntries(header.map((h, k) => [h, cells[k]])));
  }
  const totals: Record<string, number> = {};
  for (const l of lines) {
    const m = /^Self (CPU|CUDA) time total:\s*(\S+)/.exec(l.trim());
    if (m) totals[m[1].toLowerCase()] = durationMs(m[2]) ?? NaN;
  }
  return { rows, totals };
}

export function parseJunit(xml: string) {
  const cases: { name: string; suite: string; seconds: number; outcome: 'passed' | 'failed' | 'skipped' }[] = [];
  const re = /<testcase\s+([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    // anchored on whitespace: `name=` must not match inside `classname=`
    const attr = (k: string) => new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(m![1])?.[1] ?? '';
    const body = m[3] ?? '';
    cases.push({ name: attr('name'), suite: attr('classname'), seconds: Number(attr('time')), outcome: /<(failure|error)\b/.test(body) ? 'failed' : /<skipped\b/.test(body) ? 'skipped' : 'passed' });
  }
  return cases;
}

/**
 * A kernel's role from its name. Inductor's Triton kernels are named after the operations they fused, so a
 * `triton_poi_…addmm…` kernel is a matmul's pointwise epilogue, not a matmul: the prefix decides first.
 */
export function kernelRole(name: string): string {
  if (/^fused_sampling$|^triton_\w*grid_sampler/.test(name)) return 'encoder.sampling';
  if (/^triton_poi/.test(name)) return 'pointwise';
  if (/^triton_(per|red)/.test(name)) return 'reduction';
  if (/cutlass|gemm|xmma|matmul/i.test(name)) return 'matmul';
  if (/memcpy|memset/i.test(name)) return 'copy';
  return 'other';
}

/** The variant name a report uses for this arm: an explicit switch, else the arm's name. */
export const variantOf = (spec: Json, arm: string) => String((spec.comparison?.switches as Json | null | undefined)?.variant ?? arm);

export function importQualification(inp: QualificationInput): Bundle[] {
  const [experiment, arm, mode] = inp.ref.split('/');
  const variant = variantOf(inp.spec, arm);
  const reportPath = (f: string) => `${inp.reportsDir}${f}`;
  const readJson = (f: string): Json | undefined => {
    const b = inp.read(f);
    return b ? (JSON.parse(b.toString('utf8')) as Json) : undefined;
  };
  const artifactProv = readJson('artifact-provenance.json');
  const runConfig = readJson('run-configuration.json');
  const datasetImages = new Map((inp.dataset?.images ?? []).map((i) => [i.fileName, i]));
  const files = inp.files ?? reportsFor(inp.spec, mode, variant);
  return files.map((file, k) => importOne(inp, { experiment, arm, mode, variant, rep: (inp.rep0 ?? 0) + k, file: reportPath(file), readJson, artifactProv, runConfig, datasetImages }));
}

interface Ctx {
  experiment: string;
  arm: string;
  mode: string;
  variant: string;
  rep: number;
  file: string;
  readJson: (f: string) => Json | undefined;
  artifactProv?: Json;
  runConfig?: Json;
  datasetImages: Map<string, DatasetDetail['images'][number]>;
}

function importOne(inp: QualificationInput, c: Ctx): Bundle {
  const runRef = `${inp.ref}#${c.rep}`;
  const entities: RawEntity[] = [];
  const links: Link[] = [];
  const ent = (kind: RawEntity['kind'], id: string, fields: Json): RawEntity => {
    const e: RawEntity = { kind, id, ref: `${runRef}!${kind}:${id}`, run: runRef, arm: c.arm, rep: c.rep, ...fields };
    entities.push(e);
    return e;
  };
  const link = (from: RawEntity, to: RawEntity, rel: string) => links.push({ from: from.ref, to: to.ref, rel, evidence: 'direct', method: 'report structure' });
  const otherVariant = c.variant === 'baseline' ? 'candidate' : c.variant === 'candidate' ? 'baseline' : c.variant === 'reuse' ? 'prompt-keyed' : 'reuse';
  const imageField = (file: string) => {
    const im = c.datasetImages.get(file);
    return { image: im?.imageId ?? imageIdOf(file), imageFile: file, imageSha: im?.sha256 ?? null };
  };

  const coverageNotes: string[] = [];
  let report: Json | undefined;
  let activation: Json = {};
  let requests = 0;
  let exactAll: boolean | null = null;
  let header: Json = {};
  const src = { source: `${inp.source}:${c.file}` };

  const isText = c.file.endsWith('.txt') || c.file.endsWith('.xml');
  const raw = inp.read(c.file);
  if (!raw) coverageNotes.push(`${c.file} is not in this ${inp.source.startsWith('evidence:') ? 'archive' : 'run'}${c.variant === 'baseline' && (c.mode === 'kernels' || c.mode === 'tests') ? ': the qualification records it for the candidate only' : ''}`);
  else if (!isText) report = JSON.parse(raw.toString('utf8')) as Json;

  // ── timing: paired benchmark reports, or the changing-prompt diagnostic ───────────────────
  if (report && c.mode === 'timing' && Array.isArray(report.results)) {
    header = report;
    let seq = 0;
    exactAll = true;
    for (const r of report.results as Json[]) {
      const lat = (r.latencies_ms?.[c.variant] ?? []) as number[];
      const mine = (r.output_digests?.[c.variant] ?? []) as string[];
      const theirs = (r.output_digests?.[otherVariant] ?? []) as string[];
      lat.forEach((ms, p) => {
        const exact = theirs.length ? mine[p] === theirs[p] : null;
        if (exact === false) exactAll = false;
        ent('request', `${imageIdOf(r.image)}-p${p}`, {
          ...imageField(r.image), payloadSha: r.payload_sha256, pair: p, seq: seq++, latency: ms, timeInSystem: ms,
          digest: mine[p] ?? null, exact, stable: r.stable_outputs?.[c.variant] ?? null, outcome: 'ok', warm: true,
        });
      });
      if (r.exact_paired_outputs === false) exactAll = false;
    }
    requests = seq;
  } else if (report && c.mode === 'timing' && Array.isArray(report.rows)) {
    header = report;
    const rows = report.rows as Json[];
    const key = (r: Json) => `${r.image}|${r.label}|${r.iteration}`;
    const other = new Map(rows.filter((r) => r.variant !== c.variant).map((r) => [key(r), r.exact_output_digest]));
    exactAll = true;
    rows
      .filter((r) => r.variant === c.variant)
      .forEach((r, seq) => {
        const exact = other.has(key(r)) ? other.get(key(r)) === r.exact_output_digest : null;
        if (exact === false) exactAll = false;
        ent('request', `${imageIdOf(r.image)}-${r.label}-${r.iteration}`, {
          ...imageField(r.image), label: r.label, iteration: r.iteration, seq, latency: r.latency_ms, timeInSystem: r.latency_ms,
          captures: r.capture_count, digest: r.exact_output_digest, exact, utc: r.utc, outcome: 'ok', warm: true,
        });
        requests++;
      });
    const captures = (report.captures_during_timing as Json | undefined)?.[c.variant];
    Object.assign(ent('instant', 'replay-captures', { type: 'replay.captures', t: 0 }), {
      captures: captures === undefined ? missing('not recorded for this variant') : val(Number(captures), { unit: 'count', ...src, scope: 'graph captures during timed calls' }),
    });
    activation.replayKey = c.variant === 'reuse' ? 'layout' : 'layout + prompt text';
    activation.replay = report[c.variant === 'reuse' ? 'reuse_active' : 'prompt_keyed_active'] ? 'active' : 'inactive';
  }

  // ── memory: one fresh process per state and variant ───────────────────────────────────────
  if (report && c.mode === 'memory') {
    header = report;
    const state = c.file.replace(/^.*\//, '').replace(`-${c.variant}.json`, '');
    const pool = (key: string, scope: string) =>
      typeof report![key] === 'number' ? val(report![key], { unit: 'B', scope, ...src, method: 'benchmarks/grounding_dino.py, fresh process' }) : missing(`${key} not recorded`);
    Object.assign(ent('instant', `peaks-${state}`, { type: 'memory.peaks', t: 0, state, variant: c.variant }), {
      rss: pool('process_peak_rss_bytes', 'process RSS (lifetime high-water mark)'),
      cudaAllocated: pool('process_cuda_peak_allocated_bytes', 'CUDA allocator: allocated'),
      cudaReserved: pool('process_cuda_peak_reserved_bytes', 'CUDA allocator: reserved'),
      cgroup: pool('cgroup_peak_memory_bytes', 'container cgroup (processes, compiler children, charged file cache)'),
      loadSeconds: typeof report.load_seconds === 'number' ? val(report.load_seconds, { unit: 's', ...src, scope: 'model load and initial warmup' }) : missing('not recorded'),
    });
    const calls = ((report.results as Json[] | undefined)?.[0]?.latencies_ms?.[c.variant] ?? []) as number[];
    const image = (report.results as Json[] | undefined)?.[0]?.image as string | undefined;
    calls.forEach((ms, i) => ent('request', `call-${String(i).padStart(2, '0')}`, { ...(image ? imageField(image) : {}), seq: i, latency: ms, timeInSystem: ms, outcome: 'ok', warm: true, state }));
    requests = calls.length;
  }

  // ── stages: synchronized stage boundaries in an instrumented copy of the backend path ──────
  if (report && c.mode === 'stages') {
    header = report;
    const rows = ((report.rows ?? []) as Json[]).filter((r) => r.variant === c.variant);
    for (const r of rows) {
      const lat = r.latencies_ms as Record<string, number>;
      const req = ent('request', `${imageIdOf(r.image)}-p${r.pair}`, {
        ...imageField(r.image), pair: r.pair, latency: lat.instrumented_total, timeInSystem: lat.instrumented_total, digest: r.output_digest, detections: r.detection_count, utc: r.utc, outcome: 'ok', warm: true,
      });
      let t = 0;
      for (const [name, ms] of Object.entries(lat)) {
        if (name === 'instrumented_total') continue;
        const s = ent('span', `${req.id}-${name}`, { name, stage: name, lane: 'cpu:main', start: Math.round(t * 1e6), end: Math.round((t + ms) * 1e6), dur: ms, request: req.id });
        link(req, s, 'contains');
        t += ms;
      }
      requests++;
    }
    activation = { replay: report.replay_active ? 'active' : 'inactive', fusion: report.fusion_active ? 'active' : 'inactive' };
    if (c.variant === 'baseline') activation = { replay: 'absent (original source)', fusion: 'absent (original source)' };
  }

  // ── predictions: full detection records, with verdicts against the other arm and the annotations ──
  if (report && c.mode === 'predictions') {
    const perImage = report as Record<string, Json>;
    for (const [file, pv] of Object.entries(perImage)) {
      const mineRaw = (pv[c.variant] ?? []) as Detection[];
      const theirsRaw = (pv[otherVariant] ?? []) as Detection[];
      const v = c.variant === 'baseline' || c.variant === 'reuse' ? verdicts(mineRaw, theirsRaw).baseline : verdicts(theirsRaw, mineRaw).candidate;
      const im = c.datasetImages.get(file);
      const truth: GroundTruth[] = im
        ? (inp.dataset?.annotations ?? []).filter((a) => a.imageId === im.imageId).map((a) => ({ id: a.id, label: a.label, bbox: cocoBox(a.bboxPx, im.width, im.height), iscrowd: a.iscrowd }))
        : [];
      const ordered = v.map((x) => x.detection);
      const evaluation = im ? evaluateDetections(ordered, truth) : undefined;
      const otherRun = `${c.experiment}/${otherVariant}/${c.mode}#${c.rep}`;
      const imageId = im?.imageId ?? imageIdOf(file);
      // one record per image, so an image the detector found nothing in differs from one with no record
      ent('instant', `image-${imageId}`, { type: 'predictions.image', t: 0, ...imageField(file), detections: v.length, truth: truth.filter((t) => !t.iscrowd).length });
      v.forEach((x, k) => {
        const gt = evaluation?.assignment.get(k);
        const gtBox = gt === undefined ? undefined : truth.find((t) => t.id === gt)?.bbox;
        ent('detection', `${imageId}-${k}`, {
          ...imageField(file), label: x.detection.label, confidence: x.detection.confidence, bbox: [...x.detection.bbox],
          rank: mineRaw.indexOf(x.detection), status: x.status,
          counterpart: x.counterpart === undefined ? null : `${otherRun}!detection:${imageId}-${x.counterpart}`,
          boxDelta: x.boxDelta ?? null, confDelta: x.confDelta ?? null,
          gt: gt ?? null, iou: gtBox ? overlap(x.detection.bbox, gtBox) : null, truthKnown: Boolean(im),
        });
      });
      requests++;
    }
    coverageNotes.push(`predictions recorded for ${Object.keys(perImage).length} images${inp.dataset ? ` of ${inp.dataset.imageCount}` : ''}; other images have output digests only`);
  }

  // ── kernels: torch.profiler table of warm candidate calls ────────────────────────────────
  if (raw && c.mode === 'kernels') {
    const { rows, totals } = parseProfilerTable(raw.toString('utf8'));
    rows.forEach((r, k) => {
      const selfCuda = durationMs(String(r['Self CUDA'] ?? ''));
      ent('kernel', `k${String(k).padStart(3, '0')}`, {
        name: r.Name, role: kernelRole(String(r.Name)), device: 'cuda', calls: Number(r['# of Calls']),
        selfCuda, selfCudaPct: Number(String(r['Self CUDA %'] ?? '').replace('%', '')) || 0,
        avgCuda: durationMs(String(r['CUDA time avg'] ?? '')), selfCpu: durationMs(String(r['Self CPU'] ?? '')), dur: selfCuda, selected: false,
      });
    });
    Object.assign(ent('instant', 'profile-totals', { type: 'profile.totals', t: 0 }), {
      selfCuda: totals.cuda === undefined ? missing('no CUDA total in the table') : val(totals.cuda, { unit: 'ms', ...src, scope: 'three warm candidate calls, profiler overhead included' }),
      selfCpu: totals.cpu === undefined ? missing('no CPU total in the table') : val(totals.cpu, { unit: 'ms', ...src, scope: 'three warm candidate calls, profiler overhead included' }),
    });
    requests = rows.length;
  }

  // ── tests: the native upgrade suite's JUnit report ───────────────────────────────────────
  if (raw && c.mode === 'tests') {
    const cases = parseJunit(raw.toString('utf8'));
    for (const t of cases) ent('check', `${t.suite}.${t.name}`, { name: t.name, suite: t.suite, seconds: t.seconds, outcome: t.outcome });
    requests = cases.length;
    const failed = cases.filter((t) => t.outcome !== 'passed').length;
    activation.nativeSuite = failed ? `${failed} not passed` : `${cases.length} passed`;
  }

  // ── run entity: identity, activation, validity, quality, coverage ─────────────────────────
  const replay = header.replay as Json | undefined;
  if (replay && !activation.replay) {
    activation.replay = c.variant === 'baseline' && header.variant === 'paired' ? 'absent (original source)' : replay.active ? 'active' : replay.disabled ? 'disabled' : replay.configured ? 'inactive' : 'not configured';
    if (replay.disabled_reason) activation.replayReason = replay.disabled_reason;
  }
  if (header.variant === 'paired' && !activation.fusion) activation.fusion = c.variant === 'baseline' ? 'absent (original source)' : 'not recorded in this report';
  const expect = inp.spec.expect as { expect?: Record<string, unknown>; arm?: string; onMiss?: string } | null | undefined;
  const reasons: string[] = [];
  if (raw && expect?.expect && (!expect.arm || expect.arm === c.arm) && (c.mode === 'timing' || c.mode === 'memory')) {
    for (const [k, v] of Object.entries(expect.expect)) {
      if (activation[k] !== v && (expect.onMiss ?? 'invalid') === 'invalid') reasons.push(`activation: ${k} ${String(activation[k] ?? 'unknown')} (expected ${String(v)})`);
    }
  }
  const valid = reasons.length === 0;
  for (const e of entities) if (e.kind === 'request') Object.assign(e, { runValid: valid, invalidReason: reasons[0] });

  const settings = (header.settings ?? {}) as Json;
  const wl = (inp.spec.workload ?? {}) as Json;
  const declaredGate = Boolean(inp.spec.quality_gate_sha256);
  const prov = c.artifactProv;
  const toolchain = header.torch
    ? [`torch ${header.torch}`, header.transformers && `transformers ${header.transformers}`, prov?.cuda && `CUDA ${prov.cuda}`, prov?.triton && `triton ${prov.triton}`, prov?.python && `python ${prov.python}`].filter(Boolean).join(' · ')
    : missing('this report records no toolchain');
  const run: RawEntity = {
    kind: 'run', id: runRef, ref: runRef, run: runRef, experiment: c.experiment, arm: c.arm, mode: c.mode, rep: c.rep, specHash: inp.hash, host: inp.host,
    rev: (inp.spec.comparison as Json | undefined)?.arm_revision ?? null, workload: wl.adapter ?? 'dino', source: inp.source, report: c.file,
    manifest: {
      workload: wl.adapter ?? 'dino',
      boundary: 'detect_with_options (decode → detections)',
      fixtures: inp.dataset ? `COCO selection ${inp.dataset.id.slice(0, 12)}… (${inp.dataset.imageCount} images)` : wl.dataset_sha256 ? `dataset ${String(wl.dataset_sha256).slice(0, 12)}…` : missing('no dataset'),
      precision: header.precision ?? wl.precision ?? null,
      inputSize: settings.input_size ? `${settings.input_size} × ${settings.input_size} letterbox` : wl.input_size ? `${wl.input_size} × ${wl.input_size} letterbox` : null,
      labels: Array.isArray(header.labels) ? header.labels.join(', ') : Array.isArray(wl.labels) ? wl.labels.join(', ') : null,
      host: inp.host,
      device: header.gpu ? `${header.gpu} (${header.architecture})` : header.architecture ?? null,
      revision: (inp.spec.comparison as Json | undefined)?.arm_revision ?? null,
      model: prov?.model_snapshot ? `${settings.model_path ?? 'grounding-dino-tiny'} @ ${String(prov.model_snapshot).slice(0, 12)}` : settings.model_path ?? null,
      baselineSource: c.variant === 'baseline' && header.baseline_source_sha256 ? `sha256:${String(header.baseline_source_sha256).slice(0, 12)}…` : null,
      compiled: settings.use_compile ?? null,
      image: c.runConfig?.image ?? null,
      threads: c.runConfig?.threads ? Object.entries(c.runConfig.threads as Json).map(([k, v]) => `${k} ${v}`).join(' · ') : null,
      arm: c.arm,
      mode: c.mode,
      state: c.mode === 'memory' ? c.file.replace(/^.*\//, '').replace(`-${c.variant}.json`, '') : (inp.spec.state ?? null),
      gate: declaredGate ? `sha256:${String(inp.spec.quality_gate_sha256)}` : null,
      toolchain,
      source: inp.source,
      report: c.file,
      specHash: inp.hash,
      synthetic: false,
    },
    validity: { ok: valid, reasons },
    activation,
    quality: {
      gate: declaredGate ? 'declared' : 'none',
      status: declaredGate && exactAll === true && valid ? 'qualified' : 'unqualified',
      reference: header.baseline_source_sha256 ? `frozen original backend sha256:${String(header.baseline_source_sha256).slice(0, 12)}…` : null,
      exact: exactAll,
    },
    coverage: {
      complete: coverageNotes.length === 0,
      trace: { lost: [] },
      source: { missing: [] },
      counters: { unsupported: ['*'] },
      links: { missing: [] },
      notes: coverageNotes,
    },
    clock: c.mode === 'stages' ? 'monotonic ns at synchronized stage boundaries' : 'time.perf_counter around detect_with_options, CUDA synchronized',
    startedAt: null,
    durationS: null,
    requests,
    synthetic: false,
    measured: true,
  };
  return { run, entities, links };
}
