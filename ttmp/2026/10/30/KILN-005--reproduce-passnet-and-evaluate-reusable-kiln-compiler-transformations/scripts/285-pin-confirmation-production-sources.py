#!/usr/bin/env python3
"""Finalize isolated production source controls before scanning confirmation data."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'packages/kiln/src').exists())
if (s/'reshape-confirmation-v1').exists():raise ValueError('Finalize before source selection')
path=s/'reshape-confirmation-declaration-v1.json';plan=json.loads(path.read_text());snapshots={}
explicit={'apps/workbench/src/compile.js','scripts/kiln-export.mjs','integrations/passnet/compile_policy.mjs','integrations/passnet/fusion_policy.mjs','pnpm-lock.yaml'}
for role,revision in [('baseline','c15c610'),('candidate','fed37d1')]:
 files=subprocess.check_output(['git','ls-tree','-r','--name-only',revision],cwd=repo,text=True).splitlines()
 files=[n for n in files if n in explicit or n.startswith('packages/') and '/src/' in n and n.endswith(('.js','.mjs','.ts'))]
 rows={n:hashlib.sha256(subprocess.check_output(['git','show',revision+':'+n],cwd=repo)).hexdigest() for n in files}
 snapshots[role]=rows;out=s/'reshape-confirmation-compiler-sources-v1'/(role+'-production-snapshot.json')
 with out.open('x') as file:file.write(json.dumps(rows,indent=2)+'\n')
 plan['compiler_variants'][role].update(production_revision=revision,production_snapshot=str(out.relative_to(s)),production_snapshot_sha256=hashlib.sha256(out.read_bytes()).hexdigest())
assert snapshots['baseline'].keys()==snapshots['candidate'].keys()
changed=[n for n in snapshots['baseline'] if snapshots['baseline'][n]!=snapshots['candidate'][n]]
assert changed==['packages/kiln/src/std/tensor.js'],changed
plan['compiler_comparison']='Separate isolated compiler checkouts; all production compilation source files pinned; only tensor.js differs. Identical current importer-generated programs and measurement runtime for both variants.'
plan['expected_production_source_differences']=changed
plan['declaration_status']='Finalized before confirmation source scanning or compilation'
path.write_text(json.dumps(plan,indent=2)+'\n');print(len(snapshots['baseline']),'production files pinned; exact difference',changed)
