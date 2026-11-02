#!/usr/bin/env python3
"""Describe complete exported artifacts without treating structure as speedup."""
import argparse,collections,json
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cohort',required=True);args=parser.parse_args()
if Path(args.cohort).name!=args.cohort:raise ValueError('Cohort basename required')
root=s/args.cohort;run=json.loads((root/'run.json').read_text())
if run['status']!='complete':raise ValueError('Complete cohort required')
records=[]
for task in run['records']:
 directory=root/task['directory']/'corpus';manifest=json.loads((directory/'manifest.json').read_text());receipt=json.loads((directory/'compile-receipt.json').read_text())
 if len(receipt)!=len(manifest['variants']):raise ValueError('Incomplete compile receipt')
 for row,compiled in zip(manifest['variants'],receipt):
  if compiled['graph']!=row['graph'] or compiled['returncode']!=0:raise ValueError('Failed or reordered compilation')
  artifact=json.loads((directory/compiled['artifact']).read_text());external={r['buffer'] for r in artifact['inputs']+artifact['outputs']}
  records.append({'task_index':task['index'],'graph':row['graph'],'input_dtypes':sorted(set(r['dtype'] for r in artifact['inputs'])),'output_dtypes':sorted(set(r['dtype'] for r in artifact['outputs'])),'kernels':len(artifact['kernels']),'schedules':[r['row'] for r in artifact['kernels']],'input_bytes':sum(b['bytes'] for b in artifact['buffers'] if b['id'] in {r['buffer'] for r in artifact['inputs']}),'output_bytes':sum(b['bytes'] for b in artifact['buffers'] if b['id'] in {r['buffer'] for r in artifact['outputs']}),'scratch_bytes':sum(b['bytes'] for b in artifact['buffers'] if b['id'] not in external)})
result={'format':'kiln-softmax-artifact-structure/1','scope':'Static exported structure, not latency or optimization evidence','variants':len(records),'kernels_total':sum(r['kernels'] for r in records),'kernel_count_histogram':dict(collections.Counter(r['kernels'] for r in records)),'input_storage_types':dict(collections.Counter('+'.join(r['input_dtypes']) for r in records)),'max_output_bytes':max(r['output_bytes'] for r in records),'max_scratch_bytes':max(r['scratch_bytes'] for r in records),'records':records}
(s/(args.cohort+'-artifact-structure.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))
