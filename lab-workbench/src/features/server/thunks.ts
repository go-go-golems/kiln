import type { AppThunk } from '@/app/store';
import { bundlesLoaded, dropBundles, loadBundles } from '@/data/bundles';
import { setLocalReport, type LocalReport } from '@/data/capabilities';
import { buildLab } from '@/features/build/thunks';
import { catalogLoaded } from '@/features/catalog/catalogSlice';
import { jobUpserted, type Job } from '@/features/jobs/jobsSlice';
import { log } from '@/features/ui/uiSlice';
import { loadEvidence, setServerFeatures } from '@/data/datasets';
import { server, ServerError } from '@/services/server';
import { selectSource, setSource } from '@/features/program/programSlice';
import { modelsLoaded, serverOffline, serverOnline, type ModelInfo, type ServerHealth } from './serverSlice';

/** A job as the server reports it (store.ts JobView). */
export interface ServerJob {
  id: string;
  lab_id: string;
  status: Job['status'];
  proposed_by: 'user' | 'assistant';
  reason: string;
  hosts: string;
  budget_gpu_min: number;
  progress: number;
  created_at: string;
  error: string | null;
  captures: { hash: string; ref: string; experiment: string; arm: string; mode: string; host: string; reps: number; status: string; error: string | null }[];
  events: { id: number; at: string; kind: string; detail: string | null }[];
}

export function fromServerJob(j: ServerJob, prev?: Job): Job {
  return {
    id: j.id,
    labId: j.lab_id,
    experiment: prev?.experiment ?? (new Set(j.captures.map((c) => c.experiment)).size === 1 ? j.captures[0].experiment : null),
    captures:
      prev?.captures ??
      j.captures.map((c) => ({
        id: `experiment:${c.ref}`,
        experiment: c.experiment,
        arm: c.arm,
        mode: c.mode,
        ref: c.ref,
        reps: c.reps,
        hash: c.hash,
        status: 'execute' as const,
        stage: 1,
        estimateGpuMin: 0,
        host: c.host,
        lowered: {},
      })),
    host: j.hosts,
    budget: j.budget_gpu_min,
    reason: j.reason,
    proposedBy: j.proposed_by === 'assistant' ? 'agent' : 'user',
    status: j.status,
    progress: j.progress,
    events: j.events.map((e) => ({ at: Date.parse(e.at), kind: e.kind, detail: e.detail ?? undefined })),
    createdAt: Date.parse(j.created_at),
    error: j.error,
  };
}

export const loadCatalog = (): AppThunk<Promise<void>> => async (dispatch) => {
  const cat = await server.get<Record<string, { origin: 'synthetic' | 'measured'; source?: string | null; importedAt: string | null }>>('/catalog');
  dispatch(catalogLoaded(cat));
};

/** Archives and datasets the server holds; builds resolve evidence() and dino({ dataset }) against them. */
export const refreshEvidence =
  (reason: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    try {
      if (!(await loadEvidence())) return;
    } catch (e) {
      dispatch(log('warn', `could not load evidence archives and datasets: ${(e as Error).message}`));
      return;
    }
    for (const labId of Object.keys(getState().build.byLab)) dispatch(buildLab(labId, reason));
  };

/** Loads the measured runs a lab's current build refers to but the browser has not fetched; rebuilds if any arrived. */
export const loadMeasured =
  (labId: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const s = getState();
    const ir = s.build.byLab[labId]?.ir;
    if (!ir || s.server.status !== 'online') return;
    const need = ir.plan.captures.map((c) => c.hash).filter((h) => s.catalog.available[h]?.origin === 'measured' && !bundlesLoaded(h));
    if (!need.length) return;
    try {
      const n = await loadBundles(need);
      if (n) dispatch(buildLab(labId, `${n} measured capture${n > 1 ? 's' : ''} loaded`));
    } catch (e) {
      dispatch(log('error', `could not load measured runs: ${(e as Error).message}`));
    }
  };

/** After an import: refresh the catalog, fetch the new runs, rebuild every lab that has been built. */
export const refreshAfterImport =
  (hashes: string[] = []): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    for (const h of hashes) dropBundles(h);
    await dispatch(loadCatalog());
    for (const labId of Object.keys(getState().build.byLab)) {
      dispatch(buildLab(labId, 'rebuild after import'));
      await dispatch(loadMeasured(labId));
    }
  };

/**
 * Applies a server job. A job reported done is held until the lab has rebuilt with its runs, so that code
 * awaiting `job.done` (the assistant's) sees the imported evidence.
 */
export const serverJobUpdated =
  (j: ServerJob): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const prev = getState().jobs.list.find((x) => x.id === j.id);
    const next = fromServerJob(j, prev);
    if (j.status === 'done' && prev?.status !== 'done') {
      dispatch(jobUpserted({ ...next, status: 'importing' }));
      await dispatch(refreshAfterImport(j.captures.map((c) => c.hash)));
      dispatch(log('ok', `${j.id} done: ${j.captures.length} captures imported`));
    }
    dispatch(jobUpserted(next));
  };

let events: EventSource | null = null;

