// The page's side of the model gateway without a server: gatewaySample against a fake fetch that answers in the
// server's NDJSON events. The tool loop (what the second call carries), onText accumulation, the 12-call cap,
// max_tokens, stops (during a call and during a tool), error events, HTTP refusals, tool failures and empty answers.
//   node test/gateway.mjs
import { gatewaySample, MAX_CALLS } from "../src/agent/gateway.js";

let bad = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` · ${detail}` : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise((r) => setTimeout(r, 0));

// server events
const text = (t) => ({ type: "text", text: t });
const done = (content, stop_reason, call = 1) => ({ type: "done", message: { role: "assistant", content }, stop_reason, usage: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0 }, call });
const useEval = (id, code) => ({ type: "tool_use", id, name: "eval", input: { code } });
const ndjson = (events) => events.map((e) => JSON.stringify(e) + "\n").join("");

/**
 * A fake fetch: `answers` is a list of per-call answers, each an array of events (sent in 5-byte pieces so lines
 * straddle chunks), a function (body, init) → Response, or the last one repeated. Records every request.
 */
function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (typeof a === "function") return a(body, init);
    const bytes = new TextEncoder().encode(ndjson(a));
    let i = 0;
    return new Response(new ReadableStream({ pull: (c) => { if (i >= bytes.length) c.close(); else { c.enqueue(bytes.slice(i, i + 5)); i += 5; } } }), { status: 200, headers: { "content-type": "application/x-ndjson" } });
  };
  f.calls = calls;
  return f;
}
const evalTool = (impl = async (input) => `ok\n${eval(input.code.replace(/^return /, ""))}`) => {
  const t = { name: "eval", description: "Run code", inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] }, seen: [] };
  t.execute = async (input, ctx) => { t.seen.push({ input, ctx }); return impl(input, ctx); };
  return t;
};
const turns = [{ role: "user", content: "[context]\nW-05\n\n[user message]\nwhat is 1 + 1?" }];
const errorOf = async (p) => { try { await p; return null; } catch (e) { return e; } };

{
  // a two-call answer: the model asks for eval, gets its result, then answers
  const fetch = fakeFetch([
    [text("Let me "), text("look."), done([{ type: "thinking", thinking: "", signature: "s1" }, { type: "text", text: "Let me look." }, useEval("toolu_1", "return 1 + 1")], "tool_use", 1)],
    [text("It is "), text("2."), done([{ type: "text", text: "It is 2." }], "end_turn", 2)],
  ]);
  const tool = evalTool(), seenText = [], ac = new AbortController();
  const sample = gatewaySample({ base: "http://127.0.0.1:5280", token: "tok", conversation: () => "c42", fetch });
  const r = await sample(turns, { signal: ac.signal, modelTier: "default", effort: "medium", cache: false, onText: ({ text: t }) => seenText.push(t), tools: [tool] });
  check("a tool round then an answer: two model calls", fetch.calls.length === 2, String(fetch.calls.length));
  check("the answer is the text of both calls", r.text === "Let me look.\n\nIt is 2." && r.truncated === false && r.modelTierApplied === "default", JSON.stringify(r));
  check("onText always gets the accumulated text of the whole answer", same(seenText, ["Let me ", "Let me look.", "Let me look.\n\nIt is ", "Let me look.\n\nIt is 2."]), JSON.stringify(seenText));
  check("the tool ran once with the model's input and the answer's signal", tool.seen.length === 1 && same(tool.seen[0].input, { code: "return 1 + 1" }) && tool.seen[0].ctx.signal === ac.signal);
  const [c1, c2] = fetch.calls;
  check("posts to the server's gateway with the token and JSON", c1.url === "http://127.0.0.1:5280/api/agent/sample" && c1.init.method === "POST" && c1.init.headers["x-kiln-token"] === "tok" && c1.init.headers["content-type"] === "application/json" && c1.init.signal === ac.signal);
  check("the first call carries the turns, the conversation and the tool definitions", same(c1.body, {
    conversation: "c42",
    messages: turns,
    tools: [{ name: "eval", description: "Run code", input_schema: tool.inputSchema }],
  }), JSON.stringify(c1.body));
  check("the second call appends the assistant message as returned and the tool result", same(c2.body.messages, [
    ...turns,
    { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s1" }, { type: "text", text: "Let me look." }, useEval("toolu_1", "return 1 + 1")] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok\n2" }] },
  ]), JSON.stringify(c2.body.messages));
  check("the caller's turns are not modified", turns.length === 1);
}

