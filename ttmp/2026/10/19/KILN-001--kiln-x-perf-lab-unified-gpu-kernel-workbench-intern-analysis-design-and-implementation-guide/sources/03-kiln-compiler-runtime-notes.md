# Kiln Workbench: compiler, runtime, agent and runner notes

Source analysed: `/Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/` (imported snapshot, read-only).
Date of analysis: 2026-10-19. Scope: the compiler framework (`app/src/core`), the standard ML stack (`app/src/std`),
the in-page agent (`app/src/agent`), the runtime glue in `app/src/ui/wb.js` (non-visual parts only), the CUDA runner
(`runner/kiln_runner.py`), the build (`app/build.mjs`), the tests (`app/test`) and the 25 presets (`presets/`).
UI components and CSS are covered by a separate document.

All paths below are relative to the snapshot root unless they start with `/`. A reference such as `kiln.js:603` means
`app/src/core/kiln.js` line 603. A reference to a `std/` or `agent/` or `ui/` file means the file under `app/src/`.

Every non-trivial claim carries one of two tags:

- **[observed]** I read it in the source at the cited line, or saw it in output from a command I ran on a scratch copy.
- **[inferred]** It is my reading of intent or consequence. I did not execute or test it.

## 0. Orientation

### 0.1 What Kiln Workbench is

It is a single-page, browser-hosted compiler laboratory. One HTML file contains the whole system. A user (or an LLM
agent running inside the page) writes a short JavaScript "project script". The script defines dialects, rewrite
rules, passes and pipelines, plus a program to compile. The workbench then:

1. traces the program into a graph;
2. runs the pipeline, recording every rewrite, every declined rewrite and every schedule decision;
3. emits CUDA and WGSL for each GPU kernel;
4. checks numerics end to end;
5. "measures" each kernel on a simulated GPU, on the local GPU through WebGPU, or on an NVIDIA box through a small
   Python runner.

Measurements are written to an evidence store. The next compile prefers the fastest measured schedule.

The standard pipeline (`std.emmy`) follows the six-IR design from the CloudRift "GPU compiler from scratch" series
(README.md:8-9, reference.txt:133-141) [observed]:

```text
torch [nn, tensor] -d-> tensor -o,l,f,s-> loop -t-> tile -k-> kernel -c-> gpu
```

### 0.2 File inventory (compiler/runtime side)

| File | Lines | Role |
| --- | --- | --- |
| `app/src/core/kiln.js` | 1132 | Framework: dialects, ops, graph, values, patterns, rules, passes, pipelines, params, forks, decide policies, the `Run` engine |
| `app/src/core/ix.js` | 241 | Affine index algebra (`ix`): simplifying constructors, substitution, evaluation, C/WGSL/JS printing |
| `app/src/core/script.js` | 39 | Preset header parser and the script runner (`new Function`) |
| `app/src/core/util.js` | 72 | cyrb53 hash, mulberry32 RNG, `Tensor`, `compare`, `median` |
| `app/src/std/index.js` | 63 | The `std` namespace, `Project`, and the script scope |
| `app/src/std/fns.js` | 46 | Elementwise function table (JS/C/WGSL templates, flop weights) and reducers |
| `app/src/std/tensor.js` | 306 | `nn` and `tensor` dialects, reference semantics, decompositions, tensor optimizations |
| `app/src/std/loop.js` | 359 | Loop IR expression language, LICM scheduler, work model, lifting, fusion, naming |
| `app/src/std/tile.js` | 364 | Schedule knobs, analysis, legality, fork tree, analytic cost model and time model |
| `app/src/std/kernel.js` | 318 | Kernel IR builder (`KB`), thread/row/tiled materialisation, sync cleanup |
| `app/src/std/emit.js` | 251 | CUDA, WGSL and lockstep-simulator code generators; `SimMetrics` |
| `app/src/std/program.js` | 144 | `gpu` dialect, emit pass, `programOf`, kernel identity, simulator driver, checks |
| `app/src/std/emmy.js` | 37 | The standard six-IR pipeline and its default decide chain |
| `app/src/std/targets.js` | 14 | Five GPU specs plus a WebGPU default |
| `app/src/std/store.js` | 40 | Evidence store |
| `app/src/std/devices.js` | 175 | Simulated, WebGPU and CUDA devices; bundle export and results ingest |
| `app/src/std/tune.js` | 107 | `measureProgram`, sweep and SP-MCTS autotuning |
| `app/src/agent/agent.js` | 594 | In-page agent: prompt, one `eval` tool, snapshots, modes |
| `app/src/ui/wb.js` | 322 | Runtime state: compile, end-to-end check, measure, tune, persistence |
| `app/src/main.jsx` | small | Mounts the app, exposes `window.__kiln`, connects `window.claude` |
| `runner/kiln_runner.py` | 361 | nvcc build, CUDA-event timing, optional ncu, a local HTTP server |
| `app/build.mjs` | 65 | Generates preset/doc modules; esbuild bundle into one HTML file |
| `reference.txt` | 182 | API reference; also inlined into the agent prompt |
| `agent-guidelines.txt` | 19 | Agent behaviour rules; also inlined into the prompt |
| `presets/W-NN-*.js` + `.md` | 25 pairs | Built-in projects plus Markdown tutorial notes |

The only runtime library import in `core` and `std` is `acorn` (`script.js:3`). It is used for a syntax check
[observed: grep of import lines]. React is loaded from a CDN by the built HTML (build.mjs:46-60) [observed].

### 0.3 The core mental model in one paragraph

Everything is a graph of immutable `Node`s owned by a mutable `Graph`. Ops belong to dialects. A pipeline alternates
IR checkpoints with passes. A checkpoint snapshots the graph and, if it is strict, proves that only allowed dialects
remain. A pass applies rules. A rule matches a pattern at a node, then returns one of:

- a replacement value;
- an in-place edit;
- a whole new graph;
- `undefined` (no change);
- a *fork*: a list of alternative rewrites, each tagged with "knobs".

A *decide policy* ranks a fork's options. The engine tries them in ranked order until one survives the op's
`validate` and the rule's guards, then stamps the chosen knobs onto the nodes it built. Every attempt becomes a trace
step or a decision record. The workbench, the agent and the tutorials all reason from that trace.

## 1. Core framework (`app/src/core/kiln.js`)

### 1.1 Types (TypeScript-like sketch)

This sketch is reconstructed from the code. It is not an official type file. The cited lines are where each shape is
built.

```ts
// kiln.js:9-13
type TensorType = { kind: "tensor"; shape: number[]; dtype: "f32" | string };
type ScalarType = { kind: "scalar"; dtype: "f32" | string };
type Type = TensorType | ScalarType | { kind: string; [k: string]: unknown };

// kiln.js:45-74, 76-98
interface OpSpec {
  args?: string[] | { variadic: string };
  attrs?: Record<string, unknown>;              // defaults
  traits?: ("pure" | "commutative" | "const" | "effect" | "any-ir")[];
  infer?: (ctx) => Type;                         // ctx = named args (as Values) + attrs
  eval?: (ctx) => unknown;                       // reference semantics; enables interpretation
  print?: string | ((ctx) => string);            // "{a} + {b}" template or function
  body?: (ctx) => string;                        // multi-line body (loop/tile/kernel IR)
  validate?: (ctx, runCtx) => true | string;     // legality, checked after every rewrite
  identity?: (ctx) => string;                    // key for measured evidence
}
interface OpDef { dialect: Dialect; short: string; name: string; spec: OpSpec; traits: Set<string>;
                  (...args, attrs?): Value | OpTemplate }    // callable; zero args gives a template
interface Dialect { name: string; ops: Record<string, OpDef>;
                    op(short, spec): Dialect; lifts(fn): Dialect; methods(m): Dialect; describe(t): Dialect }

// kiln.js:107-110 (Node is frozen)
interface Node { id: string; def: OpDef; args: string[]; attrs: object; type: Type; knobs?: Knobs }
type Knobs = Record<string, number | string | boolean>;

// kiln.js:113-192
interface Graph { name: string; nodes: Map<string, Node>; inputs: {name, id}[]; outputs: {name, id}[];
                  version: number; size: number; topo(): string[]; users(id): string[]; value(id): Value;
                  replaceUses(old, nu, except?): void; dce(): void; clone(): Graph; key(): string;
                  eval(inputs): Record<string, unknown>; print(opts?): string }

// kiln.js:461-506
interface Param { name: string; type: "int" | "float" | "enum" | "bool" | "text"; phase: "build" | "run";
                  off?: unknown; values(rctx?): unknown[]; parse(s): unknown }

// kiln.js:513-520
interface ForkOption { knobs: Knobs; label: string; build: (rctx) => RewriteResult; original?: boolean }
interface ForkPoint { pass; rule; ruleId; nodeId; node: Value; options: ForkOption[]; all: ForkOption[];
                      size: number; allPinned: boolean; knobs: string[]; key: string; ctx }
type Ranking = { order: number[]; by: string; scores?: number[] } | null;      // null = "pass it on"
interface Policy { name: string; rank(fp: ForkPoint, run: Run, next?: () => Ranking): Ranking }

type RewriteResult = Value | InPlace | Graph | Fork | ForkOption[] | undefined;

// kiln.js:1048-1073
type Step = { i; kind: "rewrite"; pass; short; rule; node; t; added: string[]; removed: string[];
              changed: string[]; decision?: {by, knobs, size}; before: string; after: string;
              delta: {...}; graph: Graph | null }
          | { i; kind: "skip"; pass; short; rule; node; reason: string; reject: boolean; t };
type Decision = { pass; rule; node; key; options: {knobs, label, score, original, j}[]; size;
                  by: string; knobs: Knobs | null; chosen?; tried: {knobs, reason}[]; failed?: true };
```

### 1.2 Dialects and ops

- `k.dialect(name)` registers into a global `DIALECTS` map (`kiln.js:99-100`) [observed].
- `.op(short, spec)` creates an `OpDef` (`kiln.js:45-74`). Calling the def creates a node in the current scope. The
  scope stack is `SCOPES` with `withScope` (`kiln.js:20-22`). The call accepts positional args plus a trailing plain
  object of attrs. A call with zero args returns an `OpTemplate` (`kiln.js:43`), which `node.lower(Template)` uses.
  Arity mismatches raise `ArityError`. Building outside a scope raises `ScopeError` [observed].
- `.lifts(fn)` converts bare JS numbers to dialect constants (`kiln.js:76-98`). For example, `x.mul(3)` lifts `3` to
  `arith.const`.
- `.methods({...})` installs value methods. Values are wrapped in a `Proxy` (`kiln.js:25-40`, `346`) so `x.add(y)`
  dispatches through a global `METHODS` registry [observed].
- `kiln.input` is a built-in op for graph inputs (`kiln.js:103`).

### 1.3 Graphs, values and tracing

- `Graph.addNode` infers the type through `spec.infer` (`kiln.js:194-202`).
- `topo()` is iterative. `users(id)` is cached. `dce()` keeps nodes with the `effect` trait (`kiln.js:113-192`)
  [observed].
- **Structural keys:** `attrKey` and `nodeKey` (`kiln.js:205-228`) hash an op name, attrs and argument keys
  recursively with cyrb53 (`util.js:3-10`). `keyIgnore` defaults to `name`, `note` and `label`, so cosmetic attrs do
  not split CSE classes [observed]. W-02 builds CSE on top of `key()`.
- **Values:** `Value` (`kiln.js:307-345`) is the handle that rules and traced code see: `arg(i | name)`, `is(op)`,
  `has(trait)`, `isConst(v?)`, `with({args, attrs, def})` (returns an `InPlace` edit, `kiln.js:349`),
  `lower(Template | ctor, attrs?)` and `fold()` (evaluates a pure node whose args are constant).
- **Tracing:** `k.trace(name, fn, inputTypes)` and `k.graph(name, b => ...)` (`kiln.js:352-384`) open a `GraphScope`
  and run user code. Dialect calls append nodes [observed].

### 1.4 Printing and interpretation

- **Printing:** `nodeLine`, `printNode` and `printGraph` (`kiln.js:243-281`) render one line per node. A node either
  uses a template such as `{a} + {b}` or calls the op's `print` function. Knobs print in angle brackets (`⟨MAP=row,...⟩`).
  Ops with a `body` (loop, tile, kernel) print an indented body under the node when `print({ body: true })` is used
  [observed in the RMSNorm loop IR dump, section 2.11].
- **Interpretation:** `evalGraph` (`kiln.js:284-304`) walks the graph in topological order and calls each op's `eval`.
  It throws `EvalError` when an op has no `eval`. Every built-in ML op carries a reference `eval`, so any IR level up
  to `loop` can be executed for checking. `loop.kernel.eval` is `runSerial` over the scheduled loop nest
  (`loop.js:260-279`) [observed].

### 1.5 Patterns (`P`)

`Pat` (`kiln.js:392-448`) and the `P` namespace (`kiln.js:450-458`) provide:

