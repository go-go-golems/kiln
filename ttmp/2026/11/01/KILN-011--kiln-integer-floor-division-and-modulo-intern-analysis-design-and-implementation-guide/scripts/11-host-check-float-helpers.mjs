// KILN-011 Phase 3: the f32 CUDA spellings (kiln_floordiv_f32, kiln_remainder_f32, fmodf, truncf(a / b))
// host-compiled with gcc (float arithmetic, no fast-math) and compared bit for bit with the fns.js
// references on the 09-torch-expected-float.py inputs. NaNs compare equal to NaNs.
// Usage: node 11-host-check-float-helpers.mjs <repo root> <expected.json> <work dir>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const [root, expected, work] = process.argv.slice(2);
const { FNS, CUDA_HELPERS } = await import(pathToFileURL(`${root}/packages/kiln/src/std/fns.js`).href);
const c = (op) => FNS[op].c.replace("{0}", "a").replace("{1}", "b");
const src = `#include <stdio.h>
#include <string.h>
#include <math.h>
${["kiln_floordiv_f32", "kiln_remainder_f32"].map((h) => CUDA_HELPERS[h].replace("__device__ __forceinline__", "static inline")).join("\n")}
static unsigned bits(float x) { unsigned u; memcpy(&u, &x, 4); return u; }
static float fl(int b) { float x; memcpy(&x, &b, 4); return x; }
int main(void) {
  int ab, bb; while (scanf("%d %d", &ab, &bb) == 2) { float a = fl(ab), b = fl(bb);
    printf("%u %u %u %u\\n", bits(${c("floordiv")}), bits(${c("remainder")}), bits(${c("fmod")}), bits(${c("truncdiv")})); }
  return 0;
}
`;
writeFileSync(`${work}/float-helpers.c`, src);
execFileSync("gcc", ["-O2", "-Wall", "-Werror", "-o", `${work}/float-helpers`, `${work}/float-helpers.c`, "-lm"], { stdio: "inherit" });
const e = JSON.parse(readFileSync(expected, "utf8"));
const rows = execFileSync(`${work}/float-helpers`, { input: e.a.map((a, i) => `${a} ${e.b[i]}`).join("\n") + "\n", maxBuffer: 1 << 28 }).toString().trim().split("\n");
const U = new Uint32Array(1), F = new Float32Array(U.buffer), I = new Int32Array(U.buffer);
const fromU = (u) => { U[0] = u; return F[0]; }, fromI = (b) => { I[0] = b; return F[0]; };
const same = (x, y) => (Number.isNaN(x) && Number.isNaN(y)) || Object.is(x, y);
const ops = ["floordiv", "remainder", "fmod", "truncdiv"], bad = Object.fromEntries(ops.map((o) => [o, 0]));
rows.forEach((row, i) => row.split(" ").forEach((u, j) => {
  const want = FNS[ops[j]].js(fromI(e.a[i]), fromI(e.b[i]));
  if (!same(fromU(+u), want) && bad[ops[j]]++ < 3) console.log("MISMATCH", ops[j], fromI(e.a[i]), fromI(e.b[i]), "c", fromU(+u), "js", want);
}));
console.log(JSON.stringify({ cases: rows.length, mismatches: bad }));
process.exit(Object.values(bad).some(Boolean) ? 1 : 0);