{
  // the model never stops asking for tools: twelve calls, eleven tool runs, truncated
  const fetch = fakeFetch([[text("again"), done([useEval("t", "return 0")], "tool_use")]]);
  const tool = evalTool();
  const r = await gatewaySample({ token: "t", fetch })(turns, { modelTier: "quick", tools: [tool] });
  check(`at most ${MAX_CALLS} model calls per answer, then truncated`, MAX_CALLS === 12 && fetch.calls.length === 12 && tool.seen.length === 11 && r.truncated === true, `${fetch.calls.length} calls, ${tool.seen.length} runs`);
  check("the twelfth call's tool request is not run", fetch.calls[11].body.messages.length === 1 + 2 * 11);
  check("a call with no conversation files it under null", fetch.calls[0].body.conversation === null && fetch.calls[0].url === "/api/agent/sample");
}

{
  // max_tokens ends the answer, truncated, even mid tool request
  const fetch = fakeFetch([[text("long"), done([{ type: "text", text: "long" }, useEval("t", "return")], "max_tokens")]]);
  const tool = evalTool();
  const r = await gatewaySample({ token: "t", fetch })(turns, { tools: [tool] });
  check("max_tokens: truncated, no tool run, no further call", r.truncated === true && r.text === "long" && tool.seen.length === 0 && fetch.calls.length === 1, JSON.stringify(r));
}

{
  // a stop during a call: the stream is cut and the answer fails as cancelled with the text so far
  const ac = new AbortController();
  const fetch = fakeFetch([(_b, init) => new Response(new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(ndjson([text("partial")])));
      init.signal.addEventListener("abort", () => c.error(new DOMException("The operation was aborted.", "AbortError")));
    },
  }), { status: 200 })]);
  const p = gatewaySample({ token: "t", fetch })(turns, { signal: ac.signal, onText: ({ text: t }) => { if (t === "partial") ac.abort(); }, tools: [evalTool()] });
  const e = await errorOf(p);
  check("a stop during a call fails with code cancelled and the text so far", e?.code === "cancelled" && e.text === "partial", `${e?.code} ${e?.text}`);
}

{
  // a stop during a tool: agent.js's eval throws once stopped; no further call is made
  const ac = new AbortController();
  const fetch = fakeFetch([[text("running"), done([useEval("t1", "slow")], "tool_use")], [text("never"), done([{ type: "text", text: "never" }], "end_turn")]]);
  const tool = evalTool(async (_input, { signal }) => { await tick(); ac.abort(); await tick(); if (signal.aborted) throw new Error("stopped"); return "ok"; });
  const e = await errorOf(gatewaySample({ token: "t", fetch })(turns, { signal: ac.signal, tools: [tool] }));
  check("a stop during a tool fails with code cancelled and no further call", e?.code === "cancelled" && e.text === "running" && fetch.calls.length === 1, `${e?.code} ${fetch.calls.length}`);
  const e2 = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([[text("x")]]) })(turns, { signal: AbortSignal.abort() }));
  check("an already stopped signal fails before calling", e2?.code === "cancelled");
}

{
  // fetch itself rejects because of the stop
  const ac = new AbortController();
  const fetch = async (_u, init) => { ac.abort(); throw init.signal.reason ?? new DOMException("aborted", "AbortError"); };
  const e = await errorOf(gatewaySample({ token: "t", fetch })(turns, { signal: ac.signal }));
  check("a stop that rejects the fetch is cancelled", e?.code === "cancelled" && e.text === "", `${e?.code}`);
  const e2 = await errorOf(gatewaySample({ token: "t", fetch: async () => { throw new TypeError("fetch failed"); } })(turns, {}));
  check("an unreachable server is upstream_error", e2?.code === "upstream_error" && /could not be reached/.test(e2.message), `${e2?.code} ${e2?.message}`);
}