- `P.op(name | def)`, `P.oneOf`, `P.trait`, `P.const(v?)`, `P.any()`, `P.var(name)`;
- modifiers `.as(name)` (capture), `.where(pred)`, `.args(p1, p2, ...)`, `.attrs({...})`, `.oneUse()`;
- `P.chain(inner, outer)`: the inner node must have exactly one use and must not be a graph output. The match root
  is the *outer* node (`replaces` sets `__root`) [observed: `_matchChain`].

`matchAt(graph, id)` returns an environment of captures, or `null`.

### 1.6 Rules

`k.rule(name)` builds a `Rule` (`kiln.js:603-645`) from `.match(pattern)` plus `.rewrite(fn)` or `.mutate(fn)`
(`.mutate` gets a `tx` with `set`, `replace` and `remove`, `kiln.js:1092-1099`). Optional parts: `.when(pred)`
declines silently; `.guard(fn)` vetoes *after* the rewrite, given `{before, after, root, node, ctx, run}`;
`.requires(rule)` waits until that rule has fired somewhere in this run; `.fixpoint()` and `.describe()`.

**By-example rules** are `k.rule(n).from(({x}) => x.mul(1)).to(({x}) => x)` (`kiln.js:646-651`). They read the
destructured parameter names from the lambda's *source text*, trace the `from` lambda into a pattern, and replay the
`to` lambda as the rewrite [observed]. This depends on `Function.prototype.toString`, so it breaks if user code is
minified [inferred].

Two debugging helpers exist: `rule.applyTo(graph)` and `rule.explain(graph)`.

### 1.7 Passes and pipelines

**Passes:** `k.pass(name)` (`kiln.js:655-669`) takes `.short(letter)`, `.rules(...)`, `.mode("fixpoint" | "once" |
"ordered-once")` (default fixpoint), `.order("topo" | "reverse")`, `.knobs(...params)`, `.whole(fn)` for a
whole-graph pass, `.check(fn)` post-conditions, `.helpers(...)` and `.limit(maxSteps)` (default 4000).

**Pipelines:** `k.pipeline(name)` (`kiln.js:673-730`) alternates `.ir(name, {dialects, strict})` checkpoints with
`.pass(p)` steps, plus `.params`, `.decide`, `.target`, `.use(strategy)` and `.describe`. A built `Pipeline` is
immutable but derivable: `with({decide, target, name, use})`, `insertAfter` and `insertBefore`, `replace`, `without`,
`withIr`, and `insertRule`, `replaceRule` and `removeRule` (through `_rebuild`). Passes are addressed by full name or
short letter [observed]. Presets W-14 and W-16 extend the ML pipeline this way.

### 1.8 The `Run` engine: rewrite driver

`pipeline.run(graph, opts)` constructs a `Run` (`kiln.js:742-753`):

- `params` is a `ParamSet` with `opts.params` applied as pins;
- `ctx = {target, run, pipeline, ...opts.ctx}`;
- it also holds `steps`, `decisions`, `reads`, `events`, `checkpoints`, `irOrder`, `passStats`, `warnings` and
  `strategies`.

`go()` (`kiln.js:788-818`) is the top loop. Pseudocode, faithful to the source:

```text
go():
  g = input.clone(); checkpoints["input"] = g.clone()
  for step in pipeline.steps:
    if step is IR checkpoint:
      if no pass filter: checkIr(step)          # strict dialect check -> LoweringError
      checkpoints[step.name] = graph.clone(); irOrder.push(step.name)
      if opts.upTo == step.name: break
    else if pass filter excludes it: continue
    else: runPass(step.pass)
  on exception: ok = false; error = KilnError (Skip -> RuleError, unknown -> InternalError)
```

`checkIr` (`kiln.js:819-830`) lists up to six offending nodes. For each, it names the most recent *skip* step on that
node (`declinedBy: "pass/rule: reason"`). This is how the user learns why lowering stranded a node [observed]. The
`core.mjs` output shows the shape: `strict stranding: 1 node did not lower to the vm IR (vm): n0 arith.neg`.

`runPass` (`kiln.js:831-869`):

```text
runPass(p):
  declined = new Map()                           # rule.uid -> WeakSet<Node>; reset per pass
  if p.whole:          runWhole(p)               # one callback; Skip restores the graph
  elif mode == "ordered-once":
      for r in rules: for id in topo(): tryRule(p, r, id)
  elif mode == "once":
      for id in topo(): for r in rules: if tryRule(p,r,id) and not r.fix: break
  else:  # fixpoint with local resume
      n = 0; resume = null
      loop:
        ids = topo() (reversed if p.order == "reverse")
        from = resume ? index of first id in resume : 0
        for id in ids[from:]:
          for r in rules:
            if tryRule(p, r, id):
              if ++n > maxSteps: throw FixpointError("... is a rule undoing another?")
              resume = nearLastStep()             # rewritten nodes + their args + their users
              continue loop
        if resume: resume = null; continue loop   # one full confirming sweep from the top
        break
  for c in p.checks: if c(graph, run) is not true/null: throw PassCheckError
```

`tryRule` (`kiln.js:899-938`) does the work for one (rule, node) pair:

```text
tryRule(p, r, id):
  node = graph.nodes[id]; skip if input, or already declined for (r, node object)
  env = r.pat.matchAt(graph, id)              # PatternError if the matcher throws
  if !env: return false
  root = env.__root or id
  if any when() is false: decline; return false              # silent
  if a required rule has not fired: decline; skipStep("requires X"); return false
  before = graph.clone()
  res = r.mut ? r.mut({...ctx, tx}) : r.fn(ctx)     # inside a fresh GraphScope
    Skip thrown      -> restore; decline; skipStep(reason)   # visible decline
    EvidenceError    -> rethrow (strict decide)
    other throw      -> RuleError
  if r.mut: dce(); return finish(...)                # guards run in finish
  if res is array: res = fork(res)
  if res is Fork:  return applyFork(...)
  out = applyResult(res)                              # Value | InPlace | Graph | undefined
  if out == "nochange": restore; decline; return false
  if validate(before, root) fails: restore; decline; skipStep(why, reject=true); return false
  return finish(...)                                  # guards, then recordStep
```

Key details [observed]:

- **The decline memo** is a `WeakSet` of `Node` *objects* per rule (`kiln.js:897-898`). Nodes are immutable and are
  replaced on any change, so a decline is automatically forgotten once the node (or an argument rewrite that rebuilds
  it) changes. The engine never re-tries a rule on an unchanged node, which keeps the fixpoint loop cheap.
- **`applyResult`** (`kiln.js:939-964`):
  - An `InPlace` result that changes nothing (same def, args, attrs and knobs) counts as no change.
  - A `Value` result calls `replaceUses(root, value, scope.created)`, so uses created inside the rewrite's own scope
    are not redirected.
  - Returning an `OpTemplate` is a user error with a targeted message.
- **`validate`** (`kiln.js:965-975`) runs `spec.validate` only on nodes that are new or changed. This is how
  `tensor.ew` enforces same-shape operands and `nn.linear` enforces weight shapes (`tensor.js:137-160`).
- **`finish`** (`kiln.js:1039-1047`) runs the guards (unless the fork path already ran them) and records the step.
  It also declines the rule on the root if the root survived unchanged, so a rewrite that only touched neighbours
  cannot loop.

### 1.9 The trace: steps, snapshots and diffs

- **Rewrites:** `recordStep` (`kiln.js:1048-1068`) stores `added`, `removed` and `changed` ids, clipped before/after
  prints of only the touched nodes (160 lines), a `delta` (new or changed `Node` objects plus inputs and outputs) and,
  every 48th rewrite, a full graph snapshot.
- **Reconstruction:** `stepGraph(i)` (`kiln.js:769-784`) rebuilds any step's graph from the nearest snapshot plus
  deltas. `diff(i)` (`kiln.js:785`) is an LCS unified diff (`kiln.js:1114-1125`) [observed].
- **Declines:** `skipStep` (`kiln.js:1069-1073`) records `reason` and `reject`. `reject = true` means "this was legal
  to try but illegal or vetoed", as opposed to a cheap decline.
- **Per-pass statistics:** `passStats[pass] = {applied, skipped, forks, ms, short}`.

Observed `passStats` for RMSNorm `[64, 256]` on rtx5090 with pins `MAP=row, TPB=64, STAGE=none`: rewrites per pass
were d 1, o 2, l 9, f 8, s 1, t 1 (one fork), k 1 and c 1, so 24 in total. The first steps are `d:decompose:nn.rms_norm@n1`, `o:fold_splat_view@n5`,
`o:fold_splat_view@n8`, `l:lift_elementwise@n2`, `l:lift_reduce@n3` and so on.

### 1.10 Strategies and events

`emit(type, data)` (`kiln.js:755-760`) appends to `run.events` and notifies registered strategies.
`k.strategy(name).state(init).on(evType | "*", fn).expose(fn)` (`kiln.js:733-739`) is an observer hook. Strategies can
read compile events but cannot change rewrites [observed]. Event types: `runStart`, `runEnd`, `ir`, `passStart`,
`passEnd`, `rewrite`, `skip`, `fork`, `decided` and `error`.

### 1.11 Params, knobs and forks

- **`param.int/float/enum/bool/text`** (`kiln.js:461-491`) carry `default`, `min`, `max`, `step`, `scale` (`log`),
  `group`, `help`, `off` (the "not applied" value) and `phase` (`build`: a program slider that re-traces; `run`: a
  pipeline knob). `values(rctx)` enumerates the domain for forks.
- **`ParamSet`** (`kiln.js:492-506`) holds values and pins. `set` pins by default. `pinned()` returns the pinned map.
- **Param reads are recorded.** `ctx.param(p)` inside a rule logs `(param, where)` in `run.reads` (`kiln.js:762-766`).
  The UI can then show which rule read which knob [observed].
- **Fork constructors** (`kiln.js:513-536`):
  - `k.fork([fn | {knobs, label, build}])`: an explicit option list. A rewrite returning an array is the same.
  - `k.fork.over(P, values?, v => result)`: one option per value of `P`. `values` may be a lazy list.
  - `k.fork.toggle(P, fn)`: apply the option, or keep the original (`P.off`).
  - `k.fork.tree().level(P1, (knobsSoFar, rctx) => values).level(P2, ...).leaf(knobs => result)`: the Cartesian
    product with per-level value functions. This is how `std.tile` expresses legality-pruned schedule spaces.
  - `.keepOriginal(param?)` appends an option `{knobs: {[p]: p.off}, label: "keep original", build: () => undefined}`.
- **`expandFork`** (`kiln.js:538-557`) materialises options. Tree expansion is capped at 20,000 leaves [observed:
  `if (out.length >= 20000) return`].

### 1.12 Decide policies

All policies live in `kiln.js:560-599`. A policy returns `{order, by, scores}` or `null`, meaning "no opinion, pass
it on".

| Policy | Behaviour (observed) |
| --- | --- |
| `decide.first()` | Emission order. |
| `decide.pinned()` | Emission order, but **only when every knob of the fork is pinned** (`fp.allPinned`); otherwise `null`. Pins have already narrowed `options` before any policy runs. |
| `decide.random(seed)` | Fisher-Yates with an LCG. |
| `decide.cost(fn, {name}).for(...rules)` | Scores every option. Throws, `null` and `NaN` become `Infinity`. Returns `null` if all are `Infinity`. Ties break by canonical knob string (`tieBreak`, `kiln.js:562`). |
| `decide.chain(...ps)` | The first non-null ranking wins. Each part gets a `next()` thunk that evaluates the rest of the chain (`kiln.js:579-582`). |
| `decide.exactly(fn)` | Picks one option by index or by knobs. |
| `decide.evidence(store?, {always})` | Ranks by the best measured µs per canonical knob string. Defers unless the next policy's favourite has been measured. |
| `decide.strict()` | Throws `EvidenceError`: "measure it or pin a row". |

The evidence policy is the most subtle. Verbatim logic:

```js
// kiln.js:587-597
evidence: (store, { always = false } = {}) => policy("evidence", (fp, run, next) => {
  const st = store || run?.ctx?.store;
  const rows = st?.lookup?.(fp, run);
  if (!rows || !rows.length) return null;
  const best = new Map();
  for (const r of rows) { const c = canon(r.knobs); if (!best.has(c) || r.us < best.get(c)) best.set(c, r.us); }
  const scores = fp.options.map((o) => best.get(canon(o.knobs)) ?? Infinity);
  if (scores.every((s) => s === Infinity)) return null;
  if (!always && next) { const r = next(); if (r && r.order.length && scores[r.order[0]] === Infinity) return null; }
  return { order: tieBreak(fp, scores), by: "evidence", scores };
}),
```

The rule, in words: measured evidence decides only if the downstream policy's (usually the cost model's) top choice
has *also* been measured. One lucky measurement of a pinned naive schedule therefore cannot lock it in after
unpinning (reference.txt:107-109) [observed]. Unmeasured options score `Infinity` and sort last. This is
exploitation-only: a measured option beats every unmeasured one, even one the model predicts to be faster
[inferred from the scoring].

### 1.13 Applying a fork

`applyFork` (`kiln.js:976-1031`):

