// The page's client of the Kiln server (guide §30.3). The server writes its session token into the page it serves
// (<meta name="kiln-token">); a page opened any other way (the artifact, a file) has no token and no server.
// Every request other than GET sends the token and a JSON body, as the server requires (§30.2). Server-sent events
// are notifications only: on `hello` (a new or re-established connection) the page re-reads what it shows.
import { numel } from "@kiln/kiln/core/util.js";
import { sessionToken } from "@kiln/kiln/std/devices.js";
import { kernelInputs, referenceAt, sampleIndices, seedOf } from "@kiln/kiln/std/program.js";
import { CODEGEN_VERSION, INPUT_SEED, contentOf, launchOf, symbolOf } from "@kiln/kiln/std/records.js";

export const EVENT_TYPES = ["hello", "ping", "job.updated", "job.event", "records.added", "device.updated", "host.updated", "catalog.changed", "evidence.registered"];

// the session token of the served page (null when no server served it), read as the CUDA device reads it
export { sessionToken };

/** A refusal or failure from the server: `status` is the HTTP status, `code` the server's error word (bad_token, …). */
export class ServerError extends Error {
  constructor(status, body) {
    super(body?.message || `HTTP ${status}`);
    this.name = "ServerError";
    this.status = status;
    this.code = body?.error ?? null;
    this.body = body;
  }
}

const enc = encodeURIComponent;
const query = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return p.size ? `?${p}` : "";
};

/**
 * The client, or null when there is no token (no server). Options: `base` (default: this origin), `token`,
 * `fetch` and `EventSource` (injected by tests).
 */
export function connectServer({ base = "", token = sessionToken(), fetch: doFetch = globalThis.fetch?.bind(globalThis), EventSource: ES = globalThis.EventSource } = {}) {
  if (!token) return null;
  const call = async (method, path, body, headers = {}) => {
    const init = { method, headers: { accept: "application/json", ...headers } };
    if (method !== "GET") {
      init.headers["content-type"] = "application/json";
      init.headers["x-kiln-token"] = token;
      init.body = JSON.stringify(body ?? {});
    }
    const r = await doFetch(`${base}/api${path}`, init);
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new ServerError(r.status, json);
    return json;
  };
  return {
    base,
    health: () => call("GET", "/health"),
    records: {
      /** filter: { device, identity, since, job } */
      list: (filter = {}) => call("GET", `/records${query(filter)}`).then((x) => x.records),
      /** → { added, duplicates, rejected: [{ id, reason }] } */
      add: (records) => call("POST", "/records", { records }),
      /** Forget a device: its records and its row. → the number of records deleted */
      forget: (device) => call("DELETE", `/records${query({ device })}`).then((x) => x.deleted),
    },
    /** Devices that records name, with the host whose jobs measured each (GET /devices). */
    devices: {
      list: () => call("GET", "/devices").then((x) => x.devices),
    },
    /** Hosts (guide §13): their drivers, queues and capability documents (kiln-capabilities/1). */
    hosts: {
      /** `{ hosts, workloads }`: every host's view, and the revision of the lab workload sources the server stages. */
      list: () => call("GET", "/hosts"),
      capabilities: (id) => call("GET", `/hosts/${enc(id)}/capabilities`),
      /** Probe again now, ignoring the cached document */
      probe: (id) => call("POST", `/hosts/${enc(id)}/probe`),
    },
    jobs: {
      list: () => call("GET", "/jobs").then((x) => x.jobs),
      get: (id) => call("GET", `/jobs/${enc(id)}`),
      plan: (id) => call("GET", `/jobs/${enc(id)}/plan`),
      /**
       * spec: { host, reason, protocol: { reps, warmup, launches, seed }, captures: [{ kind, mode?, input, pairId?, rerun? }], approve?, dryRun? }.
       * The agent bridge passes { proposer: "agent" }; the server keeps such a job proposed until the user approves it.
       * With dryRun the server answers the verdicts and the plan and stores nothing.
       */
      create: (spec, { proposer = "user" } = {}) => call("POST", "/jobs", spec, { "x-kiln-proposer": proposer }),
      approve: (id) => call("POST", `/jobs/${enc(id)}/approve`),
      cancel: (id) => call("POST", `/jobs/${enc(id)}/cancel`),
      reimport: (id) => call("POST", `/jobs/${enc(id)}/reimport`),
    },
    /** Result archives of jobs and evidence archives produced elsewhere */
    archives: { list: () => call("GET", "/archives") },
    /** The lab route group (guide §33): Perf Lab's catalog, bundles, evidence archives and datasets, read-only here. */
    lab: { get: (path) => call("GET", `/lab${path}`) },
    /** Server-sent events; see subscribe(). Returns the function that unsubscribes. */
    subscribe: (handlers, opts = {}) => subscribe(`${base}/api/events`, handlers, { EventSource: ES, ...opts }),
  };
}

