// The one place the lab views reach @kiln/lab (guide §33): the language's runtime, re-exported, and the data a build
// reads, fetched from the Kiln server's /api/lab routes into @kiln/lab's in-memory LabData. Every LabData method is
// synchronous, so the client loads before a build reads: the catalog, archives and datasets when a program opens,
// then the bundles of whichever measured captures that build turned out to need.
import { labEnv, createMemoryLabData } from "@kiln/lab";

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
    /** Archives, datasets with their images, and why host `local` has no report. */
    async loadEvidence() {
      const [archives, list] = await Promise.all([get("/evidence"), get("/datasets")]);
      data.setArchives(archives);
      data.setDatasets(await Promise.all(list.map((d) => get(`/datasets/${encodeURIComponent(d.id)}`))));
      try { data.setLocalReport(await get("/hosts/local/capabilities")); }
      catch (e) { data.setLocalReport(null, e.body?.message ?? e.message); }
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

/** A build env over the server's data, with `catalog` in place of the server's own (it also lists the seeds). */
export const serverEnv = (catalog, client) => labEnv({ ...client.data, catalog: () => catalog });