```text
applyFork(p, r, root, fork, rctx, before, node):
  all = expandFork(fork, rctx)
  if all empty: restore; decline; skipStep("fork with no options")
  pinnedHere = knob names in all options that are pinned
  options = all filtered to match every pinned knob they mention
  if options empty: warn "pins ... are not offered by r at root; ignoring them there"; options = all
  options = options minus run.blocked[r@root]                     # see weakness W-12
  fp = {pass, rule, ruleId, nodeId: root, node, options, all, size, allPinned, knobs, key: identityOf(root), ctx}
  ranking = decidePolicy.rank(fp, run) or {order: 0..n-1, by: "first"}
  tried = []
  for i in ranking.order:
    graph = before.clone()
    res = options[i].build(rctx)          # Skip -> tried.push(reason); continue
    nested fork -> RuleError ("use k.fork.tree()")
    out = applyResult(res)
    record decision {options with scores, by, knobs, tried, ...}
    if out == "nochange": restore; decline; push decision; return false   # "keep original" chosen
    if validate fails or a guard fails: tried.push(reason); continue
    stamp option.knobs onto every new or changed non-input node
    push decision; passStats.forks++; return finish(..., guarded = true)
  restore; decline; skipStep("no legal option among N: <first 3 reasons>", reject = true)
  push decision {by: "none", failed: true, tried}
```

Knob stamping is how a later pass knows which schedule a `tile.kernel` was built with (the `⟨...⟩` suffix in prints).
`identityOf(graph, id)` (`kiln.js:1075-1079`) uses the op's `spec.identity` if present, otherwise `nodeKey`. This key
joins decisions to evidence rows.

A captured decision record (RMSNorm, the `tile/schedule` fork) has `pass`, `rule: "schedule"`, `node`, `key` (the
kernel identity hash), `size`, `by: "model"`, `chosen`, `tried`, `options: [{knobs, label, score, original, j}]` and
`knobs` with all nine knobs (`{MAP: "row", TPB: 64, COARSEN: 1, STAGE: "none", BM: 0, BN: 0, BK: 0, TM: 1, TN: 1}`)
[observed]. With three knobs pinned, `size` was 1 and `by` was still `"model"`, because `pinned()` requires every knob
to be pinned.

### 1.14 Error taxonomy (`KilnError.kind`)

| Kind | Raised by | Meaning |
| --- | --- | --- |
| `ArityError`, `ScopeError` | `OpDef` call (`kiln.js:45-74`) | Wrong argument count; node built outside a graph scope |
| `PatternError` | `tryRule` (`kiln.js:906`) | The matcher threw |
| `RuleError` | `tryRule`, `applyFork`, `applyResult` | The rewrite threw, returned an illegal value, or a fork returned a fork |
| `FixpointError` | `runPass` (`kiln.js:856`) | More than `maxSteps` rewrites in one pass |
| `PassCheckError` | `runPass` (`kiln.js:866`) | A `.check()` post-condition failed |
| `LoweringError` | `checkIr` (`kiln.js:828`) | Strict checkpoint found foreign ops; names the last decline |
| `DecideError` | `applyFork` (`kiln.js:994`) | A decide policy threw a non-Kiln error |
| `EvidenceError` | `decide.strict` (`kiln.js:598`) | No measured evidence for a fork |
| `EvalError` | `evalGraph` | An op without `eval` was interpreted |
| `InternalError` | `go` (`kiln.js:812`) | Anything else |

### 1.15 The index algebra (`ix.js`)

Loop and tile IR index expressions are `Ix` trees (`ix.js:5-110`). The available nodes are constants, variables and
the operators `+ * / % min max < <= == && ||`. Constructors simplify eagerly:

- linear terms are kept in a normal form (`ix.js:35-58`);
- floor division and modulo of affine terms are simplified when the divisor divides the coefficients
  (`ix.js:78-100`).

Helpers:

- `keyOf`, `vars`, `subst`, `evalIx` (floor semantics) and `affine(e, vars)` (`ix.js:121-172`). `affine` returns
  coefficients or `null`, which the cost model uses to derive access strides.
- `print` with precedence (`ix.js:175-187`).
- `emit(e, "c" | "wgsl" | "js")` (`ix.js:190-205`), where WGSL integer literals get an `i` suffix, and `toJs`
  (`ix.js:208-223`).
- `IxMap` (`ix.js:226-241`): a tuple of expressions over coordinates `a0..an-1`, with `compose` and `identity`. Views
  in the tensor dialect carry an `IxMap`.

Only expressions in coordinates exist. There is no load-dependent (gather) index [observed]. Section 10 covers the
consequences.

### 1.16 The script runner (`script.js`)

- `headerOf(text)` (`script.js:6-13`) parses the `/** W-NN Title * group * about * try a | b */` header.
- `runScript(text, scope)` (`script.js:21-39`) checks syntax with `acorn.parse` (so errors have line numbers), then
  runs `new Function(...scopeNames, '"use strict";\n' + text + '//# sourceURL=preset.js')`. Runtime errors map to a
  line through the `preset.js:N` stack frame minus 3 (`lineOf`, `script.js:16-19`). If several `project()` calls
  exist, the last wins with a warning [observed].

There is no sandbox. The script runs with the page's full privileges, including `window`, `fetch` and `localStorage`
[observed: plain `new Function`]. That is acceptable for user-authored scripts, and relevant for the agent
(section 6).

## 2. The standard ML stack (`app/src/std`)

### 2.1 Pipeline and passes

`std.emmy.pipeline({target = rtx5090, store = null, name = "emmy"})` (`emmy.js:18-35`). The output of `describe()`,
captured from the scratch copy:

```text
pipeline emmy
  ir torch        [nn, tensor]
  d  frontend/decomposition   decompose:nn.ew, decompose:nn.linear, decompose:nn.matmul, decompose:nn.rms_norm, ...
  ir tensor       [tensor] strict
  o  frontend/optimization    compose_views, fold_splat_view, drop_identity_view, fold_splat_ew, contract_fma
  l  loop/lowering            lift_elementwise, lift_reduce, lift_indexmap, lift_constant_output
  f  loop/fusion              merge_loop_ops
  s  loop/stamp               stamp_loop_names
  ir loop         [loop, tensor] strict
  t  tile/schedule            schedule
  ir tile         [tile, tensor] strict
  k  lowering/kernel          materialize, drop_redundant_syncs
  ir kernel       [kernel, tensor] strict
  c  lowering/emit            emit_sources
  ir gpu          [gpu, tensor] strict
```

Two naming discrepancies [observed]: `reference.txt:139-140` calls the last passes `kernel/materialize` and
`gpu/emit`, but the code names them `lowering/kernel` (`kernel.js:317`) and `lowering/emit` (`program.js:21-24`).

The default decide chain is `chain(pinned(), evidence(store), costPrior, first())` (`emmy.js:12-17`). The workbench
prepends a per-kernel pin policy (`ui/wb.js:103-108`), giving the order "kernel pins, global pins, evidence on this
device, model, first" (reference.txt:142) [observed].

`tensor` stays allowed at every checkpoint so that constants (`tensor.const`, trait `any-ir`) and weights survive.

### 2.2 The frontend: `nn` (`tensor.js:137-150`)

The ops are `ew`, `linear` (with weight-shape `validate`), `matmul` (batched), `rms_norm`, `layer_norm`, `softmax`,
`gelu`, `silu`, `reduce`, `transpose`, `reshape` and `slice`. The `N` helper namespace (`tensor.js:194-211`) adds
broadcasting arithmetic, unary functions, `sum`, `amax`, `mean`, `select` and comparisons. Methods include
`x.add(y)`, `x.matmul(w)`, `x.softmax()` and `x.t()` (`tensor.js:212-219`).

Every op has reference semantics in plain JS (`ewRef`, `reduceRef`, `viewRef`, `matmulRef`, `rms`, `ln`, `softmax`,
`tensor.js:9-119`). These evaluate the frontend graph for the end-to-end check [observed].

`std.weight(name, shape, {seed, scale, init})` (`tensor.js:165-170`) creates a deterministic constant tensor.

### 2.3 The tensor IR (`tensor.js:152-160`) and decompositions

The tensor IR has four ops:

- `tensor.const`: pure, `any-ir`;
- `tensor.ew{fn}`: `validate` requires identical shapes, so broadcasting must be explicit;
- `tensor.reduce{fn, axis}`;
- `tensor.view{shape, map: IxMap}`.

Broadcasting, transposition, reshape and slicing are all `view`s with an index map (`reshapeMap`, `broadcastMap`,
`tensor.js:120-131`).

`std.decompose(opName, fn)` (`tensor.js:224-237`) builds a rule that stamps `attrs.origin` with the frontend op's
name, so later kernels can be named `k_rms_norm_reduce`. The decompositions (`tensor.js:239-277`) express every `nn`
op in tensor ops. Example: RMSNorm `[64, 256]` becomes 15 tensor nodes (captured):

```text
n2 = mul(x, x)        -> (64, 256) f32
n3 = add(n2, axis=1)  -> (64, 1) f32
n4 = 256              -> f32
n5 = n4[]             -> (64, 1) f32
n6 = div(n3, n5)      -> (64, 1) f32
n7 = 0.000001         -> f32
n8 = n7[]             -> (64, 1) f32
n9 = add(n6, n8)      -> (64, 1) f32
n10 = rsqrt(n9)       -> (64, 1) f32
n11 = n10[a0, 0]      -> (64, 256) f32
n12 = mul(x, n11)     -> (64, 256) f32
n0 = w data(256)      -> (256) f32
n13 = n0[a1]          -> (64, 256) f32
n14 = mul(n12, n13)   -> (64, 256) f32
```

### 2.4 Tensor optimizations (`tensor.js:283-303`, pass `frontend/optimization`, short `o`)

| Rule | Effect |
| --- | --- |
| `compose_views` | Uses `P.chain`: view of a view becomes one view with the composed `IxMap`. |
| `fold_splat_view` | A view of a scalar constant becomes the constant at the new shape. |
| `drop_identity_view` | Removes identity views. |
| `fold_splat_ew` | Folds elementwise ops on splat constants. |
| `contract_fma` | Turns a single-use `mul` feeding `add` into `fma`. Issue-bound kernels then count FFMA as real GPUs do (reference.txt:125-127). |

### 2.5 The Loop IR (`loop.js`)

A `loop.kernel{expr, shape, name, origin}` (`loop.js:269-279`) holds one scalar expression `E` per output element,
over free coordinates `a0..an-1`.

**Expression language** (`loop.js:50-60`):

- `E.num(v)`;
- `E.load(i, idx: Ix[])`, which reads input `i`;
- `E.op(fn, ...args)`, which constant-folds with `Math.fround` and puts commutative args in a canonical order;
- `E.red(fn, r, n, body)`, a reduction over a bound variable.

**Hash-consing:** expressions are interned with an alpha-normalised key `__key` (`loop.js:18-38`). Bound reduction
variables use de Bruijn-style indices, so two kernels that differ only in a bound variable's name share one key
[observed]. `free(expr)` returns the free variables (`loop.js:40-49`). The `identity` of a loop kernel is this key
plus shapes. That identity is the evidence key (`program.js:37`).

**Scheduling (LICM):** `schedule(expr, shape)` (`loop.js:90-153`) places every subexpression at the deepest loop it
depends on. The statement kinds are `for`, `let`, `init`, `acc` and `write`. `printNest` (`loop.js:163-180`) prints
the nest. Captured RMSNorm loop IR, where `v1..v3` are hoisted to the row loop:

```text
n25 = loop.kernel k_rms_norm_reduce(n0, x)  -> (64, 256) f32
    for a0 in 0..64:  # free
        acc0 = 0
        for r0 in 0..256:  # reduce
            in2 = load x[a0, r0]
            v0 = mul(in2, in2)
            acc0 <- add(acc0, v0)
        v1 = div(acc0, 256)
        v2 = add(0.000001, v1)
        v3 = rsqrt(v2)
        for a1 in 0..256:  # free
            in0 = load n0[a1]
            in1 = load x[a0, a1]
            v4 = mul(in1, v3)
            v5 = mul(in0, v4)
            out[a0, a1] = v5
```

**Work model:** `workOf(nest)` (`loop.js:183-196`) counts flops from `std.FNS` weights (`fns.js:4-36`: `add` 1, `div`
4, `exp`/`log`/`tanh` 8, `sigmoid` 10, `fma` 2, and so on). Each load costs `W_MEM = 12`. Statement counts are
multiplied by loop trip counts, so work reflects LICM placement [observed].

**Reference execution:** `compileSerial` and `compilePoint` (`loop.js:201-259`) compile the nest to a JS function.
`runSerial` (`loop.js:260-266`) is `loop.kernel.eval`, which is what makes the Loop IR the reference for every GPU
kernel.

### 2.6 Lifting (`loop.js:285-306`, pass `loop/lowering`, short `l`)

- `lift_elementwise`, `lift_reduce` and `lift_indexmap` turn each `tensor.ew`, `tensor.reduce` and `tensor.view` into
  its own one-op `loop.kernel`.
- `lift_constant_output` handles constant outputs.

After lifting, every tensor op is its own kernel. Fusion then merges them.

