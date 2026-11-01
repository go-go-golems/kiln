// KILN-011 implementation check: the CUDA division helpers exactly as fns.js CUDA_HELPERS spells them,
// host-compiled with gcc under UBSan (__device__ __forceinline__ -> static inline) and run on the
// PyTorch CPU expected values. Validates the C logic of the emitted text, not NVRTC code generation.
// Usage: node 06-host-check-emitted-cuda-helpers.mjs <repo root> <expected.json> <work dir>
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const [root, expected, work] = process.argv.slice(2);
const { CUDA_HELPERS } = await import(pathToFileURL(`${root}/packages/kiln/src/std/fns.js`).href);
const names = Object.keys(CUDA_HELPERS).filter((n) => /^kiln_(floordiv|remainder|truncdiv|fmod)_i(32|64)$/.test(n));
const defs = names.map((n) => CUDA_HELPERS[n].replace("__device__ __forceinline__", "static inline")).join("\n");
const call = (op) => `!strcmp(op, "${op}") ? (i64 ? kiln_${op}_i64(a, b) : kiln_${op}_i32((int)a, (int)b))`;
const src = `#include <stdio.h>
#include <string.h>
${defs}
int main(void) {
  char op[16], dt[8]; long long a, b, want; long n = 0, bad = 0;
  while (scanf("%15s %7s %lld %lld %lld", op, dt, &a, &b, &want) == 5) {
    int i64 = !strcmp(dt, "i64");
    long long got = ${["floordiv", "remainder", "truncdiv"].map(call).join(" : ")} : (i64 ? kiln_fmod_i64(a, b) : kiln_fmod_i32((int)a, (int)b));
    n++; if (got != want) { bad++; printf("MISMATCH %s %s %lld %lld got %lld want %lld\\n", op, dt, a, b, got, want); }
  }
  if (kiln_truncdiv_i64(-9223372036854775807LL - 1, -1) != -9223372036854775807LL - 1) { bad++; puts("MISMATCH trunc INT64_MIN/-1"); }
  if (kiln_truncdiv_i32(-2147483647 - 1, -1) != -2147483647 - 1) { bad++; puts("MISMATCH trunc INT32_MIN/-1"); }
  printf("%ld cases, %ld mismatches (%d helpers)\\n", n + 2, bad, ${names.length});
  return bad != 0;
}
`;
writeFileSync(`${work}/emitted-helpers.c`, src);
execFileSync("gcc", ["-O2", "-Wall", "-Werror", "-fsanitize=undefined", "-fno-sanitize-recover=all", "-o", `${work}/emitted-helpers`, `${work}/emitted-helpers.c`], { stdio: "inherit" });
const lines = [];
for (const c of JSON.parse(readFileSync(expected, "utf8"))) c.a.forEach((a, i) => lines.push(`${c.op} ${c.dtype} ${a} ${c.b[i]} ${c.want[i]}`));
process.stdout.write(execFileSync(`${work}/emitted-helpers`, { input: lines.join("\n") + "\n" }));
