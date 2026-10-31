// Bounded, declarative profitability programs. No eval, imports or tensor values.
const FEATURES=new Set(['originalWork','fusedWork','consumerCount','producerElements']);
const CONSUMER_FEATURES=new Set(['producerWork','consumerWork','fusedConsumerWork','consumerCount','producerElements','consumerElements']);
const COMPARISONS={lt:(a,b)=>a<b,le:(a,b)=>a<=b,gt:(a,b)=>a>b,ge:(a,b)=>a>=b,eq:(a,b)=>a===b};
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const exact=(x,names)=>object(x)&&Object.keys(x).length===names.length&&names.every(k=>Object.hasOwn(x,k));
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;

export function prepareFusionPolicy(policy,{maxNodes=31,maxDepth=6}={}) {
 if(!Number.isSafeInteger(maxNodes)||maxNodes<1||maxNodes>31||!Number.isSafeInteger(maxDepth)||maxDepth<1||maxDepth>6)throw new TypeError('Invalid hard program budget');
 if(!object(policy)||policy.format!=='kiln-fusion-policy/1'||typeof policy.id!=='string'||!/^[a-z0-9-]+$/.test(policy.id))throw new TypeError('Invalid fusion policy identity');
 const policyId=policy.id;
 const allowed=new Set(['format','id','kind','max_work_growth','tree','consumer_tree','provenance']);
 if(Object.keys(policy).some(k=>!allowed.has(k)))throw new TypeError('Unknown fusion policy field');
 if(policy.kind!=='selective'&&Object.hasOwn(policy,'consumer_tree'))throw new TypeError('Only selective policies can contain a consumer tree');
 let nodes=0;
 const leaf=(ratio,consumer=false)=>{
  if(!finite(ratio)||ratio>2)throw new TypeError('Threshold must be finite in [0,2]');
  return consumer ? features=>features.fusedConsumerWork<=features.consumerWork*ratio
    : features=>features.fusedWork<=features.originalWork*ratio;
 };
 const build=(node,depth,consumer=false)=>{
  if(++nodes>maxNodes||depth>maxDepth)throw new TypeError('Decision program exceeds node/depth budget');
  if(exact(node,['threshold']))return leaf(node.threshold,consumer);
  if(exact(node,['accept'])&&typeof node.accept==='boolean'){const accepted=node.accept;return ()=>accepted;}
  if(!exact(node,['if','then','else']))throw new TypeError('Invalid decision node');
  const predicate=node.if;
  if(!exact(predicate,['feature','op','value'])||!(consumer?CONSUMER_FEATURES:FEATURES).has(predicate.feature)||!Object.hasOwn(COMPARISONS,predicate.op)||!finite(predicate.value))throw new TypeError('Invalid decision predicate');
  const yes=build(node.then,depth+1,consumer),no=build(node.else,depth+1,consumer),compare=COMPARISONS[predicate.op],feature=predicate.feature,cutoff=predicate.value;
  return features=>compare(features[feature],cutoff)?yes(features):no(features);
 };
 let evaluate,selectConsumer=null;
 if(policy.kind==='unchanged') {
  if(Object.hasOwn(policy,'tree')||Object.hasOwn(policy,'max_work_growth'))throw new TypeError('Unchanged policy cannot contain a program');
  return Object.freeze({apply:false,nodeCount:0});
 }
 if(policy.kind==='threshold') {
  if(Object.hasOwn(policy,'tree'))throw new TypeError('Threshold policy cannot contain a tree');
  nodes=1;evaluate=leaf(policy.max_work_growth);
 }else if(policy.kind==='decision-tree'||policy.kind==='selective') {
  if(Object.hasOwn(policy,'max_work_growth'))throw new TypeError('Tree policy cannot contain a global threshold');
  evaluate=build(policy.tree,1);
  if(policy.kind==='selective') {
   const select=build(policy.consumer_tree,1,true);
   selectConsumer=features=>{
    for(const name of CONSUMER_FEATURES)if(!finite(features[name]))throw new TypeError('Invalid consumer feature: '+name);
    return select(features);
   };
  }
 }else throw new TypeError('Unknown policy kind');
 return Object.freeze({apply:true,nodeCount:nodes,selectConsumer,decide:features=>{
  for(const name of FEATURES)if(!finite(features[name]))throw new TypeError('Invalid compiler feature: '+name);
  if(features.fusedWork>2*features.originalWork)return `policy ${policyId}: hard work-growth budget exceeded`;
  return evaluate(features)||`policy ${policyId}: profitability rejected`;
 }});
}