### 2.7 Fusion and the blowup guard (pass `loop/fusion`, short `f`, order `reverse`)

```js
// loop.js:335-345
export const mergeLoopOps = k.rule("merge_loop_ops")
  .match(P.op("loop.kernel").as("p").where(({ p, graph }) => !graph.isOutput(p.id) && p.users.length > 0 && p.users.every((u) => u.is("loop.kernel"))))
  .mutate(({ p, tx }) => { for (const u of p.users) { const r = inlineInto(u, p); tx.set(u, { args: r.args, attrs: { expr: r.expr, origin: r.origin } }); } })
  .guard(({ before, after, root }) => {
    const users = before.users(root);
    const was = kernelWork(before.value(root)) + users.reduce((a, u) => a + kernelWork(before.value(u)), 0);
    const now = users.reduce((a, u) => a + (after.nodes.has(u) ? kernelWork(after.value(u)) : 0), 0);
    return now <= was * 1.02 || `blowup: fused work ${Math.round(now).toLocaleString()} > unfused ${Math.round(was).toLocaleString()}`;
  })
```

**Fusion legality** [observed]: the producer is a `loop.kernel`, is not a graph output, has at least one user, and
*all* of its users are `loop.kernel`s. Fusion is all-or-nothing per producer: the producer is inlined into every consumer, or not at all. `inlineInto`
(`loop.js:310-333`) substitutes the producer's expression for each `E.load` of it, composing index maps. Because
`order("reverse")` scans consumers first, chains collapse from the outputs backwards ("maximal fusion, consumers
first").

**The blowup check:** the guard compares total work before (producer plus users) against after (re-scheduled users).
It accepts up to 2% growth (`* 1.02`). Otherwise it vetoes the rewrite, which becomes a visible skip step with
`reject = true`. Recomputation is therefore allowed only when LICM hoists the duplicated producer work out of the
inner loops.

Observed declines:

- `stack1.mjs`, MLP: `merge_loop_ops: blowup: fused work 914,944 > unfused 168,448`.
- Preset W-09 at defaults, 13 declined steps in total, for example:
  `#30 loop/fusion/merge_loop_ops @n49: blowup: fused work 10,472,128,512 > unfused 7,001,866,240`. This is the
  "10.5 G > 7.0 G" figure the preset notes cite. W-09 ends with two kernels: `k_linear_gelu_reduce`
  `[MAP=tiled, BM=128, BN=32, BK=8, TM=2, TN=2]` and `k_linear_reduce` `[MAP=tiled, BM=64, BN=32, BK=8, TM=2, TN=2]`.

`stamp_loop_names` (`loop.js:348-359`, short `s`) names kernels `k_<origins>[_reduce]`, or `k_<output>`.

### 2.8 Tile IR: schedules, legality and the fork (`tile.js`)

**Knobs** (`tile.js:15-25`):

| Knob | Values | Default and notes |
| --- | --- | --- |
| `MAP` | `thread`, `row`, `tiled` | Which materialiser |
| `TPB` | 32..1024 | Threads per block (thread and row maps), default 256 |
| `COARSEN` | 1, 2, 4 | Outputs per thread (thread map) |
| `STAGE` | `none`, `reused`, `all` | Stage row inputs in shared memory (row map); `reused` means inputs loaded at least twice |
| `BM`, `BN` | 16..128 | Output tile per block (tiled map) |
| `BK` | 8, 16, 32 | K-slice staged in shared memory (tiled map) |
| `TM`, `TN` | 1..8 | Register tile per thread (tiled map) |

`canonRow(knobs)` (`tile.js:25`) drops the knobs that are irrelevant to the chosen map. That produces the "row"
string shown everywhere, such as `MAP=row,TPB=1024,STAGE=all`.

**Analysis:** `analyze(expr, shape, inShapes)` (`tile.js:31-97`) computes:

- the row depth `rd`, `rows`, `inner` and the row reductions;
- which inputs are stageable (with load counts);
- a contraction descriptor `{C, A, B, mVar, nVar, M, N, K, batch}` when the expression is a sum of products indexed
  like a matmul.

`legalMaps` (`tile.js:99-104`) offers `thread` always, `row` when there is a row reduction, and `tiled` when a
contraction exists [observed].

**Fork tree and legality:** `forkTree` (`tile.js:105-128`) builds a `k.fork.tree()` whose level functions prune
illegal values early. The constraints are:

- `TPB <= maxThreadsPerBlock`;
- shared memory under `smemPerBlock`;
- tiles divide the problem;
- tiled threads per block between 32 and `maxThreadsPerBlock`.

**Launch geometry** (`tile.js:131-142`):

| Map | grid | block | smem |
| --- | --- | --- | --- |
| row | `rows` | `TPB` | `(staged lengths + TPB if row reductions) * 4` bytes |
| tiled | `batches * ceil(M/BM) * ceil(N/BN)` | `(BM/TM) * (BN/TN)` | `(|A| * BM + |B| * BN) * BK * 4` bytes |
| thread | `ceil(numel / (TPB * COARSEN))` | `TPB` | 0 |

**The rule:** `scheduleRule` (`tile.js:350-354`) returns `forkTree(...).leaf(kn => n.lower(tile.kernel, {map: kn,
inShapes}))`.

**The cost prior:** `costPrior = decide.cost(o => estimate(analysis, o.knobs, target).us, {name: "model"})
.for("schedule")` (`tile.js:357-361`). This is why decisions show `by: "model"`. The pass is `tile/schedule`
(short `t`) and declares `KNOBS` (`tile.js:363`).

Observed option counts (`stack2.mjs`, small shapes):

| Program | Options | Choice | Estimate | Worst option |
| --- | --- | --- | --- | --- |
| rmsnorm | 33 | `MAP=row,TPB=1024,STAGE=all` | 4.1 µs | 269.3 µs |
| softmax | 27 | `MAP=row,TPB=1024` | | |
| linear | 645 | `MAP=tiled,BM=32,BN=32,BK=8,TM=2,TN=2` | 185.4 µs | 15322.1 µs (thread map) |
| gelu | 15 | `TPB=128,COARSEN=4` | | |

### 2.9 Kernel IR (`kernel.js`)

The kernel builder `KB` (`kernel.js:18-36`) is a small imperative IR with these statements: `let`, `int`, `load`,
`store`, `shared`, `sload`, `sstore`, `sync` (adjacent syncs are deduplicated), `note`, `for` and `if` (with constant
folding). `materialize(node)` (`kernel.js:244-257`) returns
`K = {name, grid, block, smem, smemBytes, body, floats, ints, params, map, row}`.

There are three materialisers:

- **`matThread`** (`kernel.js:79-96`): one output per thread, `COARSEN` outputs per thread. The flat index is decoded
  into coordinates (`decode`, `kernel.js:39-44`).
- **`matRow`** (`kernel.js:114-167`): one block per row. Strided loops `for q = tid; q < n; q += TPB` cover the row.
  Optional staging copies a row input into shared memory once. Each row reduction is a per-thread partial
  accumulation followed by `treeCombine` (`kernel.js:99-113`): a shared `s_red[TPB]` array halved with
  `if (tid < s)` steps and a `__syncthreads()` after every step. There are no warp shuffles [observed].
- **`matTiled`** (`kernel.js:170-241`): classic shared-memory tiling with `TM x TN` register accumulators `acc_i_j`,
  cooperatively loaded `sA[BM][BK]` and `sB[BK][BN]` tiles, a `k0` loop (step `BK`) around a `kk` loop, and an
  epilogue that applies the rest of the expression (bias, activation) before the store.

`drop_redundant_syncs` (`kernel.js:302-315`) removes barriers that protect nothing. The pass is `lowering/kernel`
(short `k`, `kernel.js:317`).

The captured kernel IR for RMSNorm (pins `MAP=row, TPB=64, STAGE=none`) starts with the header
`grid=64 block=64 smem=256 B  [MAP=row,TPB=64]` and `Smem s_red[64] (float)`. Its statements map one to one onto
the CUDA in section 3.1: `Sync` is `__syncthreads()`, `load x[256 * bid + r3]` is `src1[((256 * bid) + r3)]`, and
the tree reduction is six `if tid < s` steps.

### 2.10 The `gpu` IR and the emit pass (`program.js:11-24`)

`emit_sources` lowers each `kernel.kernel` to a `gpu.kernel` carrying the `K` object plus its CUDA and WGSL strings.
The pass is `lowering/emit` (short `c`).

### 2.11 End-to-end lowering, as pseudocode

```text
compile(project, device):
  g = trace(project.program, shapes from build-phase params)          # IR "torch": nn ops + weights
  run = pipeline.with({target: device.spec, decide: kernelPins + defaultDecide}).run(g, {params, ctx:{deviceId, store}})
    d: every nn op  -> tensor.ew / tensor.reduce / tensor.view (+ origin attr)
       [strict: only tensor ops remain, else LoweringError]
    o: compose/fold views, fold splats, contract mul+add -> fma
    l: every tensor op -> its own loop.kernel{expr}
    f: inline producers into consumers (reverse topo) unless work grows > 2%
    s: name kernels
       [strict: only loop.kernel + constants remain]
    t: per loop.kernel: fork tree over legal (MAP, TPB, COARSEN, STAGE, BM..TN); decide chain picks one
       [strict: tile.kernel]
    k: materialize thread/row/tiled kernel IR; drop redundant syncs
    c: attach CUDA + WGSL
       [strict: gpu.kernel]
  prog = programOf(run.graph)        # [{name, K, cuda, wgsl, identity, row, bytes, ...}]
  e2e  = evaluate frontend graph vs last evaluable IR (loop) on seeded inputs, unless work > 6e7
```

RMSNorm IR sizes along `irOrder`: torch 3, tensor 15, loop 3, tile 3, kernel 3, gpu 3 [observed]. The three nodes at
the later levels are input `x`, weight `w` and the one fused kernel.

## 3. Code generation: `emit.js`, `program.js`, `targets.js`

### 3.1 CUDA (`toCuda`, `emit.js:14-45`)

The generator emits an `extern "C" __global__ void __launch_bounds__(block)` function with
`const float* __restrict__ src0..srcN` inputs and a `float* __restrict__ dst` output, static `__shared__` arrays,
every float register declared and zero-initialised up front, `__syncthreads()` for `sync`, and functions such as
`rsqrtf` from the `std.FNS` C templates [observed].

Captured output, with four identical reduction steps elided:

```cuda
extern "C" __global__ void __launch_bounds__(64) k_rms_norm_reduce(const float* __restrict__ src0, const float* __restrict__ src1, float* __restrict__ dst) {
    const int tid = threadIdx.x;
    const int bid = blockIdx.x;
    __shared__ float s_red[64];
    float acc0 = 0.0f, in2 = 0.0f, v0 = 0.0f, sv0 = 0.0f, sv1 = 0.0f, sv2 = 0.0f, sv3 = 0.0f, sv4 = 0.0f, sv5 = 0.0f, sv6 = 0.0f, sv7 = 0.0f, sv8 = 0.0f, sv9 = 0.0f, sv10 = 0.0f, sv11 = 0.0f, v1 = 0.0f, v2 = 0.0f, v3 = 0.0f, in0 = 0.0f, in1 = 0.0f, v4 = 0.0f, v5 = 0.0f;
    acc0 = 0.0f;
    for (int r3 = tid; r3 < 256; r3 += 64) {
        in2 = src1[((256 * bid) + r3)];
        v0 = (in2 * in2);
        acc0 = (acc0 + v0);
    }
    __syncthreads();
    s_red[tid] = acc0;
    __syncthreads();
    if ((tid < 32)) {
        sv0 = s_red[tid];
        sv1 = s_red[(tid + 32)];
        s_red[tid] = (sv0 + sv1);
    }
    __syncthreads();
    // ... the same step for tid < 16, 8, 4 and 2 (registers sv2..sv9), each followed by __syncthreads() ...
    if ((tid < 1)) {
        sv10 = s_red[tid];
        sv11 = s_red[(tid + 1)];
        s_red[tid] = (sv10 + sv11);
    }
    __syncthreads();
    acc0 = s_red[0];
    v1 = (acc0 / 256.0f);
    v2 = (0.000001f + v1);
    v3 = rsqrtf(v2);
    for (int q = tid; q < 256; q += 64) {
        in0 = src0[q];
        in1 = src1[((256 * bid) + q)];
        v4 = (in1 * v3);
        v5 = (in0 * v4);
        dst[((256 * bid) + q)] = v5;
    }
}
```

Argument order follows `node.args` (`n0` = weight, then `x`), not the frontend signature [observed]. The runner and
bundle use the same order, so this is consistent. It is worth knowing when reading the source by hand.

### 3.2 WGSL (`toWgsl`, `emit.js:49-86`)

The generator emits one storage binding per input (`b0..`) plus `bout`, `var<workgroup>` arrays for shared memory,
`@workgroup_size(block)`, a grid folded to 2D past 65535 workgroups (`let bid = i32(wid.x) + i32(wid.y) * i32(nwg.x);
if (bid >= GRIDi) { return; }`), every register as a `var v_*: f32`, loop counters prefixed `n_`, and
`workgroupBarrier()` and `inverseSqrt` for `sync` and `rsqrt` [observed].

Captured head and tail:

```wgsl
@group(0) @binding(0) var<storage, read> b0: array<f32>;
@group(0) @binding(1) var<storage, read> b1: array<f32>;
@group(0) @binding(2) var<storage, read_write> bout: array<f32>;
var<workgroup> s_red: array<f32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {
    let tid: i32 = i32(lid);
    let bid: i32 = i32(wid.x) + i32(wid.y) * i32(nwg.x);
    if (bid >= 64i) { return; }
    var v_acc0: f32 = 0.0;
    ...
    v_v3 = inverseSqrt(v_v2);
    for (var n_q: i32 = tid; n_q < 256i; n_q = n_q + 64i) {
        v_in0 = b0[n_q];
        v_in1 = b1[((256i * bid) + n_q)];
        v_v4 = (v_in1 * v_v3);
        v_v5 = (v_in0 * v_v4);
        bout[((256i * bid) + n_q)] = v_v5;
    }
}
```

There is an early `return` before barriers. Every thread of a workgroup shares `bid`, so the return is
workgroup-uniform and does not create a divergent barrier [inferred].

### 3.3 The simulator generator (`toSim`, `emit.js:92-201`)

`toSim(K)` emits **JavaScript** that runs one block in lockstep:

- every kernel statement becomes a function `S0, S1, ...` applied to all threads of the block;
- `if` statements maintain active masks `M0, M1, ...`;
- loops with uniform bounds run once for the whole block, while per-thread bounds run masked;
- every memory access is reported to `SimMetrics`.

This executes the same Kernel IR that CUDA and WGSL are printed from, so a materialiser bug shows up in simulation as
a wrong value or an out-of-bounds access [observed].

`SimMetrics` (`emit.js:204-251`) counts:

- **Global memory:** for each warp-level request, the number of distinct 32-byte sectors touched
  (`emit.js:213-228`). Four sectors per request is a fully coalesced fp32 warp access.
- **Shared memory:** per warp request, the maximum number of distinct addresses mapping to one bank, with
  `bank = addr % 32` (`emit.js:230-247`). That is the number of wavefronts.
- **Divergence** (`emit.js:248`): branch warps against divergent warps.
- **Barriers** (`emit.js:249`): count, and detection of a barrier executed under a partial mask (`badSyncs`).
- **Out-of-bounds** (`emit.js:250`): any access outside the buffer.

### 3.4 The program view (`programOf`, `program.js:28-42`)

```js
identity: hash(`loop|${a.expr.__key}|${a.shape.join("x")}|${a.inShapes.map((s) => s.join("x")).join(",")}`),
bytes: (numel(a.shape) + a.inShapes.reduce((s, x) => s + numel(x), 0)) * 4,
```

The identity is a function of the Loop IR expression and the shapes only [observed]. The schedule is a separate
`row` string. Evidence is therefore keyed `(device, identity) -> rows by knobs`. Codegen changes, materialiser fixes
and target-spec changes do not change the identity (weakness W-3).

### 3.5 Device specs (`targets.js:5-13`)

| id | arch | SMs | clock (GHz) | FP32 peak (TFLOP/s) | DRAM BW (GB/s) | L2 (MB) | smem/SM | max threads/SM | max blocks/SM | launch (µs) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rtx5090 | sm_120 | 170 | 2.41 | 104.8 | 1792 | 96 | 128 KiB | 1536 | 24 | 2.5 |
| rtx4090 | sm_89 | 128 | 2.52 | 82.6 | 1008 | 72 | 100 KiB | 1536 | 24 | 2.5 |
| h100 | sm_90 | 132 | 1.98 | 67 | 3350 | 50 | 228 KiB | 2048 | 32 | 2.5 |
| a100 | sm_80 | 108 | 1.41 | 19.5 | 2039 | 40 | 164 KiB | 2048 | 32 | 2.5 |
| orin | sm_87 | 8 | 0.625 | 1.28 | 68 | 2 | 164 KiB | 1536 | 16 | 5 |

All five specs share 65,536 registers per SM, 48 KiB shared memory per block and 1024 max threads per block. The
48 KiB cap is deliberate: the generated CUDA declares shared memory statically, and a static `__shared__` array over
48 KiB does not compile (comment at `targets.js:1-4`). The spec comment also calls the numbers "approximate public
figures (boost clocks, FP32 non-tensor-core peak)" that "set the scale, not exact microseconds".
`WEBGPU_DEFAULT` (`targets.js:13`) is a deliberately conservative placeholder: 16 SMs, 1.5 GHz, 10 TFLOP/s, 300 GB/s,
4 MB L2, 32 KiB shared memory per SM, 16 KiB per block, 256 max threads per block, 1024 per SM, 8 blocks per SM and a
15 µs launch [observed].

## 4. Simulator, cost model, tuning and evidence

### 4.1 The time model (`timeModel`, `tile.js:152-194`)

Both the analytic cost model and the simulator feed counts into this one function. The inputs are:

- `c = {flops, traffic, dram, smemWavefronts, warpInstr, threads (T), blocks (G), smem, regs}`;
- a target `t`.

**Occupancy:**

```text
wpb   = ceil(T / 32)                       warps per block
maxW  = maxThreadsPerSM / 32
lim.blocks  = maxBlocksPerSM
lim.threads = floor(maxThreadsPerSM / (wpb * 32))
lim.smem    = smem > 0 ? floor(smemPerSM / smem) : inf
lim.regs    = floor(regsPerSM / (min(255, regs) * wpb * 32))
bps   = min(lim.*)      limiter = argmin           (infeasible if T > maxTPB, smem > smemPerBlock, bps < 1)
occ   = bps * wpb / maxW                   theoretical occupancy
```

**Raw resource times** for the whole grid at full efficiency, in µs:

```text
dram    = dram_bytes / (bwGBs * 1e3)
l2      = traffic_bytes / (3 * bwGBs * 1e3)            L2 bandwidth assumed 3x DRAM
compute = flops / (peakTflops * 1e6)
smem    = smemWavefronts / (sms * clockGHz * 1e3)      1 wavefront / SM / cycle
issue   = warpInstr / (sms * 4 * clockGHz * 1e3)       4 warp schedulers / SM
```

**Latency hiding** as a function of occupancy `o`:

- memory efficiency `memEff(o) = min(1, 0.2 + 1.6 * o)`;
- compute efficiency `compEff(o) = min(1, 0.25 + 1.5 * o)`.

**Waves:**

```text
slots = sms * bps;  waves = ceil(G / slots)
wave(b blocks):  s = min(sms, b); k = ceil(b / s); o = min(occ, k * wpb / maxW)
                 per resource r: v_r = raw_r * (sms / G) * k / eff_r(o)
                 wave_time = max_r v_r          (perfect overlap: a roofline per wave)
core = (waves-1) * wave(slots) + wave(G - (waves-1)*slots)
us   = launchUs + core
bound = us < 1.5 * launchUs ? "launch" : argmax_r (sum over waves of v_r)
```

It also returns `occupancy`, `achievedOccupancy`, `blocksPerSM`, `limiter`, `waves`, `util` (SM use), `gflops` and
`gbs`.

**Register estimate:** `regsEstimate` (`tile.js:150`) is a heuristic:

- tiled map: `24 + TM*TN + TM + TN`;
- otherwise: `20 + min(40, ceil(values/2))`.

**Model limits** [observed]: there is no latency term, no tensor cores, no L1 model, no instruction mix beyond the
issue count, and fp32 only. Each wave takes the maximum over resources rather than a sum or partial overlap.

### 4.2 The analytic estimate (`estimate`, `tile.js:201-281`)

`estimate(analysis, knobs, target)` derives counts without running anything:

- **Flops** come from `workOf`.
- **Global traffic** comes from `sectorsFor(stride)`, which is 1 for broadcast, otherwise `min(32, 4 * |stride|)`
  sectors per warp access. The stride is the affine coefficient of the thread-varying coordinate (`coefOf` via
  `ix.affine`; 8 if not affine) (`tile.js:197-198`).
- **Shared-memory wavefronts** use a bank-conflict function over thread-to-address maps (`tile.js:256`).
- **Warp instructions** are also counted.

DRAM is a heuristic over traffic:

```js
// tile.js:277
const dram = Math.min(traffic, Math.max(uniq + outBytes, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
```

That is: at least the unique bytes, otherwise 12% of traffic when the working set fits in L2, or 60% when it does
not. The result goes through `timeModel` (`tile.js:279-280`).

### 4.3 The simulator driver (`simulateKernel`, `program.js:92-120`)

1. **Choose sampled blocks.** Work per block is `workOf(schedule(expr, shape)) / grid`. The block count is
   `max(per > 2.5e7 ? 1 : 2, min(12, ceil(4096 / block), floor(6e6 / per)))`, so simulated work stays near 6M ops
   [observed].
2. **Make inputs** with `kernelInputs` (`program.js:45-53`): mulberry32 uniform in [-1, 1), seeded per input.
   The output is filled with `NaN`.
3. **Run** `toSim(K)` over the sampled blocks while collecting `SimMetrics`.
4. **Check** up to 512 covered output indices against `referenceAt` (`program.js:55-58`), which evaluates the Loop
   IR expression at those points. `checkValues` (`program.js:67-76`) uses `rtol 2e-3, atol 2e-4` and skips `NaN`
   references. An out-of-bounds access or a divergent barrier forces `check.ok = false`.
5. **Scale counts to the full grid** in `metricsOf` (`program.js:122-137`), with `scale = grid / sampledBlocks`:

```js
// program.js:124-128
const traffic = (M.ldSect + M.stSect) * 32 * scale;
const uniq = kern.bytes;
const dram = Math.min(traffic, Math.max(uniq, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
const counts = { flops: M.flops * scale, traffic, dram, smemWavefronts: M.shWave * scale, warpInstr: M.warpInstr * scale, ... };
const tm = timeModel(counts, t);
```

The derived metrics are `ldSectorsPerReq`, `stSectorsPerReq`, `ldEfficiency = min(1, 4 / sectorsPerReq)`,
`bankConflicts = (wavefronts - requests) / requests`, `divergence`, `syncs`, `intensity` and `kind: "simulated"`.

**What is and is not simulated** [observed]:

- Simulated: values, sector counts, bank wavefronts, divergence and barrier checks.
- Not simulated: time. Time comes from the *same* `timeModel` as the cost model. DRAM bytes come from the same
  12%/60% L2 heuristic, applied to counted rather than analytic traffic.
- Model and "measurement" therefore disagree only where the analytic counts differ from the counted ones. W-25's
  notes acknowledge this.

### 4.4 Devices (`devices.js`)

| Class | id | How it times | Check |
| --- | --- | --- | --- |
| `SimDevice` (`devices.js:11-19`) | `sim:<gpu>` | `simulateKernel`; `kind: "simulated"` | Sampled outputs against Loop IR |
| `WebGpuDevice` (`devices.js:21-117`) | `webgpu` | 3 warmups + 20 reps; GPU timestamp queries if the adapter grants `timestamp-query`, else wall clock around submit; median; `kind: "timestamp"` or `"wall clock"` | 384 sampled outputs |
| `CudaDevice` (`devices.js:120-147`) | `cuda` | `POST /api/run` to the runner; `kind: "CUDA events"` | Runner returns samples; checked in page |

- **CUDA probe:** `CudaDevice.probe` calls `GET /api/device` and maps the compute capability to a spec.
- **Bundle export** (`devices.js:150-158`), for when the page is not served by the runner. Format `kiln-bundle/1` with
  `reps: 50`, `warmup: 5`, `ncu` and
  `kernels: [{name, identity, row, source, grid, block, smem, inputs: [{size, seed}], out, samples}]`.
- **Results import:** `ingest` (`devices.js:159-171`) reads `kiln-results/1`, sets `us = us_median`, spreads ncu
  metrics into `metrics`, and sets `kind: "CUDA events"`.

### 4.5 The evidence store (`store.js`)

```ts
// store.js
type Row = { device: string; identity: string; name: string; knobs: Knobs; row: string;
             us: number; ok: boolean; by: "measure" | "tune" | string; t: number; metrics?: object };
class Store {
  rows: Map<`${device}|${identity}`, Row[]>                 // store.js:7
  put(row)      // keep ONE row per canonical knobs; replace only if faster, or the old one failed (store.js:8-17)
  record({device, kern, result, by})                        // store.js:18-21
  lookup(fp, run) -> rows for (run.ctx.deviceId, fp.key)     // store.js:22-26
  best(device, identity); list({device}); clear({device})
  toJSON() -> { format: "kiln-evidence/1", rows }            // store.js:37
  import(json)                                               // store.js:38
}
```

The workbench persists the store to `localStorage` under the prefix `kiln-wb:` with a 400 ms debounce
(`ui/wb.js:17-19, 32-33`) [observed].

Observed round trip (W-05 at defaults, 1024 x 4096, `sim:rtx5090`):

1. **Before measuring:** decision `by: "model"`, choice `MAP=row,TPB=1024,STAGE=all`.
2. **`measure()`:** 24.27 µs.
   - `bound: dram`, `occupancy 0.667`, `limiter threads`, `waves 7`, `blocksPerSM 1`.
   - `ldSectorsPerReq 4`, `bankConflicts 0`, `sampledBlocks 4`, `kind: simulated`.
   - parts: dram 21.77, l2 10.88, compute 0.29, smem 2.36, issue 1.33.
3. **After recompile:** decision `by: "evidence"`. The store holds one row:
   `{device: "sim:rtx5090", identity, name, knobs, row: "MAP=row,TPB=1024,STAGE=all", us, ok: true, by: "measure", t}`.

The W-05 notes quote the model's 21.2 µs against the simulator's 24.3 µs for the same schedule.

### 4.6 Measuring from the workbench (`ui/wb.js`)

- **`compile()`** (`wb.js:125-154`) runs the pipeline with `ctx = {deviceId, store}` and the pipeline from
  `pipelineFor` (`wb.js:103-108`), which prepends kernel pins (identity to row) to the decide chain. It then runs the
  end-to-end check.
- **`checkEndToEnd`** (`wb.js:156-185`) skips when the estimated work exceeds 6e7. Otherwise it compares outputs of
  the first evaluable level among `loop`, `gpu`, ... against the frontend graph, with `rtol 1e-3, atol 1e-4`
  (reference.txt:21-24) [observed].
- **`measure()`** (`wb.js:205-228`) calls `measureProgram` for the current device, records evidence, then recompiles,
  so the decision flips to `by: "evidence"`.
- **`tune()`** (`wb.js:230-248`) supports `spmcts`, `sweep` and `sweep-all` (a sweep with `perKernel = Infinity`).
- Two smaller helpers: **`setParam`** distinguishes `phase: "run"` (`wb.js:190`) and **`pinKernel`** pins one
  kernel's schedule by identity (`wb.js:191`). The exact UI consequences of the run phase are in the UI document
  [not re-verified here].

### 4.7 Tuning (`tune.js`)

`measureProgram(prog, device, {store, memo, by})` (`tune.js:24-39`):

- measures each kernel once per `identity|row` (memoised) and records it in the store;
- `total` is the sum of kernel µs, or `Infinity` if any kernel errors or fails its check.

`tune({pipeline, graph, params, device, store, strategy, budget = 32, patience = 24, c = sqrt(2), perKernel = 6})`
(`tune.js:41-107`):

```text
ctx = { deviceId }           # note: no store -> evidence policy is inert during search (tune.js:45)
rollout = pipeline._decide   # default chain
compile(decide) = pipeline.with({target: device.target}).run(graph, {params, decide, ctx})

sweep:
  base = compile(chain(pinned, costPrior, first)); evaluate(base)
  for each decision d (fork index fi):
    for o in top-perKernel options of d by model score (finite only):
      decide = "at fork #fi choose o; elsewhere use rollout"
      evaluate(compile(decide))           # stops at budget

SP-MCTS (single-player MCTS):
  root = {visits 0, best 0, kids null}
  while programs < budget and sinceBest < patience and !root.done:
    descend from root: among live children pick argmax
        UCB(ch) = ch.visits == 0 ? inf : ch.best / globalBest + c * sqrt(ln(n.visits + 1) / ch.visits)
    run = compile(replay(path, rollout))   # path choices first, rollout ranks the rest
    if this node's fork depth exists: expand kids = size of the next fork; else mark terminal
    reward = 1 / total_us (0 if failed)
    for x in chain: x.visits++, x.best = max(x.best, reward)       # max-Q backup
    globalBest / sinceBest bookkeeping; mark fully explored subtrees done
```

The search tree's depth is the sequence of forks in compile order (`replay` records each fork as it is decided). A
change of path can change the forks that appear later. The tree handles this by expanding children only from what the
compile produced [observed].

Observed in `tune.mjs` (SwiGLU-like MLP, `sim:rtx4090`):

| Method | Result | Cost |
| --- | --- | --- |
| Greedy (model) | 10.6 µs | |
| Sweep | 10.6 µs | 13 programs, 588 ms |
| SP-MCTS | 10.6 µs | 16 programs, 592 ms |
| Greedy with evidence | both forks `by evidence`, 10.6 µs | store rows 27 |

The model's pick was already optimal under the simulator, as expected when "measurement" uses the same time model.

## 5. The project DSL (`program.js`-style scripts and `script.js`)

### 5.1 Structure

A project script is plain JS run with these names in scope (`std/index.js:60-63`, reference.txt:1-3):
`k, P, std, N, T, nn, tensor, Tensor, ix, E, KB, kx, project, param`.

Builder lambdas run when the script runs. Rule and pass lambdas run during compilation. The last `project(...)` call
defines the project.

`Project` (`std/index.js:30-59`) has `.program(fn, inputs)` (where `inputs` may be a function of params, for sliders
that change shapes), `.pipeline(p)` (default `std.emmy.pipeline()`), `.params(...)`, `.data({...})`,
`.check(name, fn)`, `.pins({...})`, `.device(id)`, `.about(text)` and `.note(text)`.

`inputsFor` produces seeded uniform tensors, using seed `11 + name.length` (`std/index.js:30-59`) [observed].

### 5.2 A full small preset: W-05 RMSNorm (`presets/W-05-rmsnorm.js`, 17 lines, verbatim)

```js
/** W-05 RMSNorm, fused
 *  group  ML compiler
 *  about  one PyTorch-style op through six IRs into one row-mapped CUDA kernel, as in the CloudRift post
 *  try    Why is this one kernel and not four? | Pin TPB=128 for the kernel and measure the difference
 */
// RMSNorm(x) = x / sqrt(mean(x²) + eps) * w. The frontend op decomposes into a reduction, a divide, an
// rsqrt and two multiplies (tensor IR); lifting and fusion turn them into ONE loop kernel (loop IR); the
// tile pass picks a GPU mapping from a fork of schedules (row-per-block here); the kernel pass makes it
// cooperative (staged rows in shared memory, a tree reduction); emit prints CUDA and WGSL.
const rows = param.int("rows", { min: 16, max: 4096, default: 1024, scale: "log", help: "batch × sequence" });
const dim = param.int("dim", { min: 64, max: 8192, default: 4096, scale: "log", help: "hidden size" });

project("rmsnorm")
  .params(rows, dim)
  .program(({ x }, { param }) => ({ y: N.rms_norm(x, std.weight("w", [param(dim)]), { eps: 1e-6 }) }),
           ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .about("y = x · rsqrt(mean(x²) + ε) · w");
```

Note what is *absent*: no pipeline, no rules, no decide policy. The standard pipeline and the default decide chain
do all the work. The header's `try` items become agent suggestions.

### 5.3 A W-01 excerpt: a dialect from scratch (`presets/W-01-hello-dialect.js:9-43`)

```js
const Arith = k.dialect("arith")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("sub", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a - b, print: "{a} - {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .lifts((v) => Arith.const({ value: v }))        // bare numbers in traced code become consts
  .methods({ add: (a, b) => Arith.add(a, b), sub: (a, b) => Arith.sub(a, b), mul: (a, b) => Arith.mul(a, b) });

const constRight = k.rule("const_right")              // 1. a pattern with a predicate
  .match(P.trait("commutative").as("n").where(({ n }) => n.arg(0).isConst() && !n.arg(1).isConst()))
  .rewrite(({ n }) => n.with({ args: [n.arg(1), n.arg(0)] }));
const fold = k.rule("fold")                            // 2. any pure op whose args are all constants
  .match(P.trait("pure").as("n").where(({ n }) => n.args.length > 0 && n.args.every((a) => a.isConst())))
  .rewrite(({ n }) => Arith.const({ value: n.fold() }));
const mulOne = k.rule("mul_one").from(({ x }) => x.mul(1)).to(({ x }) => x);     // 3. by example
const addZero = k.rule("add_zero").from(({ x }) => x.add(0)).to(({ x }) => x);
const mulZero = k.rule("mul_zero").from(({ x }) => x.mul(0)).to(() => Arith.const({ value: 0 }));
const twice = k.rule("x*2 → x+x").from(({ x }) => x.mul(2)).to(({ x }) => x.add(x));

const simplify = k.pass("simplify").short("s").rules(constRight, fold, mulOne, addZero, mulZero, twice)
  .describe("canonicalize constants to the right, fold, and apply algebraic identities");
const pipe = k.pipeline("calc")
  .ir("arith", { dialects: [Arith] })
  .pass(simplify)
  .ir("simple", { dialects: [Arith], strict: true })
  .build();

project("calc")
  .pipeline(pipe)
  .program(({ x, y }) => ({ out: x.mul(Arith.add(3, -2)).add(0).add(y.mul(2)).add(Arith.mul(0, y)) }), { x: k.scalar(), y: k.scalar() })
  .data({ x: 3, y: 4 })
  .check("folds to x + (y + y): two inputs, two adds", ({ run }) => run.graph.size === 4 || `expected 4 nodes, got ${run.graph.size}`)
  .check("same value as the source", ({ outputs }) => outputs.out === 11 || `got ${outputs.out}`);
```

The checks pass (`presets.mjs`: `W-01 ... e2e pass@simple`) [observed]. The 4-node result is two inputs plus
`y + y` and `x + (y + y)`.

### 5.4 API reference table

Condensed from `reference.txt` and the cited source.

| Area | API | Source |
| --- | --- | --- |
| Project | `project(name).program(fn, inputs).pipeline(p).params(...).data({}).check(name, fn).pins({}).device(id).about(t).note(t)` | `std/index.js:30-59` |
| Dialect | `k.dialect(n).op(short, {args, attrs, traits, infer, eval, print, body, validate, identity}).lifts(fn).methods({}).describe(t)` | `kiln.js:45-100` |
| Types | `k.tensor(shape, dtype?)`, `k.scalar()`, any `{kind}` | `kiln.js:9-13` |
| Graphs | `k.trace(name, fn, inputs)`, `k.graph(name, b => ...)`, `g.topo/users/value/find/findAll/findBefore/print/eval/key/summary/clone/dce` | `kiln.js:113-192, 352-384` |
| Values | `v.arg(i), is(op), has(trait), isConst(v?), fold(), with({...}), lower(Op, attrs?), users, otherArg(v)` | `kiln.js:307-349` |
| Patterns | `P.op, P.oneOf, P.trait, P.const, P.any, P.var, P.chain`; `.as .where .args .attrs .oneUse` | `kiln.js:392-458` |
| Rules | `k.rule(n).match(p).rewrite(fn) / .mutate(fn) .when .guard .requires .describe`; `.from(fn).to(fn)`; `skip(reason)` | `kiln.js:603-651` |
| Passes | `k.pass(n).short(c).rules(...).mode().order().limit().knobs().whole(fn).check(fn).helpers().describe()` | `kiln.js:655-669` |
| Pipelines | `k.pipeline(n).ir(name, {dialects, strict}).pass(p).params().decide().target().use().build()`; `with, insertAfter, insertBefore, replace, without, withIr, insertRule, replaceRule, removeRule` | `kiln.js:673-730` |
| Run | `ok, error, graph, at(ir), irOrder, steps, decisions, passStats, warnings, events, params, diff(i), stepGraph(i)` | `kiln.js:742-1074` |
| Params | `param.int/float/enum/bool/text(name, {...})`, `.phase("build" or "run")`, `.group()`, `.help()` | `kiln.js:461-491` |
| Forks | `k.fork([...]).keepOriginal(p)`, `k.fork.over(P, vals?, fn)`, `k.fork.toggle(P, fn)`, `k.fork.tree().level().leaf()` | `kiln.js:513-536` |
| Decide | `k.decide.first/pinned/random/cost(fn).for(r)/chain/exactly/evidence(store, {always})/strict` | `kiln.js:560-599` |
| Strategy | `k.strategy(n).state(init).on(ev, fn).expose(fn)`; `pipeline.use(s)`; `run.strategy(n)` | `kiln.js:733-739` |
| Knob utils | `k.knobs.canonical({}) -> "A=1,B=2"`, `k.knobs.parse(str)` | `kiln.js:510-511, 1128-1132` |
| Frontend | `N.add ... N.matmul, N.linear, N.rms_norm, N.layer_norm, N.softmax, N.gelu, N.silu, N.transpose, N.reshape, N.slice, N.ew`; `std.weight` | `tensor.js:137-219` |
| Tensor IR | `T.ew, T.reduce, T.sum, T.max, T.view(x, shape, coords => [...]), T.bc, T.reshape, T.squeeze`; `std.FNS`, `std.REDUCERS` | `tensor.js:152-190`, `fns.js` |
| Index algebra | `ix.C, ix.V, e.add/sub/mul/div/mod/min/max, ix.map(n, a => [...]), ix.print` | `ix.js` |
| Extend ML | `std.decompose(op, fn)`, `std.emmy.pipeline({target, store})`, `std.emmy.passes`, `std.emmy.dialects`, `std.emmy.defaultDecide(store)` | `tensor.js:224-237`, `emmy.js` |
| Loop | `E.num/load/op/red`, `schedule`, `printNest`, `workOf`, `inlineInto`, `mergeLoopOps` | `loop.js` |
| Tile | `analyze`, `estimate`, `timeModel`, `costPrior`, `legalMaps`, `forkTree`, `canonRow`, `KNOBS` | `tile.js` |
| Kernel | `materialize`, `KB`, `kx` | `kernel.js` |
| GPU | `toCuda`, `toWgsl`, `toSim`, `programOf`, `simulateKernel` | `emit.js`, `program.js` |
| Devices | `std.targets.*`, `std.target(spec)`, `std.Store`, `std.tune`, `std.measureProgram` | `targets.js`, `store.js`, `tune.js` |
| Notes links | `lab:param`, `lab:pin`, `lab:unpin`, `lab:measure`, `lab:tune`, `lab:device`, `lab:compile`, `lab:view`, `lab:ir`, `lab:node`, `lab:step`, `lab:kernel`, `lab:fork`, `lab:line`, `lab:preset` | reference.txt:169-182 |

## 6. The agent (`app/src/agent/agent.js`)

### 6.1 Wiring

**Model access:** the model is reached through the host page's capability bridge. `main.jsx:12-15` waits up to 3 s
for `window.claude.use` and then sets `wb.sample = await use("sample")`. Without a host bridge, the agent is
unavailable [observed]. `window.claude.use("downloads")` is used for file saving (`ui/App.jsx:50`, `ui/Kernels.jsx:9`).
`main.jsx:8` exposes `window.__kiln = {wb, k, P, std}`.

**One request** (`sendCore`, `agent.js:180-220`) is
`wb.sample(turns, {signal, modelTier, effort, cache: false, onText, tools: [evalTool]})`. Tiers are `quick`,
`default` and `complex`, labelled Fast, Balanced and Deep (`agent.js:14`), with effort low, medium and high
(`ui/Agent.jsx:69-72`). The mode is `auto`, `ask` or `readonly` (`agent.js:35`).

**The system prompt** (`instructions()`, `agent.js:126-144`) concatenates the conversation title and run mode,
`agent-guidelines.txt`, the `AGENT_SCOPE` list (`agent.js:103-124`), the full `reference.txt` and the preset list.

**Context:** each user turn is prefixed with a `[context]` block (`contextSummary`, `agent.js:82-101`) only when it
changed. History is limited to 16 turns and trimmed to about 230 KB (`turnsFor`, `agent.js:146-169`).

**Persistence:** conversations are kept in `localStorage`, at most 30, clipped at 300 KB (`agent.js:42-68`).

### 6.2 The one tool: `eval`

`evalTool` (`agent.js:230-235`) and `runEval` (`agent.js:237-265`) work as follows:

```text
runEval(code):
  if mode == "ask" and not approveAll: wait for Approve / Approve all / Deny
  if mode != "readonly": SNAPS[part] = snapshot()   # script, notes, params, kernelPins, deviceId, evidence JSON
  scope = makeAgentScope({mode, ...})               # namespaces below; readonly wraps mutators
  res = await new Function(...names, '"use strict";\nreturn (async () => {\n' + code + '\n})();\n//# sourceURL=agent-eval.js')(...)
  out = string ? verbatim : YAML(res); errors -> {error, line}
  output cut near 9000 chars (OUT_MAX); returned string capped at 20000
  wb.bump(all views)
```

The scope (`makeAgentScope`, `agent.js:335-535`) exposes:

| Namespace | Calls |
| --- | --- |
| `wb` | `context()` |
| `editor` | `get, set(text), edit(find, replace), check(text?, {device, pins})` |
| `notes` | `get, set, edit, section(title)` |
| `compile` | `compile()` |
| `ir` | `levels, text(level, {bodies, types, only}), node, find, graph, eval, compare` |
| `trace` | `passes, steps({pass, rule, node, declined, limit}), step(i), why(node)` |
| `forks` | `list, get, pin(i, option or row), unpin` |
| `params` | `list, set, pin, unpin` |
| `kernels` | `list, get, source(name, "cuda" / "wgsl" / "kernel" / "tile" / "loop"), simulate` |
| `devices` | `list, current, use(id)` |
| `measure`, `tune` | `measure({device})`, `tune({strategy, budget})` |
| `evidence` | `list, best, clear` |
| `checks` | `e2e, outputs` |
| `presets` | `list, get, load, save` |
| `chat` | `table, propose, code, show, place` |
| `ref` | `section(name), all()` |
| Other | `log`, `console`, and all script names (`k, P, std, ...`) |

**Revert:** `snapshot`, `restore` and `revertFrom` (`agent.js:286-312`) restore the script, notes, params, kernel
pins, device id and the evidence store as of any tool step.

**Read-only mode** (`agent.js:511-526`) replaces these mutators with throwing stubs: `editor.set` and `edit`,
`notes.set` and `edit`, `forks.pin` and `unpin`, `params.set`, `pin` and `unpin`, `devices.use`, `evidence.clear`,
`presets.load` and `save`, and `tune`. `measure` is still allowed, but runs with `store: null` and returns
`recorded: false`.

### 6.3 Guidelines

`agent-guidelines.txt` [observed]:

- look first (`wb.context`, `trace.steps`, `forks.list`);
- at most four `editor.set` rounds;
- use forks for transformations that do not always win;
- "Simulated times come from a model: say so" (`:11`);
- never invent API (`:12`);
- numbers in notes must come from runs (`:15`);
- finish with one to three sentences plus `lab:` links (`:19`).

### 6.4 Observations

[observed] The agent's code runs with page privileges through `new Function`, the same as user scripts, and
`window.__kiln.wb` (`main.jsx:8`) is reachable from eval code in every mode. [inferred] Read-only mode is therefore a
convention enforced on the provided API, not a sandbox. [observed] There is no per-turn cap on `eval` calls other than
the model's own turn structure, no token accounting, and `cache: false` on every request.

## 7. The runner (`runner/kiln_runner.py`)

A single-file Python 3 program with three subcommands: `device`, `run <bundle>` and `serve` (`kiln_runner.py:328-357`).

### 7.1 Build and harness

- **Harness:** `HARNESS` (`kiln_runner.py:61-127`) is a C++ template compiled together with the kernel source. It
  regenerates inputs with the page's mulberry32 generator and seeds, fills the output with `0xff` bytes (`NaN`, so
  unwritten outputs are detectable), runs `WARM` warmup launches, records a `cudaEventRecord` pair around *each*
  timed launch, and prints all per-launch times plus sampled output values.
