// The spec the compiler sees for a CUDA device: cudaTarget picks the spec whose compute capability matches the runner's
// device report, and falls back to the RTX 5090's only for a capability no spec names. A GB10 fell back until it had a
// spec of its own, and was modelled with seven times its memory bandwidth.
import { cudaTarget } from "../src/std/devices.js";
import { SPECS } from "../src/std/targets.js";

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };

{
  const gb10 = cudaTarget({ cc: "12.1", sms: 48, smemPerBlock: 49152 }, "NVIDIA GB10");
  check(gb10.id === "gb10" && gb10.bwGBs === SPECS.gb10.bwGBs && gb10.name === "NVIDIA GB10", `a GB10 report (cc 12.1) gets the gb10 spec: ${gb10.id}, ${gb10.bwGBs} GB/s`);
  check(cudaTarget({ cc: "12.0", sms: 170 }, "RTX 5090").id === "rtx5090", "cc 12.0 gets the RTX 5090 spec");
  const other = cudaTarget({ cc: "7.5", sms: 40 }, "T4");
  check(other.id === "rtx5090" && other.sms === 40, "an unknown capability gets the RTX 5090 spec with the report's SM count");
  // cudaTarget takes the first match, so two specs of one capability would hide the second
  const caps = Object.values(SPECS).map((s) => s.sm);
  check(new Set(caps).size === caps.length, `every spec has its own compute capability: ${caps.join(" ")}`);
}

console.log(fails ? `${fails} FAILED` : "all target checks pass");
process.exitCode = fails ? 1 : 0;