{
  // error events from the server carry the page's error words; the text so far rides along
  for (const code of ["rate_limited", "prompt_too_large", "refused", "upstream_error"]) {
    const fetch = fakeFetch([[text("half an "), { type: "error", code, message: `upstream said ${code}`, call: 1 }]]);
    const e = await errorOf(gatewaySample({ token: "t", fetch })(turns, {}));
    check(`an error event ${code} fails with that code and the text so far`, e?.code === code && e.text === "half an " && e.message === `upstream said ${code}`, `${e?.code} ${e?.text}`);
  }
  // an error in the second call keeps the first call's text
  const fetch = fakeFetch([[text("first"), done([useEval("t", "return 3")], "tool_use")], [{ type: "error", code: "rate_limited", message: "slow down", call: 2 }]]);
  const e = await errorOf(gatewaySample({ token: "t", fetch })(turns, { tools: [evalTool()] }));
  check("an error in a later call keeps the whole answer's text", e?.code === "rate_limited" && e.text === "first", `${e?.code} ${e?.text}`);
}

{
  // HTTP refusals: the server's error word becomes the code
  const json = (status, body) => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  for (const [status, body] of [[503, { error: "no_model", message: "no model is configured" }], [403, { error: "bad_token", message: "x-kiln-token is missing" }], [413, { error: "prompt_too_large", message: "too big" }], [400, { error: "bad_request", message: "messages must be an array" }]]) {
    const e = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([json(status, body)]) })(turns, {}));
    check(`HTTP ${status} ${body.error} fails with code ${body.error}`, e?.code === body.error && e.message === body.message, `${e?.code}`);
  }
  const e = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([() => new Response("<html>", { status: 502 })]) })(turns, {}));
  check("an HTTP failure without a JSON body is upstream_error", e?.code === "upstream_error" && e.message === "HTTP 502");
}

{
  // a tool that fails (without a stop) is reported to the model, which goes on; an unknown tool likewise
  const fetch = fakeFetch([
    [done([useEval("t1", "boom"), { type: "tool_use", id: "t2", name: "nope", input: {} }], "tool_use")],
    [text("Recovered."), done([{ type: "text", text: "Recovered." }], "end_turn")],
  ]);
  const tool = evalTool(async () => { throw new Error("boom"); });
  const r = await gatewaySample({ token: "t", fetch })(turns, { tools: [tool] });
  const results = fetch.calls[1].body.messages.at(-1).content;
  check("a failing tool becomes an is_error result and the answer goes on", r.text === "Recovered." && same(results[0], { type: "tool_result", tool_use_id: "t1", content: "error\nboom", is_error: true }), JSON.stringify(results));
  check("an unknown tool becomes an is_error result", results[1]?.is_error === true && results[1].tool_use_id === "t2" && /no tool named nope/.test(results[1].content));
  check("every tool request of one call is answered in one user message", results.length === 2);
}

{
  // nothing at all, a stream cut before done, and a garbled line
  const e = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([[done([], "end_turn")]]) })(turns, {}));
  check("an answer with no text and no tool run is empty_completion", e?.code === "empty_completion");
  const e2 = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([[text("so far")]]) })(turns, {}));
  check("a stream that ends without done is upstream_error with the text so far", e2?.code === "upstream_error" && e2.text === "so far", `${e2?.code} ${e2?.text}`);
  const e3 = await errorOf(gatewaySample({ token: "t", fetch: fakeFetch([() => new Response("{not json\n", { status: 200 })]) })(turns, {}));
  check("a garbled stream is upstream_error", e3?.code === "upstream_error" && /stream broke/.test(e3.message), `${e3?.code} ${e3?.message}`);
}

console.log(bad ? `${bad} of ${total} FAILED` : `all ${total} gateway checks pass`);
process.exitCode = bad ? 1 : 0;
