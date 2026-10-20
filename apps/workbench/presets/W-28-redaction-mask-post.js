/** W-28 Redaction mask post-processing
 *  group  Real work
 *  about  Playback's redaction masks (KILN-002 Example C): undo the letterbox, Gaussian-smooth and re-threshold every person mask, bit-exact with OpenCV
 *  try    Compare the separable and the direct form | How many kernels does each form compile to, and why?
 */
// The segmentation engine returns one 640 × 640 mask per person on its letterboxed canvas, already thresholded to
// {0, 1} on the GPU. Playback then, per mask, crops the content rectangle and resizes it back to the inference size with
// INTER_NEAREST, and smooths it: GaussianBlur(255·m, σ = 2) ≥ 128. OpenCV blurs 8-bit images in fixed point with the
// 13 weights k/256 below (σ = 2; recovered from an impulse, KILN-002 C2), so the blurred value is 255·S/65536 for the
// integer S = Σ k_i k_j m, and "≥ 128 after rounding" is exactly S ≥ 32768. Every S fits fp32's 24-bit significand,
// so these kernels agree with OpenCV bit for bit. Shapes are compile-time constants: the engine pads its kept masks to
// a bucket with zero masks and reads the first n outputs.
const NB = param.enum("detections", [1, 2, 4, 8, 16, 32, 64, 100], { default: 8 });
const G = param.enum("geometry", ["768x416", "640x480", "768x576"], { default: "768x416" });
const F = param.enum("form", ["separable", "direct"], { default: "separable" });
const K = [1, 2, 7, 16, 31, 45, 52, 45, 31, 16, 7, 2, 1];
const R = (K.length - 1) / 2;

project("redaction-mask-post")
  .params(NB, G, F)
  .program(({ masks }, { param }) => {
    const n = param(NB), [W, H] = param(G).split("x").map(Number);
    // the letterbox of trt_engine._letterbox_into, and _unletterbox_mask's nearest-neighbour source pixel
    const scale = Math.min(640 / W, 640 / H), nw = Math.round(W * scale), nh = Math.round(H * scale);
    const px = (640 - nw) >> 1, py = (640 - nh) >> 1;
    const srcY = (y) => y.mul(nh).div(H).add(py), srcX = (x) => x.mul(nw).div(W).add(px);
    // cv2's BORDER_REFLECT_101: -1 → 1, len → len - 2
    const reflect = (i, len) => { const a = i.max(i.mul(-1)); return a.min(a.mul(-1).add(2 * (len - 1))); };
    const at = (i, off, len) => (off === 0 ? i : reflect(i.add(off), len));
    const shifted = (dy, dx) => T.view(masks, [n, H, W], ([d, y, x]) => [d, srcY(at(y, dy, H)), srcX(at(x, dx, W))]);
    let s = null;
    if (param(F) === "direct") {
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const term = N.mul(shifted(i, j), K[i + R] * K[j + R]);
        s = s ? N.add(s, term) : term;
      }
    } else {
      let h = null;
      for (let j = -R; j <= R; j++) { const term = N.mul(shifted(0, j), K[j + R]); h = h ? N.add(h, term) : term; }
      for (let i = -R; i <= R; i++) {
        const term = N.mul(T.view(h, [n, H, W], ([d, y, x]) => [d, at(y, i, H), x]), K[i + R]);
        s = s ? N.add(s, term) : term;
      }
    }
    return { out: N.gt(s, 32767.5) };
  }, ({ param }) => ({ masks: k.tensor([param(NB), 640, 640], "u8") }));
