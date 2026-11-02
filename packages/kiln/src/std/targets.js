// Device specs. Numbers are approximate public figures (boost clocks, FP32 non-tensor-core peak);
// the simulator's timing model uses them, so they set the scale, not exact microseconds.
// smemPerBlock is 48 KiB everywhere: the generated CUDA declares shared memory statically, and a
// static __shared__ array over 48 KiB does not compile.
// l2GBs, where present, is measured L2 read bandwidth (gb10: probe 671, 1-4 MB resident buffers);
// targets without it use 3x bwGBs.
// mma (KILN-006), where present: dense tensor-core TFLOP/s with FP32 accumulation per operand precision,
// { tf32, f16, bf16 }. No spec carries it yet: a rate enters only once measured on the device (the KILN-006 Phase 0
// probe; GB10's are not published), as peakTflops did. Without it the cost model never ranks MAP=mma above another
// mapping (tile.js costPrior), and estimates a pinned mma kernel at peakTflops. For reference, NVIDIA's A100
// datasheet gives 156 (TF32) and 312 (f16, bf16) dense; GeForce parts publish lower f16 rates with FP32 accumulate.
// (Adding the field to a spec also changes specHash and so the content ids of records simulated on it.)
export const SPECS = {
  rtx5090: { id: "rtx5090", name: "RTX 5090", arch: "Blackwell sm_120", sm: 120, sms: 170, clockGHz: 2.41, peakTflops: 104.8, bwGBs: 1792, l2MB: 96, smemPerSM: 128 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 1536, maxBlocksPerSM: 24, regsPerSM: 65536, launchUs: 2.5 },
  rtx4090: { id: "rtx4090", name: "RTX 4090", arch: "Ada sm_89", sm: 89, sms: 128, clockGHz: 2.52, peakTflops: 82.6, bwGBs: 1008, l2MB: 72, smemPerSM: 100 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 1536, maxBlocksPerSM: 24, regsPerSM: 65536, launchUs: 2.5 },
  h100: { id: "h100", name: "H100 SXM", arch: "Hopper sm_90", sm: 90, sms: 132, clockGHz: 1.98, peakTflops: 67, bwGBs: 3350, l2MB: 50, smemPerSM: 228 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 2048, maxBlocksPerSM: 32, regsPerSM: 65536, launchUs: 2.5 },
  a100: { id: "a100", name: "A100 80GB", arch: "Ampere sm_80", sm: 80, sms: 108, clockGHz: 1.41, peakTflops: 19.5, bwGBs: 2039, l2MB: 40, smemPerSM: 164 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 2048, maxBlocksPerSM: 32, regsPerSM: 65536, launchUs: 2.5 },
  // Measured, not public: runner/docker/kiln-probe on an idle DGX Spark (2026-10-20). peakTflops is the best FMA rate,
  // 98 % of 48 SMs x 128 FP32 lanes x 2 flops x the 2.41 GHz nvidia-smi reports under load; bwGBs the best read rate,
  // 95 % of the 273 GB/s of 256-bit LPDDR5x at 8533 MT/s; launchUs an empty kernel between two events, as the runner
  // times a kernel.
  gb10: { id: "gb10", name: "DGX Spark (GB10)", arch: "Blackwell sm_121", sm: 121, sms: 48, clockGHz: 2.418, peakTflops: 28.9, bwGBs: 259, l2GBs: 10500, l2MB: 24, smemPerSM: 100 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 1536, maxBlocksPerSM: 24, regsPerSM: 65536, launchUs: 2.4 },
  orin: { id: "orin", name: "Orin Nano class", arch: "Ampere sm_87 (edge)", sm: 87, sms: 8, clockGHz: 0.625, peakTflops: 1.28, bwGBs: 68, l2MB: 2, smemPerSM: 164 * 1024, smemPerBlock: 48 * 1024, maxThreadsPerBlock: 1024, maxThreadsPerSM: 1536, maxBlocksPerSM: 16, regsPerSM: 65536, launchUs: 5 },
};
// WebGPU's guaranteed limits are smaller than CUDA's; the real adapter may raise them
export const WEBGPU_DEFAULT = { id: "webgpu", name: "WebGPU (default limits)", arch: "browser", sm: 0, sms: 16, clockGHz: 1.5, peakTflops: 10, bwGBs: 300, l2MB: 4, smemPerSM: 32768, smemPerBlock: 16384, maxThreadsPerBlock: 256, maxThreadsPerSM: 1024, maxBlocksPerSM: 8, regsPerSM: 65536, launchUs: 15 };
export const target = (spec) => ({ ...spec, warp: 32 });
