// KILN-007: fused attention. The recognizer (attention.js), the region fusion pass, the MAP=flash Tile
// mapping (flash.js) and the online-softmax materializer (flash-kernel.js), checked on CPU: recognizer
// fields and refusals, kernel counts, Loop IR against the frontend reference, fork legality against the
// shared-memory limits, and the SIMT simulator against the Loop IR reference on every legal option.
import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor, numel} from '../src/core/util.js';
import {N} from '../src/std/tensor.js';
import {pipeline} from '../src/std/emmy.js';
import {createFusionRule, runSerial, schedule, compileSerial} from '../src/std/loop.js';
import {matchSoftmaxContraction} from '../src/std/attention.js';
import {analyze, legalMaps, forkTree, estimate, printTile, launch} from '../src/std/tile.js';
import {flashOptions, flashSmemBytes} from '../src/std/flash.js';
import {programOf, simulateKernel, simulateFull} from '../src/std/program.js';
import {SPECS, WEBGPU_DEFAULT, target} from '../src/std/targets.js';

const gb10 = target(SPECS.gb10), web = target(WEBGPU_DEFAULT);
// the importer's lowering (fx_compose.lower_sdpa) and hand-written variants
function graph({B = 1, H = 2, L = 5, S = 7, D = 4, E = D, mask = 'add', maskShape = null, dtype = 'f32', variant = 'sdpa', scoresOut = false, proj = false}) {
  const ms = maskShape || [B, 1, L, S];
  const shapes = {q: k.tensor(proj ? [B, H, L, 8] : [B, H, L, E], dtype), kk: k.tensor([B, H, S, E], dtype), v: k.tensor([B, H, S, D], dtype)};
  if (proj) shapes.wq = k.tensor([E, 8], dtype);
  if (mask !== 'none') shapes.mask = k.tensor(ms, mask === 'bool' ? 'bool' : dtype);
  return k.trace('attention', ({q, kk, v, mask: m, wq}) => {
    const c = (x) => N.cast(x, 'f32');
    const qq = proj ? N.linear(c(q), c(wq)) : c(q);
    let s = N.mul(N.matmul(qq, N.transpose(c(kk), -2, -1), 'highest'), 1 / Math.sqrt(E));
    if (mask === 'add') s = N.add(s, c(m));
    if (mask === 'bool') s = N.select(m, s, -Infinity);
    let out;
    if (variant === 'sdpa') out = N.matmul(N.softmax(s, -1), c(v), 'highest');
    else if (variant === 'unnormalized') { const e = N.exp(N.sub(s, N.amax(s, -1))); out = N.div(N.matmul(e, c(v), 'highest'), N.sum(e, -1)); }
    else if (variant === 'softmax-only') out = N.softmax(s, -1);
    else if (variant === 'no-softmax') out = N.matmul(s, c(v), 'highest');
    else if (variant === 'log-softmax') out = N.matmul(N.log(N.softmax(s, -1)), c(v), 'highest');
    else if (variant === 'softmax-axis') out = N.matmul(N.transpose(N.softmax(N.transpose(s, -2, -1), -1), -2, -1), c(v), 'highest');
    const r = {out: N.cast(out, dtype)};
    if (scoresOut) r.scores = s;
    return r;
  }, shapes);
}
const compile = (g, {t = gb10, contraction = 'separate', attention = 'fused', params = {}} = {}) => {
  const run = pipeline({target: t, contraction, attention}).run(g, {params});
  assert.ok(run.ok, run.error?.message);
  return run;
};
const loopKernels = (run) => { const g = run.at('loop'); return [...g.nodes.values()].filter((n) => n.name === 'loop.kernel').map((n) => ({attrs: n.attrs, inShapes: n.args.map((id) => g.nodes.get(id).type.shape)})); };
const matchOf = (n) => matchSoftmaxContraction(n.attrs.expr, n.attrs.shape, n.inShapes);
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return (seed / 2 ** 32) * 2 - 1; };
const inputsFor = (g) => Object.fromEntries(g.inputs.map(({name, id}) => { const ty = g.nodes.get(id).type; return [name, new Tensor(ty.shape, Float32Array.from({length: numel(ty.shape)}, rnd), ty.dtype)]; }));
const maxAbs = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };

