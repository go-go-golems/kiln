/** W-12 Box blur, a stencil
 *  group  Write programs
 *  about  nine shifted slices summed: views compose into index maps, so the whole stencil is one kernel
 *  try    Make the radius a slider | Why is sectors per request above 4 here?
 */
// out[y, x] = mean of img[y + dy, x + dx] for dy, dx in 0..2r. Each shifted slice is a view (an index map,
// not a copy); the adds fuse; the kernel reads each input pixel from up to nine threads (L2 hits).
const H = param.int("height", { min: 32, max: 4096, default: 1024, scale: "log" });
const W = param.int("width", { min: 32, max: 4096, default: 1024, scale: "log" });
const r = param.int("radius", { min: 1, max: 3, default: 1 });

project("blur")
  .params(H, W, r)
  .program(({ img }, { param }) => {
    const h = param(H), w = param(W), k2 = 2 * param(r) + 1;
    let acc = null;
    for (let dy = 0; dy < k2; dy++) for (let dx = 0; dx < k2; dx++) {
      const s = N.slice(N.slice(img, 0, dy, dy + h), 1, dx, dx + w);
      acc = acc ? N.add(acc, s) : s;
    }
    return { out: N.mul(acc, 1 / (k2 * k2)) };
  }, ({ param }) => ({ img: k.tensor([param(H) + 2 * param(r), param(W) + 2 * param(r)]) }));