- **Build** (`kiln_runner.py:151-168`): `nvcc -O3 -std=c++14 -arch=<arch> -Xptxas -v`. The register count is parsed
  from ptxas output. Binaries are cached in a temp directory keyed by `sha1(source + arch)`. The default arch is
  `native`, overridable with `$KILN_ARCH` (`kiln_runner.py:262-263`).
- **`run_kernel`** (`kiln_runner.py:192-213`) returns median, min, all times, samples and registers.
- **Profiling:** `profile` (`kiln_runner.py:216-240`) runs `ncu --csv --metrics <NCU_METRICS> exe 1 0`. The metrics
  (`kiln_runner.py:35-46`) are SM and DRAM throughput, achieved occupancy, load sectors and requests, shared-memory
  bank conflicts, uniform branches, registers and duration.
- **`run_bundle`** (`kiln_runner.py:243-259`) reads `kiln-bundle/1` and writes `kiln-results/1`.
- **`DEVICE_QUERY`** (`kiln_runner.py:129-148`) reports the name and compute capability.

### 7.2 Server

`serve` (`kiln_runner.py:267-325`):

| Route | Behaviour |
| --- | --- |
| `GET /` | Serves the built workbench HTML. If it is missing, prints "the API works, but / will not serve the workbench". |
| `GET /api/device` | Device query |
| `POST /api/run` | Runs one kernel request |

