---
Title: Phase 7 diary — the model gateway and token accounting (POST /api/agent/sample, GET /api/agent/usage, gateway.js)
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - backend
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/server/src/agent.ts
      Note: The model gateway — request validation, the streamed Anthropic call, NDJSON relay, one llm_calls row per call, usage totals (guide §30.3, §31)
    - Path: repo://apps/server/src/config.ts
      Note: modelUrl (KILN_MODEL_URL) and apiKey (ANTHROPIC_API_KEY) next to model (KILN_MODEL)
    - Path: repo://apps/server/src/app.ts
      Note: mounts the gateway under /api/agent behind the existing security middleware
    - Path: repo://apps/server/test/agent.test.ts
      Note: a fake Anthropic upstream speaking SSE; text, split tool input, 429, abort, no model, usage, key secrecy, Origin null, no token
    - Path: repo://apps/workbench/src/agent/gateway.js
      Note: gatewaySample — the page-side sample() with the host bridge's contract; drives the tool loop over the NDJSON stream
    - Path: repo://apps/workbench/test/gateway.mjs
      Note: plain Node test of gatewaySample against a fake fetch
ExternalSources: []
Summary: 'Chronological diary of the Phase 7 model gateway (guide §30.3, §31, §35): the server relays one streamed Anthropic Messages call per request as NDJSON and writes an llm_calls row for it; the page-side gatewaySample drives the tool loop with the same contract as the host bridge''s sample.'
LastUpdated: 2026-10-19T22:30:00-04:00
WhatFor: "Reviewing how the model gateway was built, its wire protocol, and where it deviates from the guide"
WhenToUse: "Before wiring wb.sample to the gateway, changing the gateway's request or events, or pointing it at a real model"
---

# Phase 7 diary — the model gateway and token accounting

Written by the Phase 7 gateway worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's
verbatim requests. Paths: `T/` is this ticket, `S/` is `apps/server/`, `W/` is `apps/workbench/`. Two other workers
share the working tree: the coordinator builds the agent sandbox frame (`W/src/agent/agent.js`) and a second worker
wires the page to the server (`W/src/ui/wb.js`, `W/src/server-client.js`, `W/src/server-sync.js`, a Jobs view). This
worker edits only `S/src/agent.ts`, `S/src/config.ts`, the mount in `S/src/app.ts`, `S/test/agent.test.ts`,
`W/src/agent/gateway.js`, `W/test/gateway.mjs`, the `test` script of `W/package.json`, and this diary. It does not
commit.

## Step 1: Read the specification and the code the gateway sits between

The gateway has two neighbours that already exist: the server's `/api` middleware and schema on one side, and the
agent's call to `wb.sample` on the other. I read both before writing anything, so that the gateway changes neither:
the security checks must apply unchanged, the `llm_calls` table from migration 1 must be enough, and the page-side
function must be a drop-in for the host bridge's `sample` that `agent.js` already calls.

The guide gives the gateway two table rows (§30.3) and one bullet (§31): "When the page is not hosted with a
`window.claude` bridge, `wb.sample` posts to `/api/agent/sample`, which calls the configured model and writes an
`llm_calls` row per call with reported and estimated tokens." Phase 7 is done when "token rows appear per call".
Everything else — the request body, the stream format, the error words, who runs the tool loop — is decided here.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Coordinator assignment (summary, not verbatim):** implement the server model gateway with token accounting and its
page-side client. Server: `POST /api/agent/sample` (validated body `{conversation, messages, tools?, system?,
max_tokens?}`; 503 `no_model` / `no_api_key`; a streamed Anthropic Messages call to `modelUrl` with the key from
`ANTHROPIC_API_KEY`; NDJSON `text` / `done` / `error` events with the error words `agent.js` already knows; exactly
one `llm_calls` row per upstream call, including cancelled ones) and `GET /api/agent/usage` (totals by model, the 50
most recent conversations). Tests with a fake SSE upstream, never a real API call, and tests that `Origin: null` and a
missing token are refused. Page: `gatewaySample({base, token, conversation, fetch})` returning `sample(turns, {signal,
modelTier, effort, onText, tools, cache})` that drives the tool loop (at most 12 model calls), with a plain Node test.
The key must never be logged, returned or stored.

