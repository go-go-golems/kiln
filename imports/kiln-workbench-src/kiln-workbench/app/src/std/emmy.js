// The standard six-IR pipeline, after the CloudRift / Emmy compiler:
//   torch (nn) ─d→ tensor ─o,l,f,s→ loop ─t→ tile ─k→ kernel ─c→ gpu (CUDA + WGSL)
import { k } from "../core/kiln.js";
import { nn, tensor, decomposition, optimization } from "./tensor.js";
import { loop, lift, fuse, stamp } from "./loop.js";
import { tile, tilePass, costPrior } from "./tile.js";
import { kern, kernelPass } from "./kernel.js";
import { gpu, emitPass } from "./program.js";
import { SPECS, target } from "./targets.js";

export const IRS = ["torch", "tensor", "loop", "tile", "kernel", "gpu"];
export function defaultDecide(store) {
  // pins, then measured evidence (this store, or the one the workbench passes in the run context),
  // then the cost model, then emission order
  const parts = [k.decide.pinned(), k.decide.evidence(store), costPrior, k.decide.first()];
  return k.decide.chain(...parts);
}
export function pipeline({ target: t = target(SPECS.rtx5090), store = null, name = "emmy" } = {}) {
  return k.pipeline(name)
    .describe("PyTorch-like ops → fused loop kernels → GPU schedules → CUDA and WGSL")
    .ir("torch", { dialects: [nn, tensor] })
    .pass(decomposition)
    .ir("tensor", { dialects: [tensor], strict: true })
    .pass(optimization).pass(lift).pass(fuse).pass(stamp)
    .ir("loop", { dialects: [loop, tensor], strict: true })
    .pass(tilePass)
    .ir("tile", { dialects: [tile, tensor], strict: true })
    .pass(kernelPass)
    .ir("kernel", { dialects: [kern, tensor], strict: true })
    .pass(emitPass)
    .ir("gpu", { dialects: [gpu, tensor], strict: true })
    .target(t)
    .decide(defaultDecide(store))
    .build();
}
export const passes = { decomposition, optimization, lift, fuse, stamp, tile: tilePass, kernel: kernelPass, emit: emitPass };
export const dialects = { nn, tensor, loop, tile, kernel: kern, gpu };
