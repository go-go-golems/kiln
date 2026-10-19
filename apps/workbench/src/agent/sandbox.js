// The page's side of the agent sandbox (guide §31). Each eval gets a fresh <iframe sandbox="allow-scripts"> made
// from srcdoc: its origin is opaque, so it has no storage, cookies or DOM access to this page, and the server
// refuses its requests (Origin: null); its CSP allows inline scripts, eval and blob: workers and no connection of any
// kind. The frame's only script starts a dedicated worker and hands it the port, and eval code runs in that worker,
// which inherits the CSP and has no document: it cannot navigate the frame, so no request leaves through a URL. The
// worker reaches the workbench only through one MessagePort, and this side answers only the calls listed in `api`.
import { WORKER_JS } from "../frame.gen.js";

export const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:";
let doc = null;
// the worker's source is a string literal with every "<" escaped, so no byte of it can end or reopen the <script>
export const frameDoc = () => (doc ??= `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><script>
const source = ${JSON.stringify(WORKER_JS).replace(/</g, "\\u003c")};
addEventListener("message", function once(e) {
  if (e.source !== parent || !e.ports || !e.ports[0] || !e.data || e.data.t !== "kiln-port") return;
  removeEventListener("message", once);
  new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" }))).postMessage(null, [e.ports[0]]);
});
</script>`);

/**
 * Serve one eval over `port`: send it, answer its calls with `onCall(path, args) → { value, ctx? }` until it posts
 * its result. → { ok, out, lang, logs }; rejects with code "cancelled" when `signal` aborts.
 */
export function servePort(port, { code, api, ctx, onCall, signal }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const end = (fn, v) => { if (done) return; done = true; signal?.removeEventListener("abort", abort); port.onmessage = null; port.close(); fn(v); };
    const abort = () => end(reject, Object.assign(new Error("stopped"), { code: "cancelled" }));
    if (signal?.aborted) return abort();
    signal?.addEventListener("abort", abort, { once: true });
    port.onmessage = async (e) => {
      const m = e.data;
      if (done || !m || typeof m !== "object") return;
      if (m.t === "done") return end(resolve, { ok: m.ok === true, out: String(m.out ?? ""), lang: m.lang === "text" ? "text" : "yaml", logs: String(m.logs ?? "") });
      if (m.t !== "call") return;
      let reply;
      try { reply = { t: "ret", id: m.id, ok: true, ...(await onCall(String(m.path), Array.isArray(m.args) ? m.args : [])) }; }
      catch (err) { reply = { t: "ret", id: m.id, ok: false, error: { name: String(err?.name || "Error"), message: String(err?.message ?? err) } }; }
      if (done) return;
      try { port.postMessage(reply); }
      catch (err) { port.postMessage({ t: "ret", id: m.id, ok: false, error: { name: "DataCloneError", message: `the result cannot be sent to the frame: ${err.message}` } }); }
    };
    port.postMessage({ t: "eval", code, api, ctx });
  });
}

/** Run one eval in a fresh sandboxed frame; removing the frame when the eval ends or is stopped ends its worker. */
export function runInFrame(opts) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.hidden = true;
  frame.srcdoc = frameDoc();
  const ch = new MessageChannel();
  const run = servePort(ch.port1, opts);
  // the frame's script has run by its load event, so it is listening for the port
  frame.addEventListener("load", () => frame.contentWindow.postMessage({ t: "kiln-port" }, "*", [ch.port2]), { once: true });
  document.body.appendChild(frame);
  return run.finally(() => frame.remove());
}
