// The one place the lab views reach @kiln/lab (guide §33): the language's runtime, re-exported, and the data a build
// reads, fetched from the Kiln server's /api/lab routes into @kiln/lab's in-memory LabData. Every LabData method is
// synchronous, so the client loads before a build reads: the catalog, archives and datasets when a program opens,
// then the bundles of whichever measured captures that build turned out to need.
import { labEnv, createMemoryLabData, hostReport } from "@kiln/lab";

export {
  build, BuildError, checkParam, dehydrate, isParamRef, isSignalRef, syntheticEnv,
  materialize, makeDollar, resolveValue, isLive, isEnt, isQuery, isValue, getPath, num, provOf,
  fmtBytes, fmtNumber, FIELD_UNITS, normalizeOptions, paramValue, runsMatching,
  queryEnv, Query, rows, walkthrough, evaluateHypothesis,
} from "@kiln/lab";

/** GET /api/lab/bundles takes at most this many hashes. */
const BUNDLE_BATCH = 64;

/** The lab data behind `server` (a client from connectServer): what is loaded, and the calls that load it. */
export function labClient(server) {
  const data = createMemoryLabData({ mediaUrl: (sha) => `${server.base}/api/lab/media/${sha}` });
  const get = server.lab.get;
  return {
    data,
    async catalog() { const c = await get("/catalog"); data.setCatalog(c); return c; },
    /** Archives, and datasets with their images. */
    async loadEvidence() {
      const [archives, list] = await Promise.all([server.archives.list(), get("/datasets")]);
      data.setArchives(archives);
      data.setDatasets(await Promise.all(list.map((d) => get(`/datasets/${encodeURIComponent(d.id)}`))));
    },
    /** The capability reports of the server's hosts (GET /api/hosts): the hosts a program may name besides the
     * synthetic ones. A host not probed yet has no report. Returns the reports by host id. */
    setHosts(hosts, workloads) {
      const reports = Object.fromEntries(hosts.map((h) => [h.id, hostReport(h, workloads?.perf_lab_local ?? null)]).filter(([, r]) => r));
      data.setHostReports(reports, hosts.length ? "no host of the Kiln server has been probed" : "the Kiln server has no hosts");
      return reports;
    },
    bundlesLoaded: (hash) => data.bundlesLoaded(hash),
    /** Fetch the runs of `hashes`; returns how many captures were loaded. */
    async loadBundles(hashes) {
      let n = 0;
      for (let i = 0; i < hashes.length; i += BUNDLE_BATCH) {
        const byHash = await get(`/bundles?hashes=${hashes.slice(i, i + BUNDLE_BATCH).map(encodeURIComponent).join(",")}`);
        data.addBundles(byHash);
        n += Object.keys(byHash).length;
      }
      return n;
    },
  };
}

/** "exp: arm, arm × mode, mode" per experiment, for a job's reason. */
function summarize(refs) {
  const byExp = new Map();
  for (const r of refs) { const [e, a, m] = r.split("/"); const x = byExp.get(e) ?? { arms: new Set(), modes: new Set() }; x.arms.add(a); x.modes.add(m); byExp.set(e, x); }
  return [...byExp].map(([e, x]) => `${e} ${[...x.arms].join(", ")} × ${[...x.modes].join(", ")}`).join("; ");
}

/** The workload kind a lab adapter's captures run as on a Kiln host; an adapter not here cannot run there. */
const KINDS = { sampler: "perf-lab-sampler/1" };

/**
 * The job specs (POST /api/jobs) that run a plan's captures on the hosts they name: one job per host and repetition
 * count, since a job has one protocol. Captures of one experiment share a pairId, so the planner interleaves their
 * processes in the seeded order the experiment declared. → { jobs, skipped: [{ ref, why }] }.
 */
export function labJobs(labId, captures, { reason, dryRun = false } = {}) {
  const groups = new Map(), skipped = [];
  for (const c of captures) {
    const spec = c.lowered, kind = KINDS[spec?.workload?.adapter];
    if (!kind) { skipped.push({ ref: c.ref, why: `the ${spec?.workload?.adapter ?? "unknown"} workload has no Kiln workload kind` }); continue; }
    const key = `${c.host}|${c.reps}`;
    if (!groups.has(key)) groups.set(key, { host: c.host, reps: c.reps, seed: Number(spec.comparison?.paired_order_seed ?? 1) >>> 0, captures: [] });
    groups.get(key).captures.push({ kind, mode: c.mode, pairId: c.experiment, input: { labId, ref: c.ref, spec }, rerun: false });
  }
  const jobs = [...groups.values()].map((g) => ({
    host: g.host,
    reason: reason ?? `${labId} on ${g.host}: ${summarize(g.captures.map((c) => c.input.ref))}`,
    protocol: { reps: g.reps, launches: 1, warmup: 0, seed: g.seed },
    captures: g.captures,
    ...(dryRun ? { dryRun: true } : { approve: true }),
  }));
  return { jobs, skipped };
}

/** A build env over the server's data, with `catalog` in place of the server's own (it also lists the seeds). */
export const serverEnv = (catalog, client) => labEnv({ ...client.data, catalog: () => catalog });
