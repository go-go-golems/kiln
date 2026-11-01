// Emitters over Kernel IR: CUDA C++, WGSL, and a lockstep SIMT simulator in JavaScript.
import * as IX from "../core/ix.js";
import { FNS, fill } from "./fns.js";

const cname = (s) => String(s || "kernel").replace(/[^\w]/g, "_");
const flit = (v, lang) => {
  if (Number.isNaN(v)) return lang === "c" ? "__int_as_float(0x7fc00000)" : "bitcast<f32>(0x7fc00000u)";
  if (v === Infinity) return lang === "c" ? "__int_as_float(0x7f800000)" : "bitcast<f32>(0x7f800000u)";
  if (v === -Infinity) return lang === "c" ? "__int_as_float(0xff800000)" : "bitcast<f32>(0xff800000u)";
  let s = String(+v);
  if (!/[.e]/.test(s)) s += ".0";
  return lang === "c" ? s + "f" : s;
};

// a literal in an integer context (a typed function's operand, an integer variable): exact, never a float
const ilit = ({ v, exact }, dtype) => {
  if (dtype === "bool") return v != 0 ? "true" : "false";
  const b = exact != null ? BigInt(exact) : Number.isInteger(v) ? BigInt(v) : null;
  if (b === null) throw new TypeError(`non-integral literal ${v} in a ${dtype} context`);
  if (dtype === "i32") return String(b);
  return b === -(2n ** 63n) ? "(-9223372036854775807LL - 1)" : `${b}LL`;
};

// ----------------------------------------------------------------------------- CUDA
// CUDA spelling of each storage dtype
export const CUDA_STORAGE = Object.freeze({ f32: "float", u8: "unsigned char", f16: "__half", bf16: "__nv_bfloat16", i32: "int", i64: "long long", bool: "bool" });

