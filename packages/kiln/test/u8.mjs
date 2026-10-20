// 8-bit inputs and floor: the grey conversion of factory-videos' motion stage, compiled from u8 RGB, must equal
// the integer formula (9798R + 19235G + 3735B + 16384) >> 15 exactly, and fp32 kernel identities must not move.
import { k } from "../src/core/kiln.js";
import { Tensor, rng } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel, kernelInputs } from "../src/std/program.js";
import { bundle } from "../src/std/devices.js";
import { SPECS, target } from "../src/std/targets.js";

const T = target(SPECS.rtx5090);
const pipe = pipeline({ target: T });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

// floor in the reference interpreter
{
  const g = k.trace("floor", ({ x }) => N.floor(x), { x: k.tensor([8]) });
  const x = new Tensor([8], Float32Array.from([-2.5, -1, -0.25, 0, 0.25, 1, 1.75, 255.99]));
  const got = Array.from(g.eval({ x }).out.data);
  check(JSON.stringify(got) === JSON.stringify([-3, -1, -1, 0, 0, 1, 1, 255]), `floor evaluates: ${got.join(" ")}`);
}

// the grey program: every term is an integer below 2^24, so fp32 holds it exactly and the >> 15 is a floor of a
// multiplication by a power of two
const H = 48, W = 64;
const grey = k.trace("grey", ({ rgb }) => {
  const ch = (c) => N.reshape(N.slice(rgb, 2, c, c + 1), [H, W]);
  const s = N.add(N.add(N.add(N.mul(ch(0), 9798), N.mul(ch(1), 19235)), N.mul(ch(2), 3735)), 16384);
  return N.floor(N.mul(s, 1 / 32768));
}, { rgb: k.tensor([H, W, 3], "u8") });
const r = pipe.run(grey);
check(r.ok, `grey compiles${r.ok ? "" : ": " + r.error.message}`);
if (r.ok) {
  const prog = programOf(r.graph);
  check(prog.kernels.length === 1, `grey fuses into one kernel (${prog.kernels.length})`);
  const kn = prog.kernels[0];
  check(JSON.stringify(kn.inDtypes) === '["u8"]', `the kernel records its input dtype: ${JSON.stringify(kn.inDtypes)}`);
  check(kn.bytes === H * W * 3 + H * W * 4, `traffic counts one byte per u8 element: ${kn.bytes}`);
  check(/const unsigned char\* __restrict__ src0/.test(kn.cuda) && /\(float\)src0\[/.test(kn.cuda), "CUDA reads the input as unsigned char");
  check(/var<storage, read> b0: array<u32>/.test(kn.wgsl) && /fn ld0\(j: i32\) -> f32/.test(kn.wgsl) && /= ld0\(/.test(kn.wgsl), "WGSL binds packed words and unpacks through ld0");
  const seeded = kernelInputs(kn, 1)[0];
  check(seeded.every((v) => Number.isInteger(v) && v >= 0 && v <= 255), "seeded u8 inputs are whole numbers in 0..255");
  check(bundle([kn]).kernels[0].inputs[0].dtype === "u8", "the runner bundle carries the input dtype");
  const sim = simulateKernel(kn, T);
  check(sim.check.ok, `simulated kernel matches the loop reference (${sim.check.n} samples)`);

  // the exact formula over random colours, the extremes, and colours on the rounding boundaries
  const rnd = rng(7), data = new Float32Array(H * W * 3);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rnd() * 256);
  const fixed = [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [1, 1, 1], [128, 128, 128], [254, 255, 253]];
  fixed.forEach((c, p) => data.set(c, p * 3));
  const exact = (R, G, B) => (9798 * R + 19235 * G + 3735 * B + 16384) >> 15;
  for (const [name, ev] of [["frontend", (ins) => grey.eval(ins)], ["loop level", (ins) => r.at("loop").eval(ins)]]) {
    const out = ev({ rgb: new Tensor([H, W, 3], data) }).out.data;
    let bad = 0;
    for (let p = 0; p < H * W; p++) if (out[p] !== exact(data[3 * p], data[3 * p + 1], data[3 * p + 2])) bad++;
    check(bad === 0, `${name} evaluation equals the integer formula on ${H * W} pixels (${bad} differ)`);
  }
}

// fp32 identities are content addresses already stored in evidence; the dtype must not change any of them
{
  const golden = { softmax: ["307lrilpsx"], blur: ["gtseq05iy8"], attention: ["160ckx28ec8", "ylusrrd178", "typboubdt0"], layernorm: ["1a6noxftb1k"] };
  const progs = {
    softmax: k.trace("softmax", ({ x }) => N.softmax(x), { x: k.tensor([64, 512]) }),
    blur: k.trace("blur", ({ img }) => { let acc = null; for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) { const s = N.slice(N.slice(img, 0, dy, dy + 64), 1, dx, dx + 64); acc = acc ? N.add(acc, s) : s; } return N.mul(acc, 1 / 9); }, { img: k.tensor([66, 66]) }),
    attention: k.trace("attention", ({ q, kk, v }) => N.matmul(N.softmax(N.mul(N.matmul(q, N.transpose(kk)), 0.125)), v), { q: k.tensor([4, 64, 32]), kk: k.tensor([4, 64, 32]), v: k.tensor([4, 64, 32]) }),
    layernorm: k.trace("ln", ({ x }) => N.layer_norm(x, N.weight("g", [512]), N.weight("b", [512])), { x: k.tensor([64, 512]) }),
  };
  for (const [name, g] of Object.entries(progs)) {
    const ids = programOf(pipe.run(g).graph).kernels.map((kn) => kn.identity);
    check(JSON.stringify(ids) === JSON.stringify(golden[name]), `${name} identities unchanged: ${ids.join(" ")}`);
  }
}

if (failed) { console.log(`${failed} failed`); process.exitCode = 1; }