Protections [observed]: the Content-Type must be JSON, bodies are limited to 64 MiB, and `Origin` must be absent or
equal `http://{Host}`. A warning is printed when binding to a non-loopback address; the README says it binds
127.0.0.1 by default (README.md:85). When nvcc is missing it prints "install the CUDA toolkit or set CUDA_HOME".

### 7.3 Timing methodology [observed]

- Median of 50 back-to-back launches (5 warmups) with per-launch events.
- No L2 flush between reps, so it measures warm caches. No clock locking or persistence-mode handling (no
  `nvidia-smi` call anywhere in the runner).
- One process per kernel request: the compiled harness executable is launched with `subprocess.run` (60 s timeout at
  `kiln_runner.py:178`, 300 s at `:204`). `ncu` gets 600 s (`:221`).
- `nvcc` is used. NVRTC appears only in the test-side `cuda_check.py`.

**[inferred]** Small kernels will report warm-L2 times that are faster than in-model behaviour. Results are not
comparable across machines without clock control.

## 8. Build and tests

### 8.1 Build (`app/build.mjs`)

1. Generate `src/presets.gen.js` from `presets/*.js` and `*.md` (`build.mjs:18-27`), and `src/docs.gen.js`, which
   holds `REFERENCE`, `GUIDELINES` and the `RUNNER` source (`build.mjs:28`). `--gen-only` stops here (`build.mjs:29`).
