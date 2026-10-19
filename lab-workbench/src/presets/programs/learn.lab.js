// Educational walkthroughs. Every value here is illustrative: computed from a small fixture,
// never recovered GPU state. Parameters change the example, not a measurement.
const FUSION = src('d59d9ad0:services/detection/src/detection/backends/grounding_dino_fusion.py#_make_source');
const NORM = src('3496baed:spikes/19-embedding-comparison/optimization/norm.py#norm_kernel');

return lab('Learn the math')
  .board('bilinear', b => {
    const a = b.param('a', slider({ min: 0, max: 1, step: 0.05 }).label('x offset a').default(0.25));
    const y = b.param('b', slider({ min: 0, max: 1, step: 0.05 }).label('y offset b').default(0.5));
    b.title('Bilinear sampling')
     .subtitle('Four reads, four weights, one sum')
     .add(note('For a non-integer position $(x, y)$ take $x_0=\\lfloor x\\rfloor$, $y_0=\\lfloor y\\rfloor$, $a=x-x_0$, $b=y-y_0$. For an interior point $$v=(1-a)(1-b)\\,v_{00}+a(1-b)\\,v_{10}+(1-a)\\,b\\,v_{01}+ab\\,v_{11}.$$ With $a=0.25$, $b=0.5$ the weights are $0.375, 0.125, 0.375, 0.125$ and $v=7$.'))
     .add(stepper(algo.bilinear({ v: [[2, 6], [10, 14]], a, b: y })).implements(FUSION));
  })
  .board('reduction', b => {
    const mode = b.param('mode', toggle(['unfused', 'fused']).label('Dataflow').default('unfused'));
    const levels = b.param('levels', slider({ min: 1, max: 4, step: 1 }).label('Levels').default(4));
    b.title('Weighted reduction, fused or not')
     .subtitle('Fusion removes the global stores and loads of the sampled intermediate')
     .add(math('o_{qhc}=\\sum_{l=1}^{L}\\sum_{p=1}^{P} w_{qhlp}\\,v_{qhlpc}', { caption: 'One query $q$, head $h$ and channel $c$ (intern guide §5.1). The formula fixes the arithmetic, not the floating-point reduction order.' }))
     .add(stepper(algo.weightedReduction({ levels, points: 4 })).compare(mode).implements(FUSION));
  })
  .board('rmsnorm', b => {
    const xs = b.param('x', select([
      { value: '1,2,3,4', label: '[1, 2, 3, 4]' },
      { value: '0.5,-1,2,8', label: '[0.5, −1, 2, 8]' },
      { value: '3,3,3,3,3,3,3,3', label: 'eight × 3' },
    ]).label('Row x').default('1,2,3,4'));
    const eps = b.param('eps', number({ min: 0, max: 0.1, step: 0.001 }).label('ε').default(0));
    b.title('RMSNorm and reduction order')
     .subtitle('Casts and the reduction tree are where low-order bits move')
     .add(stepper(algo.rmsnorm({ x: live($ => $(xs).split(',').map(Number)), eps }))
       .implements(NORM)
       .caveat('Width 4 is outside the kernel guard: this teaches the formula, not the qualified kernel.'))
     .add(note('With $x=[1,2,3,4]$, $\\epsilon=0$ and unit weights, $m=7.5$ and $r\\approx 0.365148$. Floating-point addition is not associative: $(a+b)+c$ and $a+(b+c)$ can differ in the last bits, so the reduction tree is part of the contract.'));
  })
  .board('tiling', b => {
    const tile = b.param('tile', toggle([16, 32, 64]).label('Tile').default(32));
    b.title('Tiled matrix multiplication')
     .subtitle('Reuse grows with the tile; a model of traffic, not a measurement')
     .add(stepper(algo.matmulTiles({ M: 128, N: 128, K: 64, tile })))
     .add(math('P\\le\\min\\bigl(P_{\\mathrm{compute}},\\; I_{\\mathrm{mem}}\\,B_{\\mathrm{mem}}\\bigr),\\qquad I=\\frac{\\text{operations}}{\\text{bytes moved at one memory level}}', { caption: 'A roofline bound (intern guide §5.3): $I$ and $B$ must refer to the same memory level, and a theoretical bound is not a measurement.' }));
  });
