// Local additive fusion-region planner. This minimizes a declared work model,
// not measured latency. Shared producer removal is evaluated jointly.
const nonnegative=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
export function chooseFusionSubset(region, options={}) {
  if(!options||typeof options!=="object"||Array.isArray(options)||Object.keys(options).some(k=>!["launchWork","materializationWork","maxWorkGrowth"].includes(k)))throw new TypeError("Invalid fusion planner options");
  const {launchWork=0,materializationWork=0,maxWorkGrowth=1.02}=options;
  if(![launchWork,materializationWork,maxWorkGrowth].every(nonnegative))throw new TypeError("Fusion planner weights must be finite and nonnegative");
  if(!region||!nonnegative(region.producerWork)||!nonnegative(region.producerElements)||!Array.isArray(region.consumers)||!region.consumers.length)throw new TypeError("Invalid fusion region");
  for(const edge of region.consumers)if(!edge||![edge.consumerWork,edge.fusedConsumerWork,edge.consumerElements].every(nonnegative))throw new TypeError("Invalid fusion consumer costs");
  const edges=region.consumers,m=edges.length;
  const baseWork=region.producerWork+edges.reduce((s,e)=>s+e.consumerWork,0);
  const consumerElements=edges.reduce((s,e)=>s+e.consumerElements,0);
  const originalElements=region.producerElements+consumerElements;
  const originalScore=baseWork+launchWork*(m+1)+materializationWork*originalElements;
  if(![baseWork,originalElements,originalScore].every(nonnegative))throw new TypeError("Fusion model cost overflow");
  let chosen=[],bestScore=originalScore;
  const consider=indices=>{
    if(!indices.length)return;
    const removed=indices.length===m;
    const selected=new Set(indices);
    const work=(removed?0:region.producerWork)+edges.reduce((s,edge,i)=>s+(selected.has(i)?edge.fusedConsumerWork:edge.consumerWork),0);
    const score=work+launchWork*(m+(removed?0:1))+materializationWork*(removed?consumerElements:originalElements);
    if(!Number.isFinite(score)||!Number.isFinite(work))throw new TypeError("Fusion model cost overflow");
    if(work<=baseWork*maxWorkGrowth&&score<bestScore){chosen=indices;bestScore=score;}
  };
  // Keep the original graph on ties. Prefer complete fusion over a tied partial
  // plan. A partial plan has identical launch/materialization terms regardless
  // of its subset, so including all negative deltas minimizes its work term.
  consider(edges.map((_,i)=>i));
  consider(edges.flatMap((edge,i)=>edge.fusedConsumerWork<edge.consumerWork?[i]:[]));
  return Object.freeze(chosen);
}