**Assistant interpretation:** build a thin, stateless relay on the server (one request = one upstream call = one row)
and put the loop on the page, where the tools are.

**Inferred user intent:** the agent works outside the Claude host, every model call is accounted for in SQLite, and
the sandboxed agent frame still cannot reach anything on the server.

**Commit (code):** none (the coordinator commits).

### What I did

- Read guide §30.1–§30.3, §30.7, §31 and "Phase 7" under §35 of
  `T/design-doc/01-kiln-x-perf-lab-intern-guide-to-the-unified-gpu-kernel-workbench.md`.
- Read `S/src/app.ts` (route layout, `err()`, the 32 MiB `bodyLimit` on `/api/*`, the `cache-control: no-store`
  sub-app middleware), `S/src/security.ts` (Host, Origin, token, content-type, in that order, on every request),
  `S/src/config.ts` (`model: env.KILN_MODEL || null` already exists), `S/src/db.ts` (`llm_calls` in migration 1,
  `run/get/all/now` helpers), `S/test/support/server.ts` (`makeServer` over `:memory:`, `loadConfig(…, {})` so tests
  never see the real environment) and `S/test/security.test.ts`.
- Read `W/src/agent/agent.js` read-only: `sendCore` calls `sample(turns, {signal, modelTier, effort?, cache: false,
  onText, tools: [evalTool(msg)]})` and uses `r.text`, `r.truncated`, `r.modelTierApplied`; on failure it maps
  `e.code` through `ERRORS` and shows `e.text`. `evalTool` is `{name: 'eval', description, inputSchema, execute(input,
  {signal})}`; `runEval` throws `Error('stopped')` when the signal is aborted and otherwise always resolves with a
  string.
- Read `W/src/server-client.js` read-only (base URL, `x-kiln-token`, JSON content type) and
  `scripts/run-node-tests.mjs` with `W/package.json` (tests are plain scripts printing `ok`/`FAIL` lines, run one by
  one, with a skip list).
- Baseline: `pnpm --filter @kiln/server test` → `Test Files 7 passed (7)`, `Tests 49 passed (49)`;
  `pnpm --filter @kiln/server typecheck` → clean.
- Loaded the `claude-api` skill for the raw HTTP streaming wire format (event names, `input_json_delta`,
  `message_delta` usage, `stop_reason: refusal`, the 413/429/529 error types).

### Why

- The coordinator and a second worker are editing `agent.js`, `wb.js` and `server-client.js` concurrently; reading
  them (and not editing them) is the only way to match their contract without colliding.

### What worked

- Everything the gateway needs already exists: the table, the `model` field, and a security middleware that runs on
  every route including new ones under `/api`.

### What didn't work

- No failures in this step.

### What I learned

- `security()` is mounted with `app.use('*', …)`, before the `/api` sub-app, so a route added to the sub-app inherits
  all four checks without any change. The Origin check applies to GET too, so even `GET /api/agent/usage` from the
  sandboxed frame (`Origin: null`) is refused.
- `loadConfig(overrides, env)` takes the environment as a parameter, and the test harness passes `{}`; a real
  `ANTHROPIC_API_KEY` in the developer's shell therefore cannot leak into a test.
- `agent.js` puts the instructions in the first user turn, not in a system prompt, and sends only strings; the
  gateway therefore never has a system prompt from the agent today, but the server accepts one.
