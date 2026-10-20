/** W-26 Window similarity
 *  group  Real work
 *  about  the factory UI's similarity matrix (KILN-002 Example A): every pair of window vectors, X·Xᵀ, for one bucket of windows
 *  try    Compare the 256- and 768-dimension schedules | At which bucket does the tiled schedule stop fitting the default WebGPU limits?
 */
// factory-videos draws, for a run that embeds video windows, the cosine of every pair of windows (repeated work shows
// up as bright off-diagonal bands). Window vectors are unit length, so the matrix is X·Xᵀ for the n × d matrix X of
// rows. Shapes are compile-time constants, so the consumer pads n to the next bucket with zero rows: a zero row has a
// dot product of zero with everything, and the consumer reads only the top-left n × n block.
const NB = param.enum("windows", [256, 512, 1024, 1536, 2048, 2304], { default: 1536 });
const D = param.enum("dims", [256, 768], { default: 768 });

project("window-similarity")
  .params(NB, D)
  .program(({ x }) => ({ s: N.matmul(x, N.transpose(x, 0, 1)) }), ({ param }) => ({ x: k.tensor([param(NB), param(D)]) }));