2. Bundle with esbuild into an IIFE, with React and ReactDOM as UMD globals (`build.mjs:32-43`).
3. Inline the CSS. Load React 18.3.1 and KaTeX 0.16.9 from cdnjs (`build.mjs:46-60`).
4. Write `dist/index.html` and `dist/kiln-workbench.html` (`build.mjs:62-63`). There is no `<!doctype>` (a quirks-mode
   risk; see the UI notes).

In `package.json` the `test` script is a stub. Dependencies are `acorn ^8.14.0`, `acorn-walk`, `esbuild ^0.24.2`,
`react` and `react-dom`, with `katex` as a dev dependency; the lockfile pins `acorn 8.19.0`. There is no CI
configuration in the snapshot [observed].

I checked the shipped generated modules against their sources with a scratch script (`checkgen.mjs`): presets 25/25
match, 0 differences.

### 8.2 Test inventory (`app/test/`)

| File | What it covers |
| --- | --- |
| `core.mjs` | Dialects, folding, by-example rules, strict lowering failure message, fork + cost + pin, keep-original |
| `stack1.mjs` | torch to loop for 6 programs against the frontend reference |
| `stack2.mjs` | Tile decisions and option counts |
| `stack3.mjs` | Simulates each kernel (`all` pin mode) with metrics and checks |
| `progs.mjs` | Attention, n-body, blur, SwiGLU, LayerNorm: end-to-end plus simulator checks |
| `tune.mjs` | Sweep and SP-MCTS on `sim:rtx4090`, then evidence-driven greedy |
| `presets.mjs` | Compiles and checks all 25 presets |
| `notes.mjs` | Parses all notes and executes every `lab:` link |
| `param-sweep.mjs` | Compiles every preset across slider extremes (227 compiles) |
| `export-cuda.mjs` | Exports preset kernels plus alternative schedules to JSON for `cuda_check.py` |
| `cuda_check.py` | NVRTC (via ctypes) plus ptxas: compiles, registers, spills |
| `ui.mjs` | Playwright: drives the page with a fake `window.claude` sampler, SwiftShader WebGPU |

### 8.3 Results (run on a scratch copy at `/Volumes/SSD/code/kiln-scratch`, Node v26.8.1)

`npm ci --offline` failed (`ENOTCACHED` for `katex-0.16.9.tgz`). Only `acorn` is needed by the headless tests, so I
installed `acorn@8` alone, offline, in a separate scratch directory (it resolved to 8.18.0, against 8.19.0 in the
lockfile) and copied it into the scratch app. Nothing was installed in the imports directory.

| Test | Result | Wall time |
| --- | --- | --- |
| `core.mjs` | exit 0, all `ok` | 0.1 s |
| `stack1.mjs` | exit 0; max abs diffs 0 to 2.38e-7; MLP shows 2 blowup declines | 0.10 s |
| `stack2.mjs` | exit 0 (option counts in section 2.8) | 0.70 s |
| `stack3.mjs` | exit 0; for example `rowsum ... occ=67% ld 3.9 sect/req, bank 0.00 check: ok (4)` | 0.26 s |
| `progs.mjs` | exit 0; every kernel `check ok`; some only 12 sampled outputs | 0.34 s |
| `tune.mjs` | exit 0 (table in section 4.7) | 1.42 s |
| `presets.mjs` | 25/25 ok | 7.39 s |
| `notes.mjs` | all notes pass, 169 `lab:` links | 3.08 s |
| `param-sweep.mjs` | "all 227 compiles pass" | 55.2 s |
| `ui.mjs`, WebGPU-all | not run: needs Playwright and Chromium | |
| `export-cuda.mjs` + `cuda_check.py` | not run: needs NVRTC and ptxas | |
| runner | not run: no NVIDIA GPU here | |

In `presets.mjs`, 10 presets report `e2e skipped`: W-07, W-08, W-09, W-10, W-15, W-16, W-21, W-23, W-24 and W-25.
They exceed the 6e7-op end-to-end limit at default sliders, so only per-kernel sampled checks cover them.