export function toCuda(K) {
  // buffers are src0…srcN and dst: kernel temporaries are named in0, in1… after the Loop IR's loads
  const bufName = (b) => (b === "out" ? "dst" : "src" + b);
  // a data-dependent index term reads an integer input at its row-major offset
  const ldSpell = (i, idx, r) => {
    const shape = K.params.filter((p) => p.role === "in")[i].shape;
    let stride = 1, flat = IX.C(0);
    for (let j = shape.length - 1; j >= 0; j--) { flat = flat.add(IX.lift(idx[j]).mul(stride)); stride *= shape[j]; }
    return `(int)${bufName(i)}[${r(flat)}]`;
  };
  const ix = (e) => IX.emit(e, "c", (v) => v, ldSpell);
  // an index value is signed: floor division and modulo where a dividend may be negative
  const ixValue = (e) => { const v = IX.emit(e.e, "c", (n) => n, ldSpell, true); return e.dtype === "i64" ? `((long long)(${v}))` : e.dtype === "i32" ? `((int)(${v}))` : `((${v}) != 0)`; };
  const values = K.values ?? {};
  // ctx: the dtype a literal here must have (a typed function's operand dtype, or the target's)
  const fx = (e, ctx = "f32") => {
    if (e.k === "num") return ctx === "f32" ? flit(e.v, "c") : ilit(e, ctx);
    if (e.k === "var") return e.n;
    if (e.k === "ix") return ixValue(e);
    const spec = FNS[e.fn];
    const argCtx = (i) => (spec.args && spec.args !== "*" ? spec.args : !spec.args && (e.fn === "copy" || (e.fn === "select" && i > 0)) ? ctx : "f32");
    return fill(spec.c, e.a.map((a, i) => fx(a, argCtx(i))));
  };
  const typeOf = (n) => values[n] ?? "f32";
  const ins = K.params.filter((p) => p.role === "in");
  const lines = [];
  const storage = CUDA_STORAGE;
  const ctype = (p) => {
    const dtype = p.dtype || "f32";
    if (!Object.hasOwn(storage, dtype)) throw new TypeError(`CUDA storage dtype unsupported: ${dtype}`);
    return storage[dtype];
  };
  const out = K.params.find((p) => p.role === "out") || {};
  const types = [...ins, out].map((p) => p.dtype || "f32");
  if (types.includes("f16") || JSON.stringify(K.body).includes('"round_f16"')) lines.push("#include <cuda_fp16.h>");
  if (types.includes("bf16") || JSON.stringify(K.body).includes('"round_bf16"')) lines.push("#include <cuda_bf16.h>");
  if (JSON.stringify(K.body).includes('"round_tf32"')) lines.push(`__device__ __forceinline__ float kiln_round_tf32(float x) { unsigned b = __float_as_uint(x); if ((b & 0x7f800000u) == 0x7f800000u) return x; return __uint_as_float((b + 0xfffu + ((b >> 13) & 1u)) & 0xffffe000u); }`);
  const load = (dtype, expr) => dtype === "f16" ? `__half2float(${expr})` : dtype === "bf16" ? `__bfloat162float(${expr})` : dtype === "u8" ? `(float)${expr}` : expr;
  const store = (expr) => out.dtype === "f16" ? `__float2half_rn(${expr})` : out.dtype === "bf16" ? `__float2bfloat16_rn(${expr})` : expr;
  lines.push(`extern "C" __global__ void __launch_bounds__(${K.block}) ${cname(K.name)}(${[...ins.map((p, i) => `const ${ctype(p)}* __restrict__ src${i}`), `${ctype(out)}* __restrict__ dst`].join(", ")}) {`);
  lines.push(`    const int tid = threadIdx.x;`, `    const int bid = blockIdx.x;`);
  for (const s of K.smem) lines.push(`    __shared__ ${storage[s.dtype ?? "f32"]} ${s.name}[${s.size}];`);
  if (K.floats.length) lines.push(`    float ${K.floats.map((f) => `${f} = 0.0f`).join(", ")};`);
  const smemType = Object.fromEntries(K.smem.map((s) => [s.name, s.dtype ?? "f32"]));
  for (const dtype of new Set(Object.values(values))) lines.push(`    ${storage[dtype]} ${Object.keys(values).filter((n) => values[n] === dtype).map((n) => `${n} = 0`).join(", ")};`);
  if (K.ints.length) lines.push(`    int ${K.ints.map((v) => `${v} = 0`).join(", ")};`);
  const walk = (ss, pad) => {
    for (const s of ss) {
      switch (s.s) {
        case "let": lines.push(`${pad}${s.n} = ${fx(s.e, typeOf(s.n))};`); break;
        case "iset": lines.push(`${pad}${s.n} = ${ix(s.e)};`); break;
        case "load": lines.push(`${pad}${s.n} = ${load(ins[s.buf]?.dtype, `${bufName(s.buf)}[${ix(s.idx)}]`)};`); break;
        case "store": lines.push(`${pad}${bufName(s.buf)}[${ix(s.idx)}] = ${store(fx(s.e, ["i32", "i64", "bool"].includes(out.dtype) ? out.dtype : "f32"))};`); break;
        case "sload": lines.push(`${pad}${s.n} = ${s.arr}[${ix(s.idx)}];`); break;
        case "sstore": lines.push(`${pad}${s.arr}[${ix(s.idx)}] = ${fx(s.e, smemType[s.arr])};`); break;
        case "sync": lines.push(`${pad}__syncthreads();`); break;
        case "note": lines.push(`${pad}// ${s.text}`); break;
        case "for": lines.push(`${pad}for (int ${s.v} = ${ix(s.from)}; ${s.v} < ${ix(s.to)}; ${s.v} += ${ix(s.step)}) {`); walk(s.body, pad + "    "); lines.push(`${pad}}`); break;
        case "if": lines.push(`${pad}if (${ix(s.c)}) {`); walk(s.body, pad + "    "); lines.push(`${pad}}`); break;
      }
    }
  };
  walk(K.body, "    ");
  lines.push("}");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------- WGSL
// one dispatch per kernel; grids past 65535 workgroups fold into two dimensions
export function wgslUnavailableReason(K) {
  for (const parameter of K.params) {
    const dtype = parameter.dtype || "f32";
    const allowed = parameter.role === "in" ? ["f32", "u8"] : ["f32"];
    if (!allowed.includes(dtype)) return `WGSL storage dtype unsupported: ${dtype} (${parameter.role})`;
  }
  const expression = e => {
    if (e?.k === "ix") return "WGSL index values not implemented";
    if (!e || e.k !== "op") return null;
    if (!FNS[e.fn].w) return `WGSL scalar guarantee not implemented: ${e.fn}`;
    for (const a of e.a) { const why = expression(a); if (why) return why; }
    return null;
  };
  const statements = ss => {
    for (const s of ss) {
      const why = expression(s.e) || (s.body && statements(s.body));
      if (why) return why;
    }
    return null;
  };
  const unsupported = statements(K.body);
  if (unsupported) return unsupported;
  return null;
}
export function toWgsl(K) {
  const unavailable = wgslUnavailableReason(K);
  if (unavailable) throw new TypeError(unavailable);
  const ins = K.params.filter((p) => p.role === "in");
  const fv = (n) => "v_" + n, iv = (n) => (n === "tid" || n === "bid" ? n : "n_" + n);
  const bufName = (b) => (b === "out" ? "bout" : "b" + b);
  const ix = (e) => IX.emit(e, "wgsl", iv);
  const fx = (e) => (e.k === "num" ? flit(e.v, "w") : e.k === "var" ? fv(e.n) : fill(FNS[e.fn].w, e.a.map(fx)));
  const lines = [];
  if (JSON.stringify(K.body).includes('"round_tf32"')) lines.push(`fn kiln_round_tf32(x: f32) -> f32 {
  let bits = bitcast<u32>(x);
  if ((bits & 0x7f800000u) == 0x7f800000u) { return x; }
  return bitcast<f32>((bits + 0xfffu + ((bits >> 13u) & 1u)) & 0xffffe000u);
}`);
  if (JSON.stringify(K.body).includes('"round_bf16"')) lines.push(`fn kiln_round_bf16(x: f32) -> f32 {
    let bits = bitcast<u32>(x);
    if ((bits & 0x7fffffffu) > 0x7f800000u) { return bitcast<f32>((bits & 0xffff0000u) | 0x00400000u); }
    return bitcast<f32>((bits + 0x7fffu + ((bits >> 16u) & 1u)) & 0xffff0000u);
  }`);
  // WGSL has no 8-bit storage type: a u8 input binds as packed u32 words and is read through an unpack function
  ins.forEach((p, i) => lines.push(`@group(0) @binding(${i}) var<storage, read> b${i}: array<${p.dtype === "u8" ? "u32" : "f32"}>;`));
  lines.push(`@group(0) @binding(${ins.length}) var<storage, read_write> bout: array<f32>;`);
  ins.forEach((p, i) => p.dtype === "u8" && lines.push(`fn ld${i}(j: i32) -> f32 { let u = u32(j); return f32((b${i}[u >> 2u] >> ((u & 3u) * 8u)) & 0xffu); }`));
  for (const s of K.smem) lines.push(`var<workgroup> ${s.name}: array<f32, ${s.size}>;`);
  lines.push("", `@compute @workgroup_size(${K.block})`);
  lines.push(`fn main(@builtin(local_invocation_index) lid: u32, @builtin(workgroup_id) wid: vec3<u32>, @builtin(num_workgroups) nwg: vec3<u32>) {`);
  lines.push(`    let tid: i32 = i32(lid);`, `    let bid: i32 = i32(wid.x) + i32(wid.y) * i32(nwg.x);`, `    if (bid >= ${K.grid}i) { return; }`);
  for (const f of K.floats) lines.push(`    var ${fv(f)}: f32 = 0.0;`);
  const loopVars = new Set();
  const collect = (ss) => { for (const s of ss) { if (s.s === "for") { loopVars.add(s.v); collect(s.body); } else if (s.s === "if") collect(s.body); } };
  collect(K.body);
  for (const v of K.ints) if (!loopVars.has(v)) lines.push(`    var ${iv(v)}: i32 = 0i;`);
  const walk = (ss, pad) => {
    for (const s of ss) {
      switch (s.s) {
        case "let": lines.push(`${pad}${fv(s.n)} = ${fx(s.e)};`); break;
        case "iset": lines.push(`${pad}${iv(s.n)} = ${ix(s.e)};`); break;
        case "load": lines.push(`${pad}${fv(s.n)} = ${ins[s.buf]?.dtype === "u8" ? `ld${s.buf}(${ix(s.idx)})` : `${bufName(s.buf)}[${ix(s.idx)}]`};`); break;
        case "store": lines.push(`${pad}${bufName(s.buf)}[${ix(s.idx)}] = ${fx(s.e)};`); break;
        case "sload": lines.push(`${pad}${fv(s.n)} = ${s.arr}[${ix(s.idx)}];`); break;
        case "sstore": lines.push(`${pad}${s.arr}[${ix(s.idx)}] = ${fx(s.e)};`); break;
        case "sync": lines.push(`${pad}workgroupBarrier();`); break;
        case "note": lines.push(`${pad}// ${s.text}`); break;
        case "for": lines.push(`${pad}for (var ${iv(s.v)}: i32 = ${ix(s.from)}; ${iv(s.v)} < ${ix(s.to)}; ${iv(s.v)} = ${iv(s.v)} + ${ix(s.step)}) {`); walk(s.body, pad + "    "); lines.push(`${pad}}`); break;
        case "if": lines.push(`${pad}if ${ix(s.c)} {`); walk(s.body, pad + "    "); lines.push(`${pad}}`); break;
      }
    }
  };
  walk(K.body, "    ");
  lines.push("}");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------- SIMT simulator
// Runs one block at a time in lockstep: every statement executes for all active threads before the
// next one, with a mask for divergent branches and loops. That is exactly the semantics of a
// race-free, barrier-correct CUDA kernel. With `instrument`, it records what each warp did.
// Integer values (P3a, KILN-010): every temporary lives in a per-thread array of its static type
// (K.values: BigInt64Array for i64, Int32Array for i32, Uint8Array for bool), as do shared arrays
// (K.smem dtype) and the output buffer the caller passes. An assignment into int64 storage converts a
// number operand (a literal, an i32 select branch) to BigInt; reference values are BigInt there too.
const SIM_STORAGE = { f32: "Float32Array", i64: "BigInt64Array", i32: "Int32Array", bool: "Uint8Array" };
export function toSim(K, { instrument = false } = {}) {
  const T = K.block;
  const floats = K.floats, ints = K.ints, values = K.values ?? {};
  const outDtype = K.params.find((p) => p.role === "out")?.dtype || "f32";
  const smemType = Object.fromEntries(K.smem.map((s) => [s.name, s.dtype ?? "f32"]));
  const into = (dtype, x) => (dtype === "i64" ? `B64(${x})` : x);
  const inShapes = K.params.filter((p) => p.role === "in").map((p) => p.shape);
  const uniform = new Set(["bid"]);
  const perThreadInts = new Set(ints);
  let id = 0;
  const out = [];
  const L = (s) => out.push(s);
  const INLINE = { add: "+", sub: "-", mul: "*", div: "/" };
  const fexpr = (e) => (e.k === "num" ? (e.exact != null ? `(${e.exact}n)` : `(${+e.v})`) : e.k === "var" ? `F_${e.n}[t]` : e.k === "ix" ? ixValue(e) : INLINE[e.fn] && e.a.length === 2 ? `(${fexpr(e.a[0])} ${INLINE[e.fn]} ${fexpr(e.a[1])})` : `FN.${e.fn}(${e.a.map(fexpr).join(", ")})`);
  // active warps and lanes per mask, recounted only when a mask changes (instrumented runs)
  const recount = (md) => (instrument ? ` aw${md} = 0; al${md} = 0; for (let w = 0; w < T; w += 32) { let c = 0; const e = w + 32 < T ? w + 32 : T; for (let t = w; t < e; t++) c += ${md}[t]; al${md} += c; if (c) aw${md}++; }` : "");
  const iname = (v) => (v === "tid" ? "t" : v === "bid" ? "bid" : uniform.has(v) ? "u_" + v : `I_${v}[t]`);
  // a data-dependent index term reads an integer input at its row-major offset
  const ldSim = (i, idx, r) => {
    const shape = inShapes[i];
    let stride = 1, flat = IX.C(0);
    for (let j = shape.length - 1; j >= 0; j--) { flat = flat.add(IX.lift(idx[j]).mul(stride)); stride *= shape[j]; }
    return `Number(B[${i}][${r(flat)}])`;
  };
  const ix = (e) => IX.emit(e, "js", iname, ldSim);
  const ixValue = (e) => { const v = IX.emit(e.e, "js", iname, ldSim, true); return e.dtype === "i64" ? `BigInt(${v})` : `(${v})`; };
  const isUniform = (e) => [...IX.vars(e)].every((v) => uniform.has(v));
  const opFlops = (e) => (e.k === "op" ? (FNS[e.fn]?.flops ?? 1) + e.a.reduce((a, x) => a + opFlops(x), 0) : 0);
  let depth = 0;
  // Every per-thread statement becomes its own small function: V8 compiles small functions quickly and a
  // deopt stays local, where one huge function (a register-tiled matmul is ~1000 statements) takes seconds
  // to optimize and falls back to the interpreter when an untaken path deopts.
  const defs = [];
  const call = (body) => {
    const us = [...uniform].filter((v) => v !== "bid").map((v) => ", u_" + v).join("");
    const name = "S" + defs.length;
    defs.push(`function ${name}(B, M, bid${us}) { ${body} }`);
    L(`${name}(B, M, bid${us});`);
  };
  const gen = (ss, m) => {
    for (const s of ss) {
      const sid = id++;
      switch (s.s) {
        case "let": call(`for (let t = 0; t < T; t++) if (${m}[t]) F_${s.n}[t] = ${into(values[s.n], fexpr(s.e))};${instrument ? ` M.insC(aw${m}, al${m}, ${opFlops(s.e)});` : ""}`); break;
        case "iset": call(`for (let t = 0; t < T; t++) if (${m}[t]) I_${s.n}[t] = ${ix(s.e)};${instrument ? ` M.insC(aw${m}, al${m}, 0);` : ""}`); break;
        case "load":
          if (instrument) call(`const buf = B[${s.buf === "out" ? "OUT" : s.buf}]; for (let t = 0; t < T; t++) { if (${m}[t]) { const a = ${ix(s.idx)}; A[t] = a; if (a < 0 || a >= buf.length) M.oob(${sid}, a, "load"); F_${s.n}[t] = buf[a]; } else A[t] = -1; } M.gmem(A, "ld");`);
          else call(`const buf = B[${s.buf === "out" ? "OUT" : s.buf}]; for (let t = 0; t < T; t++) if (${m}[t]) F_${s.n}[t] = buf[${ix(s.idx)}];`);
          break;
        case "store":
          if (instrument) call(`const o = B[OUT]; for (let t = 0; t < T; t++) { if (${m}[t]) { const a = ${ix(s.idx)}; A[t] = a; if (a < 0 || a >= o.length) M.oob(${sid}, a, "store"); else { o[a] = ${into(outDtype, fexpr(s.e))}; M.cov[a] = 1; } } else A[t] = -1; } M.gmem(A, "st");`);
          else call(`const o = B[OUT]; for (let t = 0; t < T; t++) if (${m}[t]) o[${ix(s.idx)}] = ${into(outDtype, fexpr(s.e))};`);
          break;
        case "sload":
          if (instrument) call(`const sa = S.${s.arr}; for (let t = 0; t < T; t++) { if (${m}[t]) { const a = ${ix(s.idx)}; A[t] = a; if (a < 0 || a >= sa.length) M.oob(${sid}, a, "shared load"); F_${s.n}[t] = sa[a]; } else A[t] = -1; } M.smem(A);`);
          else call(`const sa = S.${s.arr}; for (let t = 0; t < T; t++) if (${m}[t]) F_${s.n}[t] = sa[${ix(s.idx)}];`);
          break;
        case "sstore":
          if (instrument) call(`const sa = S.${s.arr}; for (let t = 0; t < T; t++) { if (${m}[t]) { const a = ${ix(s.idx)}; A[t] = a; if (a < 0 || a >= sa.length) M.oob(${sid}, a, "shared store"); else sa[a] = ${into(smemType[s.arr], fexpr(s.e))}; } else A[t] = -1; } M.smem(A);`);
          else call(`const sa = S.${s.arr}; for (let t = 0; t < T; t++) if (${m}[t]) sa[${ix(s.idx)}] = ${into(smemType[s.arr], fexpr(s.e))};`);
          break;
        case "sync": if (instrument) L(`M.sync(${m}, ${sid});`); break;
        case "note": break;
        case "for": {
          const uni = isUniform(s.from) && isUniform(s.to) && isUniform(s.step);
          if (uni) {
            const head = `for (let u_${s.v} = ${ix(s.from)}; u_${s.v} < ${ix(s.to)}; u_${s.v} += ${ix(s.step)}) {`;
            uniform.add(s.v);
            L(head);
            gen(s.body, m);
            L("}");
            uniform.delete(s.v);
          } else {
            uniform.delete(s.v);
            perThreadInts.add(s.v);
            const md = `M${++depth}`;
            L(`for (let t = 0; t < T; t++) if (${m}[t]) I_${s.v}[t] = ${ix(s.from)};`);
            L(`for (;;) { let any = 0; for (let t = 0; t < T; t++) { const on = ${m}[t] && I_${s.v}[t] < ${ix(s.to)} ? 1 : 0; ${md}[t] = on; any |= on; } if (!any) break;${recount(md)}`);
            if (instrument) L(`M.div(${m}, ${md});`);
            gen(s.body, md);
            L(`for (let t = 0; t < T; t++) if (${md}[t]) I_${s.v}[t] += ${ix(s.step)}; }`);
            depth--;
          }
          break;
        }
        case "if": {
          const md = `M${++depth}`;
          L(`{ let any = 0; for (let t = 0; t < T; t++) { const on = ${m}[t] && (${ix(s.c)}) ? 1 : 0; ${md}[t] = on; any |= on; }${recount(md)}`);
          if (instrument) L(`M.div(${m}, ${md});`);
          L(`if (any) {`);
          gen(s.body, md);
          L(`} }`);
          depth--;
          break;
        }
      }
    }
  };
  gen(K.body, "M0");
  const maxDepth = (ss, d = 0) => ss.reduce((a, s) => Math.max(a, s.body ? maxDepth(s.body, d + (s.s === "if" || s.s === "for" ? 1 : 0)) : d), d);
  const nMasks = maxDepth(K.body) + 2;
  const nIn = K.params.filter((p) => p.role === "in").length;
  const head = [
    `const T = ${T}; const OUT = ${nIn};`,
    `const B64 = (v) => (typeof v === "bigint" ? v : BigInt(v));`,
    ...floats.map((f) => `const F_${f} = new Float32Array(T);`),
    ...Object.entries(values).map(([n, d]) => `const F_${n} = new ${SIM_STORAGE[d]}(T);`),
    ...[...perThreadInts].map((v) => `const I_${v} = new Int32Array(T);`),
    ...Array.from({ length: nMasks }, (_, i) => `const M${i} = new Uint8Array(T); let awM${i} = 0, alM${i} = 0;`),
    `const A = new Float64Array(T);`,
    `const S = { ${K.smem.map((s) => `${s.name}: new ${SIM_STORAGE[s.dtype ?? "f32"]}(${s.size})`).join(", ")} };`,
    ...defs,
    `return function run(B, blocks, M) {`,
    `  for (const bid of blocks) {`,
    `    M0.fill(1); awM0 = Math.ceil(T / 32); alM0 = T;`,
    `    if (M) M.block(bid);`,
  ];
  const src = [...head, ...out.map((l) => "    " + l), "  }", "};"].join("\n");
  const FN = Object.fromEntries(Object.entries(FNS).map(([k, v]) => [k, v.js]));
  const make = new Function("FN", src);
  const fnc = make(FN);
  fnc.source = src;
  return fnc;
}

// what one simulated run counts, per warp
export class SimMetrics {
  constructor(T, outSize) {
    this.T = T; this.cov = new Uint8Array(outSize);
    Object.assign(this, { ldReq: 0, ldSect: 0, stReq: 0, stSect: 0, shReq: 0, shWave: 0, flops: 0, warpInstr: 0, syncs: 0, divWarps: 0, branchWarps: 0, blocks: 0, oobs: [], badSyncs: [] });
  }
  block() { this.blocks++; }
  insC(aw, al, fl) { this.warpInstr += aw; this.flops += al * fl; }
  ins(m, fl) { const T = this.T; for (let w = 0; w < T; w += 32) { let c = 0; for (let t = w; t < w + 32 && t < T; t++) c += m[t]; if (c) { this.warpInstr++; this.flops += c * fl; } } }
  // memory transactions per warp request: distinct 32-byte sectors (8 floats) touched by the active lanes
  gmem(A, kind) {
    const T = this.T, sec = this._sec || (this._sec = new Float64Array(32));
    for (let w = 0; w < T; w += 32) {
      let n = 0;
      const e = w + 32 < T ? w + 32 : T;
      for (let t = w; t < e; t++) {
        const a = A[t];
        if (a < 0) continue;
        const sct = Math.floor(a / 8);
        let q = 0;
        while (q < n && sec[q] !== sct) q++;
        if (q === n) sec[n++] = sct;
      }
      if (n) { if (kind === "ld") { this.ldReq++; this.ldSect += n; } else { this.stReq++; this.stSect += n; } this.warpInstr++; }
    }
  }
  // shared-memory wavefronts per warp request: the most distinct addresses that fall in one of the 32 banks
  smem(A) {
    const T = this.T, addr = this._addr || (this._addr = new Float64Array(32 * 32)), cnt = this._cnt || (this._cnt = new Uint8Array(32));
    for (let w = 0; w < T; w += 32) {
      cnt.fill(0);
      let any = false, deg = 1;
      const e = w + 32 < T ? w + 32 : T;
      for (let t = w; t < e; t++) {
        const a = A[t];
        if (a < 0) continue;
        any = true;
        const b = a % 32, base = b * 32, c = cnt[b];
        let q = 0;
        while (q < c && addr[base + q] !== a) q++;
        if (q === c) { addr[base + c] = a; cnt[b] = c + 1; if (c + 1 > deg) deg = c + 1; }
      }
      if (any) { this.shReq++; this.shWave += deg; this.warpInstr++; }
    }
  }
  div(m, md) { const T = this.T; for (let w = 0; w < T; w += 32) { let a = 0, b = 0; for (let t = w; t < w + 32 && t < T; t++) { a += m[t]; b += md[t]; } if (a) { this.branchWarps++; if (b && b < a) this.divWarps++; } } }
  sync(m, sid) { this.syncs++; for (let t = 0; t < this.T; t++) if (!m[t]) { if (this.badSyncs.length < 5) this.badSyncs.push(sid); return; } }
  oob(sid, a, what) { if (this.oobs.length < 5) this.oobs.push({ sid, a, what }); }
}
