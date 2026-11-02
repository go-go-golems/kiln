// Reference-only error function. Integrate its defining Gaussian integral with
// independently generated 32-point Gauss-Legendre quadrature. CUDA uses erff;
// no polynomial, coefficients or implementation is ported from another library.
const quadrature = Array.from({ length: 16 }, (_, i) => {
  let z = Math.cos(Math.PI * (i + 0.75) / 32.5), derivative;
  for (let iteration = 0; iteration < 20; iteration++) {
    let previous = 1, current = z;
    for (let degree = 2; degree <= 32; degree++) {
      const next = ((2 * degree - 1) * z * current - (degree - 1) * previous) / degree;
      previous = current; current = next;
    }
    derivative = 32 * (z * current - previous) / (z * z - 1);
    const delta = current / derivative;
    z -= delta;
    if (Math.abs(delta) < 1e-15) return { z, weight: 2 / ((1 - z * z) * derivative * derivative) };
  }
  throw new Error("Error-function quadrature did not converge");
});

export function erf(x) {
  if (x === 0 || Number.isNaN(x)) return x;
  const a = Math.abs(x);
  // erfc(7) is below double-precision spacing at one.
  if (a >= 7) return Math.sign(x);
  let integral = 0;
  for (const { z, weight } of quadrature) {
    const left = a * (1 - z) / 2, right = a * (1 + z) / 2;
    integral += weight * (Math.exp(-left * left) + Math.exp(-right * right));
  }
  return Math.sign(x) * Math.min(1, a * integral / Math.sqrt(Math.PI));
}
