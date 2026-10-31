#!/usr/bin/env python3
"""Bind reported numerical/coverage facts to exact run and committed source evidence."""
import ast,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(d for d in p.parents if (d/'integrations/passnet').exists());s=p/'sources'
load=lambda name:json.loads((s/name).read_text())
run=load('separate-rounding-cohort-v1/run.json');audit=load('separate-rounding-cohort-v1-audit.json');coverage=load('kiln-coverage.json');oracle=load('contraction-cuda.json');opportunities=load('training-loop-opportunities.json')
assert run['status']=='complete' and run['plan']['contraction']=='separate'
assert [r['index'] for r in run['records']]==[51,60,82,182]
assert all(r['status']=='process_complete' and all(v['returncode']==0 for v in r['phases']) for r in run['records'])
assert (audit['tasks_expected'],audit['graphs_expected'],audit['tasks_nominal_accepted'],audit['graphs_nominal_accepted'],audit['unexecuted_graphs'])==(4,63,3,62,0)
assert (coverage['tasks_verified'],coverage['graphs_verified'],coverage['graphs_in_complete_tasks'])==(11,206,141)
assert oracle['status']=='passed' and [r['actual'] for r in oracle['records']]==[-2**-46,0.0]
revision='a620e6e';mismatches=[];matched=0
for relative,digest in run['source_snapshot']['files'].items():
 result=subprocess.run(['git','show',revision+':'+relative],cwd=repo,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if not result.returncode and hashlib.sha256(result.stdout).hexdigest()==digest:matched+=1;continue
 archived=s/'remote-snapshot-a620e6e'/relative
 if not archived.is_file() or hashlib.sha256(archived.read_bytes()).hexdigest()!=digest:raise ValueError('Unreconstructible remote source: '+relative)
 mismatches.append({'path':relative,'archive':str(archived.relative_to(s)),'sha256':digest})
class ExecutedCudaTree(ast.NodeTransformer):
 def visit_ClassDef(self,node):
  if node.name=='WgpuProgram':return None
  return self.generic_visit(node)
 def visit_Expr(self,node):
  if isinstance(node.value,ast.Constant) and isinstance(node.value.value,str):return None
  return self.generic_visit(node)
runtime='runtime/python/kiln_launch.py'
committed=subprocess.check_output(['git','show',revision+':'+runtime],cwd=repo).decode()
actual=(s/'remote-snapshot-a620e6e'/runtime).read_text()
normalize=lambda text:ast.dump(ExecutedCudaTree().visit(ast.parse(text)),include_attributes=False)
if normalize(committed)!=normalize(actual):raise ValueError('Executed CUDA/runtime helper code differs from declared revision')
for case in run['records']:
 corpus=s/'separate-rounding-cohort-v1'/case['directory']/'corpus'
 for compiled in json.loads((corpus/'compile-receipt.json').read_text()):
  assert compiled['returncode']==0
  assert json.loads((corpus/compiled['artifact']).read_text())['source']['contraction']=='separate'
aligned=load('aligned-source-snapshot.json')
for relative,digest in aligned['files'].items():
 committed=subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)
 if hashlib.sha256(committed).hexdigest()!=digest:raise ValueError('Future source alignment failed: '+relative)
files=['aligned-source-snapshot.json','separate-rounding-cohort-v1/run.json' ,'separate-rounding-cohort-v1-audit.json','kiln-coverage.json','contraction-cuda.json','contraction-cuda-validation.log','contraction-python-tests.log','training-loop-opportunities.json']
counts={mode:{key:sum(r[mode][key] for r in opportunities['records']) for key in ['kernels','multiConsumer','reductions','removableExactDuplicates']} for mode in ['default','unfused']}
facts={'format':'kiln-contraction-milestone/1','code_revision':revision,'remote_snapshot_matches_committed_sources':not mismatches,'snapshot_source_files_checked':len(run['source_snapshot']['files']),'snapshot_sources_matching_commit':matched,'archived_source_overrides':mismatches,'cuda_runtime_ast_matches_commit_excluding_webgpu_and_docstrings':True,'source_snapshot_sha256':run['source_snapshot']['sha256'],'future_aligned_snapshot_sha256':aligned['sha256'],'future_aligned_files_matching_commit':len(aligned['files']),'nominal_tolerance':-5,'cohort_tasks':4,'cohort_graphs':63,'cohort_complete_tasks':3,'cohort_passing_graphs':62,'cumulative_complete_tasks':11,'cumulative_passing_graphs':206,'graphs_in_complete_tasks':141,'prior_training_graphs_analyzed':len(opportunities['records']),'prior_training_structure':counts,'evidence_sha256':{name:hashlib.sha256((s/name).read_bytes()).hexdigest() for name in files},'scope':'Cumulative modified-protocol development coverage; numerical contract qualification, not held-out compiler speedup or exact paper reproduction'}
(s/'contraction-verified-facts.json').write_text(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts,indent=2))