- `tsconfig.base.json` has `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `erasableSyntaxOnly`.

### What was tricky to build

- Nothing built yet.

### What warrants a second pair of eyes

- `GET /api/health` lists `features: ['records', 'devices', 'jobs', 'events']`, and two existing tests assert that
  exact list. Adding `'agent'` would break tests outside this worker's files, so it is not added (see Step 2).

### What should be done in the future

- N/A for this step.

### Code review instructions

- N/A for this step (reading only).

### Technical details

- Security order (`S/src/security.ts`): `bad_host` 403 → `bad_origin` 403 (including `Origin: null`) → `bad_token`
  403 on non-GET → `unsupported_media_type` 415 on non-GET.
- `ERRORS` keys in `agent.js`: `cancelled`, `not_granted`, `rate_limited`, `prompt_too_large`, `refused`,
  `tools_unavailable`, `session_expired`, `sampling_disabled`, `empty_completion`.

## Step 2: Write the server gateway and test it against a fake Anthropic upstream

I wrote `S/src/agent.ts` as a stateless relay: one `POST /api/agent/sample` is one streamed upstream Messages call
and one `llm_calls` row, inserted when the call ends however it ends (answer, refusal, upstream error, or the page
going away). The page gets NDJSON: a `text` event per text delta, then exactly one `done` or `error` event that
carries the row id. `GET /api/agent/usage` sums the rows by model and by conversation. Two config fields were added
(`modelUrl` from `KILN_MODEL_URL`, `apiKey` from `ANTHROPIC_API_KEY`) and the router is mounted under `/api/agent`
in `app.ts` with two lines.

The tests run a real `node:http` server that writes the Messages API's event stream in 7-byte writes a tick apart (so
frames straddle chunks), and cover text, a tool call split over four `input_json_delta` pieces plus a thinking block
with a signature, nine failure shapes, the three ways the page can go away (request aborted, response cancelled, and
the browser's socket closing on the real `@hono/node-server`), the 503s, nineteen malformed bodies, the security
checks, the usage sums and the key's secrecy. They passed on the first run, so I mutated the code to make sure they
can fail (below).

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** implement the server half exactly as the coordinator specified the wire format, with
the error words the page already maps.

**Inferred user intent:** every model call is accounted for, the gateway cannot be reached from the sandbox, and the
key cannot leak.

**Commit (code):** none (the coordinator commits).

### What I did

- `S/src/config.ts`: `modelUrl: env.KILN_MODEL_URL || 'https://api.anthropic.com/v1/messages'`,
  `apiKey: env.ANTHROPIC_API_KEY || null`.
- `S/src/agent.ts`:
  - `parseSample(body)` — returns the checked request or the reason for a 400: `conversation` null or 1–200
    characters; 1–400 `messages`, each `{role: user|assistant, content: string | 1–400 blocks with a string type}`,
    the first from the user; at most 32 `tools` `{name ~ /^[a-zA-Z0-9_-]{1,64}$/, description, input_schema}`;
    `system` a string; `max_tokens` an integer 1–32000 (default 16000). Only these fields go upstream.
  - `estimatePromptTokens(req)` — `ceil(chars / 4)` over system text, text blocks, `JSON.stringify(tool_use.input)`,
    `tool_result` text (string or text blocks) and `JSON.stringify(tools)`.
  - `withBreakpoint(messages)` — one `cache_control: {type: 'ephemeral'}` on the last block of the last user message
    (a string becomes one text block), unless the page already placed one.
  - `errorCode(status, type, message)` — 429/529/`rate_limit_error`/`overloaded_error` → `rate_limited`;
    413/`request_too_large`, or a 400 whose message says the prompt is too long → `prompt_too_large`; else
    `upstream_error`. `refused` comes from `stop_reason: 'refusal'`, `cancelled` from the abort signal.
  - `sse(body)` — a reader-based event-stream parser (frames split on a blank line, `\n` or `\r\n`, `data:` lines
    joined); `callModel()` — the fetch and the event fold (`message_start` usage, block starts, `text_delta`,
    `input_json_delta`, `thinking_delta`, `signature_delta`, block stop parses the tool input, `message_delta` stop
    reason and usage, `message_stop`, `error`); it never throws.
  - `agentRoutes(config, db)` — the two routes. `/sample` has its own 4 MiB `bodyLimit` (413 `prompt_too_large`),
    answers 503 `no_model` / `no_api_key` before reading the body, and returns a `ReadableStream` whose `cancel` and
    the request's `signal` both abort the upstream fetch.
- `S/src/app.ts`: `import { agentRoutes } from './agent.ts'` and `api.route('/agent', agentRoutes(config, db))` before
  the `/api` not-found handler (re-read immediately before editing; nobody else had touched it).
- `S/test/agent.test.ts`: 11 tests (the fake upstream, `gateway()` = `makeServer` with `model`, `apiKey`,
  `modelUrl` set, no executors).
- `pnpm --filter @kiln/server typecheck` (two errors, below), then
  `pnpm exec vitest run test/agent.test.ts` → `Tests 11 passed (11)`.
- Mutation checks, each restored from a scratch copy afterwards (`diff` clean): removing the request-signal listener
  fails only "aborts … when the request is aborted"; removing the stream's `cancel: abort` fails only "… when the
  response is cancelled"; replacing the key scrub with the identity fails only the key test.
- Full suite: `pnpm --filter @kiln/server test` → `Test Files 8 passed (8)`, `Tests 60 passed (60)` (49 before);
  `pnpm --filter @kiln/server typecheck` → clean.

### Why

- **The page runs the tool loop, not the server.** The tools are the page's (`eval` runs in the page or its sandbox
  frame); a server-side loop would need a second channel back to the page for every tool call. One request = one
  upstream call also makes "exactly one row per upstream call" true by construction.
- **Configuration before the body.** `no_model` / `no_api_key` answer "the gateway is off" whatever the page sent;
  the page can treat them as availability, not as a malformed request.
- **Errors after the stream has started are events, not statuses.** Once validation passes the response is always
  200 NDJSON, so the page has one place to read failures from; only refusals of the request itself (400, 403, 413,
  415, 503) are HTTP statuses with the usual `{error, message}` body.
- **413 `prompt_too_large` for an oversized body**, rather than the 400 the assignment suggested: the 32 MiB `/api`
  limit already answers 413, and `prompt_too_large` is the word the page shows as "This conversation is too long for
  one request" — which is what a 4 MiB agent request is.
- **One cache breakpoint.** Within an answer every tool round resends the whole conversation plus one more tool
  result; with the breakpoint on the last user block, round n+1 reads the prefix round n wrote. Short prefixes silently
  do not cache, so it is harmless when it does not help. The page's `cache: false` option is not forwarded (see
  "second pair of eyes").
- **Thinking blocks are assembled and returned.** Current models think by default and return `thinking` blocks
  (empty text, a signature); the tool loop must send them back unchanged in the assistant message, so the server
  keeps them rather than dropping everything but text and tool use.
- **No `eager_input_streaming`.** Tool input is not shown to the user while it streams, and without the flag the API
  validates the input JSON; a tool input that still fails to parse at `stop_reason: tool_use` is an
  `upstream_error`.

### What worked

- The existing `security()` middleware covered the new routes without change: `Origin: null` → 403 `bad_origin` on
  both routes (GET included), no token → 403 `bad_token`, `text/plain` → 415.
- `@hono/node-server` 2.1.5 aborts the request's signal when the socket closes before the response finishes
  (`req[abortRequest]("Client connection prematurely closed.")` in `dist/index.mjs`), and the real-HTTP test passes
  with either abort path removed: production has two independent ways to stop the upstream call.

### What didn't work

- First typecheck:

  ```text
  src/agent.ts(124,35): error TS2345: Argument of type 'TextDecoderStream' is not assignable to parameter of type 'ReadableWritablePair<string, Uint8Array<ArrayBufferLike>>'.
    Types of property 'writable' are incompatible.
  src/agent.ts(294,14): error TS2339: Property 'close' does not exist on type 'never'.
  ```

  The first is the DOM lib's `TextDecoderStream` (writable side typed `BufferSource`) against `fetch`'s
  `ReadableStream<Uint8Array>`; I replaced `pipeThrough(new TextDecoderStream())` by a `TextDecoder` with
  `{stream: true}` on each chunk (no cast). The second is TypeScript narrowing `let out: … | null = null` to `null`
  because the assignment happens in a callback; `let out!: ReadableStreamDefaultController<Uint8Array>` states the
  truth (the `start` callback runs inside the `ReadableStream` constructor).

### What I learned

- A `ReadableStream` given to `c.body()` is the cleanest NDJSON response in Hono: `cancel()` fires when the consumer
  goes away, and the middlewares that run after `next()` (cache-control, security headers) still set headers on it.
- `app.request(url, {signal})` keeps the signal on `c.req.raw`, so an in-process test can abort a request the way a
  browser does.

### What was tricky to build

- **Ordering at the end of a call.** The row id goes into the final event, so the row must be inserted before `done`
  / `error` is sent, and the insert must happen even when the page has gone (then the send is a no-op). The insert is
  wrapped so a closing database cannot stop the page from getting its answer, and `callModel` never throws, so there
  is no path that skips the row.
- **`cancelled` versus the error that the abort causes.** Aborting the fetch makes the reader reject with an
  `AbortError`, which would otherwise be reported as "the model stream broke". `fail()` checks `signal.aborted`
  first, so every failure that follows an abort is recorded as `cancelled`, with the usage known at that point (input
  tokens from `message_start`).
- **Usage arrives twice.** `message_start` carries `input_tokens`, `cache_read_input_tokens` and a placeholder
  `output_tokens` (1); `message_delta` carries the final `output_tokens` and, on newer API versions, may repeat the
  input counts. The fold takes any number present in either, the later one winning.

### What warrants a second pair of eyes

- **Key handling.** `config.apiKey` is a plain field of `ServerConfig`; nothing in the server serializes or logs the
  config today, and every upstream error message passes through `scrub()` (the key replaced by `[redacted]`, cut at
  1000 characters) before it reaches a response or the database. A future `console.log(config)` would print it.
- **No upstream timeout and no concurrency cap.** A hung upstream holds the request until the page stops it; any
  number of calls can run at once. The page caps an answer at 12 calls; the token holder is the only caller.
- **`effort` and `modelTier` are not forwarded.** The server has one model (`KILN_MODEL`); sending
  `output_config.effort` would make a request to a model without effort support fail with 400, so the page's effort
  setting has no effect through the gateway yet.
- **`GET /api/health` still lists `features: ['records', 'devices', 'jobs', 'events']`** (two existing tests assert
  the exact list). The page can learn whether the gateway is usable from `GET /api/agent/usage` → `{model, ready}`
  instead, two fields beyond the assignment's shape.

### What should be done in the future

- Add `'agent'` to `FEATURES` together with the two tests that pin the list, if the page wants to discover the
  gateway from `/api/health`.
- Document `KILN_MODEL_URL` and `ANTHROPIC_API_KEY` in `S/README.md` and the §30.1 table (this worker may not edit
  them).
- Decide whether `effort` should map to `output_config.effort` for models known to support it.

### Code review instructions

- Start at `agentRoutes()` in `S/src/agent.ts`, then `callModel()` and `parseSample()`; the mount is two lines in
  `S/src/app.ts`.
- Validate: `pnpm --filter @kiln/server test` (60 tests) and `pnpm --filter @kiln/server typecheck`.

### Technical details

- Upstream request: `POST <modelUrl>` with headers `x-api-key`, `anthropic-version: 2023-06-01`,
  `content-type: application/json`; body `{model, max_tokens, stream: true, system?, tools?, messages}`.
- Row: `insert into llm_calls (conversation, model, input_tokens, output_tokens, reasoning_tokens = null,
  cache_read_tokens, est_prompt_tokens, duration_ms, stop_reason, error, created_at)`; `model` is the configured
  model, `error` is the error word or null.

## Step 3: Write the page-side gatewaySample and test both halves together

I wrote `W/src/agent/gateway.js`: `gatewaySample({base, token, conversation, fetch})` returns a `sample(turns,
{signal, modelTier, onText, tools})` with the host bridge's contract, so `agent.js` can be handed either without
knowing which. It converts the turns and the tools (`inputSchema` → `input_schema`), posts one call, folds the NDJSON
events (text deltas extend one string for the whole answer; `done` ends the call; `error` throws), and on
`stop_reason: tool_use` runs each requested tool in order, appends the assistant message exactly as the server
returned it plus one user message of `tool_result` blocks, and calls again — at most 12 calls.

The plain Node test `W/test/gateway.mjs` (33 checks) drives it with a fake `fetch`; two more vitest cases in
`S/test/agent.test.ts` run the page's actual `gatewaySample` through the real route and the fake upstream, which is
the only test that proves the two halves agree on the wire.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** a drop-in `sample` for `agent.js`, with the loop, the cap and the error codes on the
page.

**Inferred user intent:** `agent.js` stays unchanged whichever model path the page has.

**Commit (code):** none (the coordinator commits).

### What I did

- `W/src/agent/gateway.js` (104 lines): `MAX_CALLS = 12`; `call()` (fetch, HTTP refusal → the server's `error` word
  as the code, NDJSON reader with a `TextDecoder` and line buffer); `runTool()` (unknown tool or a throwing tool →
  `tool_result` with `is_error: true` and an `error\n…` body; a throw after the stop → `cancelled`); the loop
  (`max_tokens` → truncated; anything but `tool_use` ends the answer; the 12th call's tool requests are not run and the
  answer is truncated; no text and no tool run → `empty_completion`).
- `W/test/gateway.mjs` (174 lines, 33 checks): the two-call answer (call count, joined text, the `onText` sequence,
  the tool's input and signal, URL/method/token/content type/signal of the request, the first body, the second
  body's messages), the cap (12 calls, 11 tool runs, 23 messages in the last call), `max_tokens`, a stop during a call
  (the stream errors on abort), a stop during a tool, an already-aborted signal, a fetch rejected by the stop, an
  unreachable server, four error events, an error in the second call, four HTTP refusals and a non-JSON 502, a
  failing and an unknown tool, `empty_completion`, a stream without `done`, and a garbled line.
- `S/test/agent.test.ts`, describe "the page and the server together": the page's `gatewaySample` with
  `fetch = (url, init) => s.app.request(url, {...init, host})` runs a tool round and an answer through the real
  route (two upstream bodies, two rows filed under the conversation, `cache_read_tokens` 30 on the second), and maps
  `bad_token` (no token), `no_model` and an upstream 429 (`rate_limited`, row written).
- Did not edit `W/package.json`: its `test` script runs every `test/*.mjs` through `scripts/run-node-tests.mjs`
  except a skip list, so `gateway.mjs` is in the default run already. (Another worker changed the script meanwhile,
  adding `--skip server-e2e.mjs`; not editing it avoided a collision.)
- Re-read `W/src/agent/agent.js` after the coordinator's sandbox changes: `sample(turns, {signal, modelTier,
  effort?, cache: false, onText, tools: [evalTool(msg)]})`, `execute(input, {signal})` resolving to a string and
  throwing `Error('stopped')` after a stop, and `ERRORS` are unchanged; the eval cap (`EVAL_CAP`) now lives in
  `runEval`, so the gateway's 12-call cap is only the outer bound.

### Why

- **One text string per answer, `\n\n` between calls.** `agent.js` sets `msg.text` from every `onText` and records
  each eval's position as `msg.text.length`; text from the call after a tool round must therefore extend, not
  replace, what was shown, and a blank line keeps "Let me look." and "It is 2." from running together.
- **A tool failure is the model's to read.** Only a stop ends the answer; a thrown error becomes an `is_error`
  result, as the API expects, so the model can recover.
- **All tool results of one call in one user message**, as the API requires for parallel tool use.
- **The 12th call's tool requests are not run.** There would be no call to deliver their results, and running an
  eval whose output nobody reads only changes the page.
- **No `x-kiln-token` header without a token**, instead of the string "undefined".

### What worked

- `node test/gateway.mjs` → `all 33 gateway checks pass` on the first run.
- `pnpm --filter @kiln/workbench test` → `ok gateway.mjs 71 ms`, `ok notes.mjs`, `ok presets.mjs`,
  `ok server-sync.mjs`, `all 4 passed`.

### What didn't work

- The first run of the new end-to-end vitest case failed:

  ```text
  FAIL  test/agent.test.ts > the page and the server together > surfaces the server's refusals and the upstream's errors as the page's error codes
  AssertionError: expected Error: x-kiln-token is missing or wrong: … { …(2) } to match object { code: 'no_model' }
  ```

  A test bug: the `no_model` server was a second `makeServer` with its own token, and I sent the first server's
  token. Fixed by using `off.token` for `off`. After the fix: `pnpm --filter @kiln/server test` →
  `Test Files 8 passed (8)`, `Tests 62 passed (62)`; typecheck clean.

### What I learned

- The gateway's JS can be imported by the server's vitest through a computed specifier
  (`await import(fileURLToPath(new URL('../../workbench/src/agent/gateway.js', import.meta.url)))`), which types as
  `any` and so needs no declaration in `S/test/support/modules.d.ts` (a file this worker may not edit).
- `fetch` must stay unbound-safe: the default is `globalThis.fetch?.bind(globalThis)` (as in `server-client.js`),
  because calling a browser's `fetch` as a method of an options object throws "Illegal invocation".

### What was tricky to build

- **Turning every abort into `cancelled`.** A stop can surface as a rejected `fetch` (AbortError), a rejected
  `reader.read()`, a `cancelled` error event from the server, or `Error('stopped')` from the eval tool; each path
  checks `signal.aborted` first and throws the same `cancelled` error with the text so far.
- **The final NDJSON line.** The reader appends `\n` once the stream is done, so a last line without a newline is
  still parsed, and a stream that ends without `done` or `error` fails as `upstream_error` rather than returning a
  partial answer as if it were complete.

### What warrants a second pair of eyes

- `agent.js`'s `ERRORS` has no entries for `no_model`, `no_api_key`, `upstream_error` or `bad_token`; they show as
  "Something went wrong (no_model). Try again." The coordinator owns `agent.js`.
- `effort` and `cache` are accepted and ignored; `modelTierApplied` echoes the tier the caller passed although the
  server has one model.

### What should be done in the future

- Wire it in `wb.js` (not this worker's file): when there is no host bridge and the page has a session token,
  `wb.sample = gatewaySample({ token: sessionToken(), conversation: () => agent.conv?.id ?? null })`, ideally only
  when `GET /api/agent/usage` says `ready: true`.
- A usage view (or a line in the agent panel) reading `GET /api/agent/usage`.

### Code review instructions

- Read `W/src/agent/gateway.js` top to bottom (the loop is the last 20 lines); then the "the page and the server
  together" block at the end of `S/test/agent.test.ts`.
- Validate: `cd apps/workbench && node test/gateway.mjs`; `pnpm --filter @kiln/workbench test`;
  `pnpm --filter @kiln/server test`; `pnpm --filter @kiln/server typecheck`.

### Technical details

- Second-call body for a one-tool round:
  `messages: [...turns, {role: 'assistant', content: <done.message.content>}, {role: 'user', content:
  [{type: 'tool_result', tool_use_id, content: '<execute() string>'}]}]`, plus the same `conversation` and `tools`.

## As built: the gateway's wire protocol

**Configuration** (`S/src/config.ts`): `KILN_MODEL` (model id; unset turns the gateway off), `KILN_MODEL_URL`
(default `https://api.anthropic.com/v1/messages`), `ANTHROPIC_API_KEY` (sent upstream as `x-api-key`; never logged,
returned or stored).

**`POST /api/agent/sample`** — behind the `/api` checks (Host, Origin — `Origin: null` refused —, `X-Kiln-Token`,
`application/json`). Body:

```jsonc
{
  "conversation": "c42",                       // string of 1–200 chars, or null / absent
  "messages": [                                // 1–400; the first from the user
    { "role": "user", "content": "…" },        // content: a string, or 1–400 blocks with a string `type`
    { "role": "assistant", "content": [{ "type": "text", "text": "…" }, { "type": "tool_use", "id": "toolu_1", "name": "eval", "input": { "code": "…" } }] },
    { "role": "user", "content": [{ "type": "tool_result", "tool_use_id": "toolu_1", "content": "ok\n…" }] }
  ],
  "tools": [{ "name": "eval", "description": "…", "input_schema": { "type": "object" } }],   // optional, ≤ 32
  "system": "…",                               // optional string
  "max_tokens": 16000                          // optional integer 1–32000, default 16000
}
```

Refusals before any upstream call (JSON `{error, message}`): `503 no_model`, `503 no_api_key`, `400 bad_json`,
`400 bad_request`, `413 prompt_too_large` (body over 4 MiB), and the security checks' `403 bad_host`,
`403 bad_origin`, `403 bad_token`, `415 unsupported_media_type`.

Otherwise `200 application/x-ndjson`, one JSON object per line:

```text
{"type":"text","text":"<delta>"}
{"type":"done","message":{"role":"assistant","content":[<thinking|text|tool_use blocks; tool_use.input parsed>]},"stop_reason":"end_turn|tool_use|max_tokens|…","usage":{"input_tokens":n,"output_tokens":n,"cache_read_tokens":n},"call":<llm_calls id>}
{"type":"error","code":"rate_limited|prompt_too_large|refused|cancelled|upstream_error","message":"…","call":<llm_calls id>}
```

Zero or more `text` events, then exactly one `done` or `error`. Error codes: `rate_limited` (upstream 429, 529,
`rate_limit_error`, `overloaded_error`, also mid-stream), `prompt_too_large` (upstream 413 / `request_too_large`, or
a 400 whose message says the prompt is too long), `refused` (`stop_reason: refusal`), `cancelled` (the page aborted
the request or cancelled the response; the upstream fetch is aborted), `upstream_error` (anything else: other HTTP
statuses, an unreachable model, a stream that ends before `message_stop`, a tool input that is not JSON). Upstream
error messages are cut at 1000 characters with the key replaced by `[redacted]`.

Upstream request: `POST $KILN_MODEL_URL`, headers `x-api-key`, `anthropic-version: 2023-06-01`,
`content-type: application/json`, body `{model, max_tokens, stream: true, system?, tools?, messages}` with one
`cache_control: {type: "ephemeral"}` on the last block of the last user message.

**`llm_calls`**: exactly one row per upstream call, whatever the outcome — `conversation`, `model` (the configured
id), `input_tokens` and `cache_read_tokens` (from `message_start`, overridden by `message_delta` when present),
`output_tokens` (`message_delta`), `reasoning_tokens` null, `est_prompt_tokens = ceil(chars / 4)` over system text,
text blocks, `tool_use` inputs (as JSON), `tool_result` text and the tool definitions (as JSON), `duration_ms`,
`stop_reason`, `error` (the code above or null), `created_at` (ISO).

**`GET /api/agent/usage`**:

```text
{
  "model": "…" | null, "ready": true,           // ready = model and key both configured
  "totals": [{ "model", "calls", "input_tokens", "output_tokens", "cache_read_tokens", "est_prompt_tokens" }],
  "conversations": [{ "conversation", "model", "calls", "input_tokens", "output_tokens", "last_at" }]
}
```

Totals by model (sums of nulls are 0); conversations grouped by conversation and model, rows without a conversation
left out, most recent first, at most 50.

**Page side** (`W/src/agent/gateway.js`): `gatewaySample({base = "", token, conversation = () => null, fetch})` →
`sample(turns, {signal, modelTier, effort, onText, tools, cache}) → {text, truncated, modelTierApplied}`; at most 12
model calls per answer; failures are `Error` objects with `code` (the server's error word or the event's code, plus
`empty_completion`) and `text` (the answer so far).
