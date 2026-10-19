// The agent's model through the Kiln server (guide §31): when no host bridge provides `sample`, the page posts each
// model call to POST /api/agent/sample, which streams the model's answer back as NDJSON and records the call's tokens
// (llm_calls). The tool loop runs here, on the page, because the tools are the page's: the server only relays.
// gatewaySample() returns a function with the host bridge's contract, so agent.js cannot tell the two apart:
//   sample(turns, { signal, modelTier, effort, onText, tools, cache }) → { text, truncated, modelTierApplied }
// It fails with an Error carrying `code` (an ERRORS key in agent.js, or the server's refusal word) and `text`.

/** Model calls per answer: each call after the first carries the results of the tools the previous one asked for. */
export const MAX_CALLS = 12;
const SEP = "\n\n";

const fail = (code, message, text) => Object.assign(new Error(message || code), { code, text });

/**
 * base: the server's origin ("" for the page's own); token: the session token from the served page; conversation:
 * () → the id the server files the calls under (or null); fetch: injected by tests.
 */
export function gatewaySample({ base = "", token, conversation = () => null, fetch: doFetch = globalThis.fetch?.bind(globalThis) } = {}) {
  return async function sample(turns, { signal, modelTier, onText, tools = [] } = {}) {
    const messages = turns.map((t) => ({ role: t.role, content: t.content }));
    const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const byName = new Map(tools.map((t) => [t.name, t]));
    let text = "", ran = 0;
    const stopped = () => fail("cancelled", "Stopped.", text);

    // one model call: text deltas extend `text` as they arrive; resolves with the server's done event
    const call = async () => {
      let res;
      try {
        res = await doFetch(`${base}/api/agent/sample`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/x-ndjson", ...(token ? { "x-kiln-token": token } : {}) },
          body: JSON.stringify({ conversation: conversation() ?? null, messages, ...(defs.length ? { tools: defs } : {}) }),
          signal,
        });
      } catch (e) {
        throw signal?.aborted ? stopped() : fail("upstream_error", `The Kiln server could not be reached: ${e?.message ?? e}`, text);
      }
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw fail(j?.error ?? "upstream_error", j?.message ?? `HTTP ${res.status}`, text);
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", first = true;
      const event = (ev) => {
        if (ev.type === "text") {
          if (first && text && ev.text) text += SEP;
          first = false;
          text += ev.text;
          onText?.({ text });
        } else if (ev.type === "error") throw ev.code === "cancelled" ? stopped() : fail(ev.code, ev.message, text);
        else if (ev.type === "done") return ev;
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          buf += dec.decode(value, { stream: !done }) + (done ? "\n" : "");
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            const end = line ? event(JSON.parse(line)) : null;
            if (end) return end;
          }
          if (done) throw fail("upstream_error", "The model stream ended without an answer.", text);
        }
      } catch (e) {
        throw signal?.aborted ? stopped() : e?.code ? e : fail("upstream_error", `The model stream broke: ${e?.message ?? e}`, text);
      } finally {
        reader.cancel().catch(() => {});
      }
    };

    // run one tool call; a tool's failure is the model's to read (is_error), only a stop ends the answer
    const runTool = async (use) => {
      const tool = byName.get(use.name);
      if (!tool) return { type: "tool_result", tool_use_id: use.id, content: `error\nThere is no tool named ${use.name}.`, is_error: true };
      try {
        ran++;
        return { type: "tool_result", tool_use_id: use.id, content: String(await tool.execute(use.input ?? {}, { signal })) };
      } catch (e) {
        if (signal?.aborted) throw stopped();
        return { type: "tool_result", tool_use_id: use.id, content: `error\n${e?.message ?? e}`, is_error: true };
      }
    };

    for (let n = 1; ; n++) {
      if (signal?.aborted) throw stopped();
      const { message, stop_reason } = await call();
      if (stop_reason === "max_tokens") return { text, truncated: true, modelTierApplied: modelTier };
      if (stop_reason !== "tool_use") {
        if (!text.trim() && !ran) throw fail("empty_completion", "The model returned nothing.", text);
        return { text, truncated: false, modelTierApplied: modelTier };
      }
      const uses = message.content.filter((b) => b.type === "tool_use");
      if (!uses.length) return { text, truncated: false, modelTierApplied: modelTier };
      if (n >= MAX_CALLS) return { text, truncated: true, modelTierApplied: modelTier };
      const results = [];
      for (const use of uses) results.push(await runTool(use));
      if (signal?.aborted) throw stopped();
      messages.push(message, { role: "user", content: results });
    }
  };
}