/**
 * Subscribe to the server's events: `handlers[type](data)` for each of EVENT_TYPES, `handlers.any(type, data)`,
 * `handlers.open()` and `handlers.error()`. EventSource retries a dropped connection by itself; when it gives up
 * (the stream was refused or the server is gone) this reconnects after a delay that doubles up to `maxDelay`.
 * Returns the function that unsubscribes.
 */
export function subscribe(url, handlers = {}, { EventSource: ES = globalThis.EventSource, minDelay = 1000, maxDelay = 30000 } = {}) {
  if (!ES) throw new Error("subscribe: this environment has no EventSource");
  let es = null, timer = null, closed = false, delay = minDelay;
  const open = () => {
    es = new ES(url);
    es.onopen = () => { delay = minDelay; handlers.open?.(); };
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        let data = null;
        try { data = JSON.parse(e.data); } catch { /* a malformed event carries no data */ }
        handlers[type]?.(data);
        handlers.any?.(type, data);
      });
    }
    es.onerror = () => {
      handlers.error?.();
      if (closed || es.readyState !== 2) return; // 2 = CLOSED: EventSource stopped retrying
      es.close();
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, maxDelay);
    };
  };
  open();
  return () => { closed = true; clearTimeout(timer); es?.close(); };
}

const CUDA = { id: "cuda", kind: "cuda" };
const flatKnobs = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === "number" && Number.isFinite(v) ? v : String(v)]));

/**
 * One kernel of a job (POST /jobs) from a compiled Kiln kernel: its CUDA source and launch, the seeded inputs every
 * device generates, the sample indices, and the reference values there (null where the reference is NaN), which the
 * server compares the runner's outputs with. The content id is Kiln's own (contentOf), which the server recomputes.
 */
export function jobKernel(kern, { activation = null, context = null, count = 384 } = {}) {
  const samples = sampleIndices(numel(kern.shape), count);
  const want = referenceAt(kern, kernelInputs(kern, INPUT_SEED), samples);
  return {
    codegen: CODEGEN_VERSION, name: kern.name, symbol: symbolOf(kern), identity: kern.identity, row: kern.row, knobs: flatKnobs(kern.map),
    contentId: contentOf(kern, CUDA).contentId, source: kern.cuda, launch: launchOf(kern),
    inputs: kern.inShapes.map((shape, j) => ({ shape: [...shape], seed: seedOf(kern, INPUT_SEED, j), ...(kern.inDtypes?.[j] === "u8" ? { dtype: "u8" } : {}) })), output: [...kern.shape],
    samples, expect: Array.from(want, (x) => (Number.isNaN(x) ? null : x)),
    ...(activation ? { activation } : {}),
    ...(context ? { context } : {}),
  };
}

/**
 * A job spec for compiled kernels: one kiln-kernels/1 capture each, measured again even when the server has runs of
 * the same capture (a Measure is new evidence). protocol defaults: 7 repetitions, 3 warm-up launches, 20 timed
 * launches, seed 1. `mode` is timing (default), counters or timeline.
 */
export function jobSpec(kernels, { host, reason, protocol = {}, mode = "timing", pairId, rerun = true, activationOf = null, contextOf = null, approve, dryRun } = {}) {
  return {
    host, reason,
    protocol: { reps: 7, warmup: 3, launches: 20, seed: 1, ...protocol },
    captures: kernels.map((kern) => ({
      kind: "kiln-kernels/1", mode, rerun, ...(pairId ? { pairId } : {}),
      input: jobKernel(kern, { activation: activationOf?.(kern) ?? null, context: contextOf?.(kern) ?? null }),
    })),
    ...(approve !== undefined ? { approve } : {}),
    ...(dryRun ? { dryRun: true } : {}),
  };
}