function subscribe(dispatch: Parameters<AppThunk>[0]) {
  events?.close();
  events = new EventSource('/api/events');
  events.addEventListener('job.updated', (e) => {
    const j = JSON.parse((e as MessageEvent<string>).data) as ServerJob | null;
    if (j) void dispatch(serverJobUpdated(j));
  });
  events.addEventListener('artifact.imported', (e) => {
    const a = JSON.parse((e as MessageEvent<string>).data) as { hash: string; ref: string; origin: string };
    dropBundles(a.hash);
    dispatch(log('info', `imported ${a.ref} (${a.origin})`));
  });
  events.addEventListener('evidence.registered', (e) => {
    const a = JSON.parse((e as MessageEvent<string>).data) as { sha256: string; name: string; datasets: string[] };
    dispatch(log('info', `evidence archive ${a.name} registered (${a.sha256.slice(0, 12)}…)${a.datasets.length ? `, ${a.datasets.length} dataset` : ''}`));
    void dispatch(refreshEvidence('evidence archive registered'));
  });
  events.addEventListener('dataset.materialized', (e) => {
    const r = JSON.parse((e as MessageEvent<string>).data) as { datasetId: string; present: number; total: number; fetched: number; failed: unknown[] };
    dispatch(log(r.failed.length ? 'warn' : 'ok', `dataset ${r.datasetId.slice(0, 12)}…: ${r.fetched} images fetched and verified, ${r.present}/${r.total} present${r.failed.length ? `, ${r.failed.length} failed` : ''}`));
    void dispatch(refreshEvidence('dataset images materialized'));
  });
  events.addEventListener('error', () => {
    // EventSource reconnects by itself; the health check decides whether the server is gone
    void dispatch(checkHealth());
  });
}

/** The models pi has credentials for; the assistant's model menu. Retried while pi is still starting. */
export const loadModels = (): AppThunk<Promise<void>> => async (dispatch) => {
  for (let i = 0; i < 10; i++) {
    try {
      const r = await server.get<{ available: boolean; default: string; models: ModelInfo[]; reason?: string }>('/assistant/models');
      dispatch(modelsLoaded({ models: r.models, defaultModel: r.default }));
      if (r.models.length || !/starting/.test(r.reason ?? '')) return;
    } catch {
      return;
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
};

const programsLoaded = new Set<string>();

/** Once per lab and session: an edit stored on the server replaces the preset source. */
export const loadProgram =
  (labId: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    if (programsLoaded.has(labId)) return;
    programsLoaded.add(labId);
    try {
      const p = await server.get<{ source: string; updatedAt: string }>(`/programs/${encodeURIComponent(labId)}`);
      if (p.source !== selectSource(getState(), labId)) {
        dispatch(setSource({ labId, source: p.source }));
        dispatch(buildLab(labId, `edited program restored (saved ${p.updatedAt})`));
      }
    } catch (e) {
      if (!(e instanceof ServerError && e.status === 404)) dispatch(log('warn', `could not load the saved program: ${(e as Error).message}`));
    }
  };

export const checkHealth = (): AppThunk<Promise<boolean>> => async (dispatch) => {
  try {
    const h = await server.get<ServerHealth>('/health', 4000);
    setServerFeatures(h.features ?? []);
    dispatch(serverOnline(h));
    return true;
  } catch (e) {
    dispatch(serverOffline((e as Error).message));
    setLocalReport(null, 'the lab server is not reachable (pnpm lab-server)');
    return false;
  }
};

let connecting: Promise<void> | null = null;

/** Startup: health, the local probe, the catalog, jobs, live updates; then rebuild what was built offline. Runs once. */
export const connectServer = (): AppThunk<Promise<void>> => (dispatch) => (connecting ??= dispatch(connectOnce()));

const connectOnce = (): AppThunk<Promise<void>> => async (dispatch, getState) => {
  let health: ServerHealth;
  try {
    health = await server.get<ServerHealth>('/health', 4000);
  } catch (e) {
    dispatch(serverOffline((e as Error).message));
    setLocalReport(null, 'the lab server is not reachable (pnpm lab-server)');
    dispatch(log('warn', 'lab server offline: synthetic data only; start it with pnpm lab-server'));
    return;
  }
  setServerFeatures(health.features ?? []);
  // the host report and catalog first: a build triggered by "online" must already see them
  try {
    setLocalReport(await server.get<LocalReport>('/hosts/local/capabilities', 10_000));
  } catch (e) {
    setLocalReport(null, (e as Error).message);
  }
  await dispatch(loadCatalog());
  try {
    await loadEvidence();
  } catch (e) {
    dispatch(log('warn', `could not load evidence archives and datasets: ${(e as Error).message}`));
  }
  for (const j of await server.get<ServerJob[]>('/jobs')) dispatch(jobUpserted(fromServerJob(j, getState().jobs.list.find((x) => x.id === j.id))));
  await dispatch(loadModels());
  dispatch(serverOnline(health));
  subscribe(dispatch);
  dispatch(log('ok', 'lab server online: measured runs, jobs and transcripts persist in SQLite'));
  for (const labId of Object.keys(getState().build.byLab)) {
    dispatch(buildLab(labId, 'rebuild with server catalog'));
    await dispatch(loadMeasured(labId));
  }
};