The README's own verification claims (README.md:63-73) are: 169 lab links, 227 compiles, WGSL validated on
SwiftShader, 79 kernels through NVRTC + ptxas sm_89 with no spills, runner inputs bit-identical, and no physical-GPU
timings. I reproduced the first two.

## 9. Presets W-01 to W-25

The header group is in brackets. Simulated time is the `presets.mjs` total on the default device at default
sliders [observed].

| ID | Title [group] | One line |
| --- | --- | --- |
| W-01 | Hello, dialect [Basics] | `arith` dialect, `const_right`/`fold`/by-example rules, a `simplify` pass; checks size 4 and value 11 |
| W-02 | Patterns, declines and guards [Basics] | Strength reduction with `skip()`, `P.chain` shl-shl, CSE via `key()`, distribute with a guard |
| W-03 | Lowering to a register VM [Basics] | Strict checkpoints, a whole-graph linear-scan register allocator, a `REUSE` param |
| W-04 | Forks, knobs and sliders [Basics] | Taylor `exp` via `fork.over(TERMS).keepOriginal()`, a "cycles" cost with an accuracy tolerance |
| W-05 | RMSNorm, fused [ML compiler] | One op through six IRs into one row kernel; model 21.2 µs vs simulator 24.3 µs |
| W-06 | Softmax in one kernel [ML compiler] | LICM and three sweeps (max, sum, normalise) in one row kernel; 7.9 µs |
| W-07 | GELU, pointwise [ML compiler] | Thread map, `COARSEN` and `TPB` trade-offs; 77.6 µs; e2e skipped |
| W-08 | Linear layer, tiled [ML compiler] | `BM/BN/BK/TM/TN` fork for a contraction; 119.8 µs |
| W-09 | MLP and the blowup guard [ML compiler] | GELU or SwiGLU MLP; fusion declined by the blowup guard; 2 kernels, 76.7 µs |
| W-10 | Attention [ML compiler] | Batched tiled matmuls plus a softmax row kernel; notes say FlashAttention is not expressible; 3 kernels, 20.8 µs |
| W-11 | N-body forces [Write programs] | Pairwise forces as reductions; 2 kernels, 8.4 µs |
| W-12 | Box blur, a stencil [Write programs] | Slices plus elementwise as one kernel; 12.1 µs |
| W-13 | LayerNorm with a residual [Write programs] | Residual add + LayerNorm fused into one kernel; 17.7 µs |
| W-14 | Your own pass in the ML pipeline [Extend the compiler] | `hoist_reciprocal` behind a `RECIP` toggle, `insertAfter`, flops cost |
| W-15 | Your own cost model [Extend the compiler] | An occupancy-first policy that picks schedules "18x slower"; 3224.2 µs |
| W-16 | A new frontend op [Extend the compiler] | `hard_swish` via `std.decompose` + `insertRule` + `withIr` |
| W-17 | Regex to NFA to DFA to JavaScript [Other compilers] | 5 IRs (regex, core, nfa, dfa, js): Thompson, subset construction, Moore minimisation, codegen; `pattern` text param, `minimize` bool |
| W-18 | The roofline: three regimes [GPU optimization] | A Horner polynomial whose degree slider moves a kernel from memory- to compute-bound |
| W-19 | Fusion: why the compiler fuses [GPU optimization] | A transformer epilogue (bias, GELU, scale, residual); a `fuse` bool wraps `mergeLoopOps` and `skip()`s when off; compares kernels, DRAM bytes and µs |
| W-20 | Batch size and arithmetic intensity [GPU optimization] | Intensity of about M/2 as the batch grows |
| W-21 | The matmul ladder [GPU optimization] | Six schedule rungs picked by a `step` slider through a custom `decide.cost` policy (0 for the named rung, `Infinity` otherwise) chained before the base decide; 1086.9 µs at the default rung |
| W-22 | Variance three ways [GPU optimization] | Two-pass, one-pass and shifted variance: speed vs fp32 error against fp64 |
| W-23 | Occupancy and latency hiding [GPU optimization] | `TPB` and `STAGE` against occupancy; Little's law |
| W-24 | One program, five GPUs [GPU optimization] | GPT-2 MLP block on all five specs; ridge-point check; "why the H100 looks bad" (FP32, no tensor cores) |
| W-25 | The cost model vs the measurements [GPU optimization] | Spearman rho and regret of the model against the simulator |

W-25's notes report rho of about 0.99 over all 27 softmax options and a regret of 1.19x: the model favours
`MAP=row,TPB=1024`, which measures 99.5 µs, while the best measured is `STAGE=reused` at 83.3 µs. Rho is about 0.92
for the 12 row schedules only. The notes explain that the two share `timeModel` and differ only in the counts.

## 10. Weaknesses, with evidence

Ordered roughly by impact on "can I trust the numbers". Each item gives the claim, the evidence, and the tag.

**W-1. The simulator "measures" with the model's own time formula.** [observed] `metricsOf` (`program.js:122-128`)
feeds counted sectors, wavefronts and flops into the same `timeModel` that `estimate` uses (`tile.js:279-280`), with
the same 12%/60% DRAM heuristic (`program.js:126` vs `tile.js:277`). Model-vs-simulator agreement (W-25: rho 0.99) is
largely self-consistency. Tuning on `sim:*` (`tune.mjs`: greedy = sweep = SP-MCTS = 10.6 µs) can only find what the
formula rewards. The UI does show a "timing" row with `mt.kind` (`ui/Perf.jsx:103`); the store keeps `kind` only
inside `metrics`.

**W-2. Evidence keeps one best number per schedule, with no statistics.** [observed] `store.put` keeps one row per
(device, identity, canonical knobs) and replaces it only when faster or when the old row failed (`store.js:8-17`). No
repetition count, variance, expiry or environment manifest is stored. [inferred] One lucky low WebGPU sample (20 reps,
or wall clock) wins permanently.

**W-3. The evidence key covers neither the generated code nor the hardware.** [observed] Kernel identity hashes the
Loop IR expression and shapes (`program.js:37`), so a change to a materialiser, `toCuda`, a target spec or the
compiler leaves old evidence in force. Device ids are the constants `webgpu` and `cuda` (`devices.js:22`, `:121`)
whatever the adapter, GPU model, driver or clocks, so evidence from two GPUs collides in one browser's
`localStorage` and in imported `kiln-evidence/1` files.

**W-4. Measurement methodology is minimal.** [observed] WebGPU: median of 20 after 3 warmups, wall clock around
`submit` when `timestamp-query` is denied (`devices.js:21-117`). CUDA: median of 50 back-to-back event-timed
launches, warm L2, no flush, no clock lock (`kiln_runner.py:61-127`). The provenance `kind` is displayed but never
used in decisions, so evidence of different kinds is ranked together.

**W-5. Evidence is exploitation-only.** [observed, `kiln.js:587-597`] Unmeasured options score `Infinity`, so once
the model's favourite and one alternative are measured, a third option the model rates highly is never revisited.
The "defer until the favourite is measured" rule protects only the favourite. [inferred] Exploration is left to an
explicit `tune` call.

**W-6. Tuning rollouts cannot see evidence.** [observed] `tune()` builds `ctx = {deviceId}` without `store`
(`tune.js:45`), so the rollout's `evidence(null)` finds no store and returns `null`. The sweep comment says this is
deliberate ("not by evidence: the point is to gather more of it", `tune.js:59`); for SP-MCTS it means rollouts follow
the model prior only. [inferred] `measureProgram` memoises per `identity|row` within one call, so the cost is
repeated measurements across calls rather than within one.

**W-7. `pinned()` fires only when every knob is pinned.** [observed, `kiln.js:565`] A partial pin narrows `options`
(`kiln.js:983`), but the decision is reported `by: "model"`, even with one option left (RMSNorm with three pins:
`size: 1, by: "model"`). [inferred] This misattributes decisions in the UI and in the agent's `forks.list()`.

**W-8. `keepOriginal` uses `p.off` as its knob value.** [observed] When `off` is also a legal value (`core.mjs:44`:
`UNROLL` in `[1,2,4,8]`, `off: 1`), pinning it matches both the `UNROLL=1` expansion and "keep original", and
`pinned()` takes emission order: the expansion. `core.mjs:60-61` prints this case (a 1-term expansion stamped
`⟨UNROLL=1⟩`) without asserting it.

**W-9. The 2% fusion slack is undocumented.** [observed] The guard accepts `now <= was * 1.02` (`loop.js:342`); the
reference says "no work blowup" (reference.txt:136) and the W-09 note implies a strict comparison. [inferred] Minor,
but a fused kernel may do up to 2% more work by design.

**W-10. The frontend's expressiveness limits are structural.** [observed] `ix` expressions depend on coordinates only
(`ix.js:5-110`): no gathers, embeddings, top-k, sorting, or data-dependent bilinear sampling. Reducers are scalar
`add`/`max`/`min`/`mul` (`fns.js:37-42`): no pair-valued reducer, so no online softmax, FlashAttention or Welford
(W-10 and W-22 notes say so). Everything is `f32`, with no fp16/bf16 and no tensor cores; the H100 is modelled at
67 TFLOP/s FP32 (W-24 notes).

**W-11. Codegen idioms are textbook.** [observed] Tree reductions use shared memory with a `__syncthreads()` per
halving step and no warp shuffles (`kernel.js:99-113`; visible in section 3.1). Shared memory is static only (48 KiB
per block). Tiled matmul has no double buffering, vectorised loads or `cp.async` (`kernel.js:170-241`). [inferred]
Simulated numbers flatter these kernels relative to production libraries; a real-GPU run would show the gap.

**W-12. `blocked` is effectively dead code.** [observed] `run.blocked` comes only from
`pipeline.run(graph, { blocked })` (`kiln.js:752`) and is consulted in `applyFork` (`kiln.js:985-986`). No caller in
`core`, `std`, `ui` or `agent` passes it, and the reference does not document it. `options.filter(...) || options`
never falls back, because an empty array is truthy. [inferred] If used, it could leave zero options and produce a
confusing skip.

**W-13. Correctness checks are sampled.** [observed] End-to-end is skipped above 6e7 ops (`wb.js:156-185`), which
covers 10 of 25 presets at defaults. Kernel checks compare at most 512 covered outputs from at most 12 sampled blocks
(`program.js:92-120`); several `progs.mjs` kernels were checked at 12 outputs and one `stack3.mjs` kernel at 4.
[inferred] Edge blocks (partial tiles, tails) may go unsampled.

**W-14. The agent runs with full page privileges.** [observed] Eval code runs via `new Function` in page scope
(`agent.js:253`) with `window.__kiln` exposed (`main.jsx:8`). Read-only mode wraps the API but still allows
`measure` (`agent.js:520-525`). There is no per-turn eval cap and no token accounting. [inferred] Snapshots make
workbench changes revertible but cannot undo side effects such as `fetch` or other `localStorage` keys.

**W-15. The runner's same-origin check is probably bypassable via DNS rebinding.** [inferred, not tested] `serve`
accepts a request when `Origin` is absent or equals `http://{Host}` (`kiln_runner.py:267-325`). A page whose hostname
rebinds to 127.0.0.1 controls both headers and is same-origin from the browser's view, so the JSON content-type
preflight does not help. `POST /api/run` compiles and runs arbitrary CUDA C++ with `nvcc`: local code execution as
the runner's user. Mitigation: a Host allow-list (`127.0.0.1:port`, `localhost:port`) or a per-session token.

**W-16. No test harness or CI, and doc names drift.** [observed] `npm test` is a stub; tests are ad-hoc
`node test/*.mjs` scripts printing `ok` lines, with no CI config. Pass names in `reference.txt:139-140` differ from the
code (`lowering/kernel`, `lowering/emit`). The agent treats the reference as ground truth, so it may address a pass
by the wrong full name; the short letters still work.

**W-17. By-example rules depend on lambda source text.** [observed, `kiln.js:646-651`] Parameter names are parsed
from `fn.toString()`. [inferred] Minified or transpiled user code would break them; fine in-page, a problem if the
framework is reused as a library.

**W-18. Scale limits.** [observed] Fork-tree expansion silently stops at 20,000 leaves (`kiln.js:542`), fixpoint
passes stop at 4,000 rewrites, and traces grow with steps (deltas plus a snapshot every 48 rewrites). [inferred]
Programs with hundreds of kernels would hit trace size and the agent's 230 KB context budget before compile time;
`param-sweep` compiles average about 0.24 s each.

## 11. Things an intern should verify before building on this

1. Whether the UI distinguishes `by: "model"` from `by: "evidence"` *and* the evidence kind (simulated vs timestamp
   vs CUDA events). See W-1, W-4 and W-7, and the UI notes.
2. Whether the evidence key should include a codegen version and a hardware fingerprint (W-3) before any real-GPU
   evidence is shared between people.
3. The runner's network exposure (W-15) before serving it anywhere but a single-user workstation.
4. The real-GPU behaviour of the generated kernels. The snapshot ships no physical-GPU timings (README.md:63-73). The
   `export-cuda.mjs` + `cuda_check.py` path and the runner are the way to get them.
