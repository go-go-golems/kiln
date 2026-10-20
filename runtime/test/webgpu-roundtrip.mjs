// The TypeScript WebGPU launcher, in headless Chrome on this machine's GPU: every fixture case is loaded with
// KilnWebGpuProgram, its inputs regenerated in the page, and its outputs compared with the reference evaluator.
// Not part of `pnpm test`: it needs a GPU. Exits 0 with a message when the page has no WebGPU.
//   node runtime/test/webgpu-roundtrip.mjs [--fixtures DIR]     (fixtures are rebuilt when DIR is not given)
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "../../scripts/shoot.mjs";
import { CASES, buildCase, gen } from "./fixtures.mjs";

const args = process.argv.slice(2);
const fixAt = args.indexOf("--fixtures");
const work = mkdtempSync(join(tmpdir(), "kiln-webgpu-"));
const cases = fixAt >= 0
  ? readdirSync(args[fixAt + 1]).filter((n) => n.endsWith(".program.json")).map((n) => ({ program: JSON.parse(readFileSync(join(args[fixAt + 1], n), "utf8")), expect: JSON.parse(readFileSync(join(args[fixAt + 1], n.replace(".program.", ".expect.")), "utf8")) }))
  : CASES.map(buildCase);

// the page: the launcher with its types stripped, plus the input generator, as one module
const launcher = stripTypeScriptTypes(readFileSync(new URL("../webgpu/launch.ts", import.meta.url), "utf8"));
writeFileSync(join(work, "page.html"), `<!doctype html><meta charset="utf-8"><title>kiln launcher</title><script type="module">
${launcher}
${gen.toString()}
window.__launch = { KilnWebGpuProgram, unsupportedReason, gen };
window.__ready = true;
</script>`);

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
try {
  await withPage({ url: pathToFileURL(join(work, "page.html")).href, webgpu: true, timeout: 600000 }, async (p) => {
    await p.until("window.__ready === true", 30000);
    const adapter = await p.eval(`(async () => { const a = await navigator.gpu?.requestAdapter(); if (!a) return null; window.__device = await a.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize } }); return a.info?.description || a.info?.vendor || "adapter"; })()`);
    if (!adapter) { console.log("no WebGPU adapter in this browser: skipped"); return; }
    console.log(`adapter: ${adapter}`);
    for (const { program, expect } of cases) {
      const res = await p.eval(`(async () => {
        const { KilnWebGpuProgram, gen } = window.__launch, program = ${JSON.stringify(program)}, expect = ${JSON.stringify(expect)};
        const prog = await KilnWebGpuProgram.create(window.__device, program);
        const inputs = Object.fromEntries(program.inputs.map((t) => [t.name, gen(t.dtype, t.shape.reduce((a, b) => a * b, 1), expect.seeds[t.name])]));
        const t0 = performance.now();
        const out = await prog.run(inputs);
        const ms = performance.now() - t0;
        const t1 = performance.now();
        await prog.run(inputs);
        const warm = performance.now() - t1;
        const report = {};
        for (const [name, e] of Object.entries(expect.expect)) {
          let bad = 0, maxAbs = 0, first = null;
          e.indices.forEach((i, j) => { const got = out[name][i], want = e.values[j], d = Math.abs(got - want); maxAbs = Math.max(maxAbs, d); if (!(d <= 1e-4 + 1e-3 * Math.abs(want))) { bad++; first ??= { i, got, want }; } });
          report[name] = { n: e.indices.length, bad, maxAbs, first };
        }
        prog.destroy();
        return { ms, warm, report };
      })()`);
      for (const [name, r] of Object.entries(res.report)) check(r.bad === 0, `${program.name}.${name}: ${r.n} values, max |Δ| ${r.maxAbs.toExponential(2)}, ${r.bad} outside rtol 1e-3 / atol 1e-4${r.first ? ` (first at ${r.first.i}: ${r.first.got} vs ${r.first.want})` : ""}; first run ${res.ms.toFixed(1)} ms, second ${res.warm.toFixed(1)} ms`);
    }
    // a program the device cannot hold is refused before any dispatch, with the limit named
    const refused = await p.eval(`(async () => { const { KilnWebGpuProgram } = window.__launch; const p = ${JSON.stringify(cases[0].program)}; try { await KilnWebGpuProgram.create(window.__device, { ...p, kernels: p.kernels.map((k) => ({ ...k, block: 1 << 20 })) }); return null; } catch (e) { return e.message; } })()`);
    check(/threads per workgroup exceeds/.test(refused || ""), `an oversized workgroup is refused: ${refused}`);
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (fails) { console.log(`${fails} failed`); process.exitCode = 1; }