// forced (unguarded) fusion: one kernel whatever the guard or the cost model would say
const unguarded = k.pass('loop/fusion').short('f').rules(createFusionRule({decide: () => true})).order('reverse');
const forcedKernels = (g, contraction = 'separate') => { const r = pipeline({target: gb10, contraction}).replace('loop/fusion', unguarded).run(g); assert.ok(r.ok, r.error?.message); return loopKernels(r); };

// ---------------------------------------------------------------- Phase 1: the recognizer
{
  // forced fusion forms the same expression the attention pass forms
  for (const contraction of ['separate', 'allow']) {
    const g = graph({L: 5, S: 7, D: 4});
    const forced = pipeline({target: gb10, contraction}).replace('loop/fusion', unguarded).run(g);
    assert.ok(forced.ok, forced.error?.message);
    const [kern] = loopKernels(forced);
    const m = matchOf(kern);
    assert.ok(m, `forced fusion is recognized (${contraction})`);
    assert.equal(m.L, 5); assert.equal(m.S, 7); assert.equal(m.D, 4); assert.equal(m.E, 4);
    assert.equal(m.iVar, 'a2'); assert.equal(m.dVar, 'a3'); assert.deepEqual(m.batchVars, ['a0', 'a1']);
    assert.equal(m.normalized, true);
    assert.equal(m.dotFn, contraction === 'separate' ? 'mul_rn' : 'mul');
    assert.equal(m.subFn, contraction === 'separate' ? 'sub_rn' : 'sub');
    const fused = loopKernels(compile(g, {contraction}));
    assert.equal(fused.length, 1);
    assert.equal(fused[0].attrs.expr.__key, kern.attrs.expr.__key, 'the attention pass and forced fusion agree');
  }
  // shapes, masks, value width different from the key width, low precision, the unnormalized form
  for (const c of [
    {L: 9, S: 11, D: 16}, {L: 1, S: 13, D: 8}, {L: 6, S: 6, D: 12, E: 8}, {mask: 'none'}, {mask: 'bool'},
    {maskShape: [1, 2, 5, 7]}, {maskShape: [1, 1, 1, 7]}, {dtype: 'f16'}, {dtype: 'bf16', mask: 'bool'}, {variant: 'unnormalized'}, {B: 2, H: 3},
  ]) {
    const ks = loopKernels(compile(graph(c)));
    const ms = ks.map(matchOf).filter(Boolean);
    assert.equal(ms.length, 1, `one recognized kernel for ${JSON.stringify(c)}`);
    const m = ms[0];
    assert.equal(m.E, c.E ?? c.D ?? 4); assert.equal(m.D, c.D ?? 4);
    assert.equal(m.normalized, c.variant !== 'unnormalized');
  }
  // refusals: softmax without the product, a product without the softmax, a softmax over the other axis,
  // log-softmax, and a score matrix that is also an output
  for (const variant of ['softmax-only', 'no-softmax', 'log-softmax', 'softmax-axis']) {
    const g = graph({variant});
    const forced = pipeline({target: gb10, contraction: 'separate'}).replace('loop/fusion', unguarded).run(g);
    assert.ok(forced.ok);
    assert.ok(loopKernels(forced).every((n) => !matchOf(n)), `${variant} is not a softmax contraction`);
    assert.equal(loopKernels(compile(g)).length, loopKernels(compile(g, {attention: 'composed'})).length, `${variant} is left unchanged`);
  }
}

// ---------------------------------------------------------------- Phase 2: the fusion pass
{
  const g = graph({L: 9, S: 11, D: 16});
  assert.equal(loopKernels(compile(g, {attention: 'composed'})).length, 3, 'the composed path has three kernels');
  const fused = compile(g);
  assert.equal(loopKernels(fused).length, 1);
  const x = inputsFor(g), ref = g.eval(x).out.data, lo = fused.at('loop').eval(x).out.data;
  assert.ok(maxAbs(ref, lo) < 1e-6, `Loop IR vs frontend reference ${maxAbs(ref, lo)}`);
  // the scores are an output: the region cannot include them, nothing is fused
  const so = graph({L: 9, S: 11, D: 16, scoresOut: true});
  assert.equal(loopKernels(compile(so)).length, loopKernels(compile(so, {attention: 'composed'})).length);
  assert.ok(loopKernels(compile(so)).every((n) => !matchOf(n)));
  // a query projection stays its own kernel; the attention region stops at it
  const pg = graph({L: 9, S: 11, D: 16, proj: true});
  const pk = loopKernels(compile(pg));
  assert.equal(pk.filter(matchOf).length, 1);
  assert.ok(pk.length >= 2, 'the projection is not inlined into the attention kernel');
  const px = inputsFor(pg);
  assert.ok(maxAbs(pg.eval(px).out.data, compile(pg).at('loop').eval(px).out.data) < 1e-5);
  // no MAP=flash option fits (D=512 on the WebGPU default limits): the rule declines
  const big = graph({L: 4, S: 4, D: 512});
  assert.ok(loopKernels(compile(big, {t: web})).every((n) => !matchOf(n)));
  assert.throws(() => pipeline({attention: 'flash'}), /attention must be/);
  // legal but predicted slower than the composed kernels (D=128 on gb10): the rule declines
  const wide = graph({H: 8, L: 256, S: 256, D: 128});
  assert.equal(loopKernels(compile(wide)).length, 3);
}

// ---------------------------------------------------------------- Phase 3: the Tile mapping
const leaves = (an, t) => {
  const f = forkTree(an, t).leaf((kn) => kn), out = [];
  const rec = (i, kn) => { if (i === f.meta.tree.length) { out.push(kn); return; } const {p, valuesFn} = f.meta.tree[i]; for (const v of valuesFn(kn)) rec(i + 1, {...kn, [p.name]: v}); };
  rec(0, {});
  return out;
};
{
  for (const D of [64, 128]) for (const t of [gb10, web]) {
    const [kern] = forcedKernels(graph({L: 128, S: 128, D}));
    const an = analyze(kern.attrs.expr, kern.attrs.shape, kern.inShapes);
    assert.ok(legalMaps(an).includes('flash'));
    const fl = leaves(an, t).filter((kn) => kn.MAP === 'flash');
    assert.equal(fl.length, flashOptions(an.attention, t).length, 'the fork tree and flashOptions agree');
    for (const kn of fl) {
      assert.ok(flashSmemBytes(an.attention, kn) <= t.smemPerBlock && launch(an, kn).smem <= t.smemPerBlock);
      assert.ok(kn.TPB <= t.maxThreadsPerBlock && kn.BR % kn.RM === 0 && kn.TPB % (kn.BR / kn.RM) === 0);
    }
    if (t === gb10) assert.ok(fl.length > 0, `gb10 runs D=${D}`);
    if (t === web && D === 64) assert.ok(fl.length > 0 && fl.every((kn) => kn.BR * kn.BC <= 16 * 16), 'WebGPU fits only the smallest tiles');
    if (t === web && D === 128) assert.equal(fl.length, 0, 'D=128 does not fit 16 KiB');
  }
  // the cost model prefers flash over the single-kernel row map at the BERT shape
  const run = compile(graph({B: 2, H: 12, L: 128, S: 128, D: 64}));
  const tk = [...run.at('tile').nodes.values()].filter((n) => n.name === 'tile.kernel');
  assert.equal(tk.length, 1);
  assert.equal(tk[0].attrs.map.MAP, 'flash');
  const an = analyze(tk[0].attrs.expr, tk[0].attrs.shape, tk[0].attrs.inShapes);
  const best = Math.min(...leaves(an, gb10).filter((kn) => kn.MAP === 'row').map((kn) => estimate(an, kn, gb10).us));
  assert.ok(estimate(an, tk[0].attrs.map, gb10).us < best / 5, 'flash is far cheaper than row');
  assert.match(printTile(an, tk[0].attrs.map, ['v', 'mask', 'k', 'q']), /online softmax[\s\S]*for j0 in 0\.\.128 step/);
}

// ---------------------------------------------------------------- Phase 4: the materializer
const flashKernel = (run) => programOf(run.graph).kernels.find((kk) => kk.map.MAP === 'flash');
function simulateAll(c, t = gb10) {
  const g = graph(c);
  const [kern] = loopKernels(compile(g, {t}));
  const att = matchOf(kern);
  const opts = flashOptions(att, t);
  assert.ok(opts.length, `options for ${JSON.stringify(c)}`);
  for (const o of opts) {
    const kk = flashKernel(compile(g, {t, params: {MAP: 'flash', ...o}}));
    assert.ok(kk, `MAP=flash ${JSON.stringify(o)}`);
    const r = simulateKernel(kk, t).check;
    assert.ok(r.ok, `${JSON.stringify(c)} ${kk.row}: ${r.message}`);
    assert.ok(r.maxAbs < 1e-5, `${kk.row} max abs ${r.maxAbs}`);
  }
  return opts.length;
}
let simulated = 0;
// ragged L and S (not multiples of BR or BC) and D not a multiple of the threads per row
simulated += simulateAll({L: 13, S: 21, D: 24});
simulated += simulateAll({L: 5, S: 7, D: 4, mask: 'none', B: 2});
simulated += simulateAll({L: 9, S: 40, D: 12, E: 8, maskShape: [1, 2, 9, 40]});
simulated += simulateAll({L: 3, S: 17, D: 6, maskShape: [1, 1, 1, 17], dtype: 'f16'});
simulated += simulateAll({L: 16, S: 32, D: 16, mask: 'none'}, web);
// every element against the serial reference, with data that masks whole rows: NaN where PyTorch's
// math reference and Kiln's three-pass reference produce NaN, equal values elsewhere
{
  const L = 6, S = 10, D = 8;
  const g = graph({L, S, D});
  const x = inputsFor(g);
  for (let h = 0; h < L * S; h++) if (Math.floor(h / S) === 2 || (Math.floor(h / S) === 4 && h % S > 2)) x.mask.data[h] = -Infinity;
  for (const o of flashOptions(matchOf(loopKernels(compile(g))[0]), gb10).slice(0, 4)) {
    const kk = flashKernel(compile(g, {params: {MAP: 'flash', ...o}}));
    const order = kk.args.map((name) => x[name]);
    assert.ok(order.every(Boolean), 'the fused kernel reads graph inputs only');
    const got = simulateFull(kk, order.map((tt) => tt.data));
    const want = runSerial(kk.expr, kk.shape, order).data;
    for (let i = 0; i < want.length; i++) {
      const row = Math.floor(i / D) % L;
      assert.equal(Number.isNaN(got[i]), Number.isNaN(want[i]), `NaN pattern at ${i} (${kk.row})`);
      assert.equal(Number.isNaN(want[i]), row === 2, 'the fully masked row is NaN');
      if (!Number.isNaN(want[i])) assert.ok(Math.abs(got[i] - want[i]) < 1e-5, `${i}: ${got[i]} vs ${want[i]}`);
    }
  }
}
// CUDA source: one kernel, static shared arrays, four barriers in the key loop, f16 storage narrowed
{
  const kk = flashKernel(compile(graph({L: 9, S: 11, D: 16, dtype: 'f16'}), {params: {MAP: 'flash', BR: 8, BC: 16, RM: 2, TPB: 64}}));
  assert.equal(kk.row, 'MAP=flash,TPB=64,BR=8,BC=16,RM=2');
  for (const a of ['sQ', 'sK', 'sV', 'sP', 'sM']) assert.match(kk.cuda, new RegExp(`__shared__ float ${a}\\[`));
  assert.match(kk.cuda, /for \(int j0 = 0; j0 < 11; j0 \+= 16\)/);
  const loop = kk.cuda.slice(kk.cuda.indexOf('for (int j0'));
  assert.equal((loop.match(/__syncthreads\(\)/g) || []).length, 4);
  assert.match(kk.cuda, /__float2half_rn/);
  assert.equal(kk.wgsl, null, 'mul_rn has no WGSL spelling');
}
console.log(`fused attention: recognizer, region fusion, fork legality, cost preference, ${simulated} simulated MAP=flash options, masked rows and CUDA structure passed`);
