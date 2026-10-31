"""Qualify declared policy artifacts independently of GPU performance."""
import argparse
import hashlib
import json
from pathlib import Path
from corpus import read_manifest


def qualify(corpus,artifacts):
    manifest=read_manifest(corpus);plan=json.loads((corpus/'measurement-plan.json').read_text())
    identity=hashlib.sha256(json.dumps(manifest['variants'],sort_keys=True).encode()).hexdigest()
    if identity!=manifest['membership_sha256'] or identity!=plan['membership_sha256']:raise ValueError('Frozen membership mismatch')
    policies=plan['candidate_ids']
    if len(policies)!=len(set(policies)) or any(Path(name).name!=name for name in policies):raise ValueError('Unique local policy identities required')
    declared={name:json.loads((corpus/'policies'/(name+'.json')).read_text()) for name in policies}
    if 'baseline' not in policies or 'default' not in policies:raise ValueError('Unchanged/default equivalence controls required')
    receipts={name:json.loads((artifacts/name/'compile-receipt.json').read_text()) for name in policies}
    baseline=receipts['baseline'];hashes={};semantics={};changes={};fingerprints={}
    if declared['baseline']['kind']!='unchanged' or declared['default']['kind']!='threshold' or declared['default'].get('max_work_growth')!=1.02:raise ValueError('Unchanged and explicit default controls required')
    expected=[r['graph'] for r in manifest['variants']]
    for name,receipt in receipts.items():
        if receipt['policy']!=declared[name] or declared[name]['id']!=name:raise ValueError('Declared policy differs from compiled policy')
        if receipt['target']!=baseline['target']:raise ValueError('Compiler target mismatch')
        if receipt['membership_sha256']!=identity or receipt['reference_domain_sha256']!=baseline['reference_domain_sha256']:raise ValueError('Compiler configuration mismatch')
        if [r['graph'] for r in receipt['records']]!=expected or any(r['status']!='compiled' for r in receipt['records']):raise ValueError(f'Incomplete compilation for {name}')
        hashes[name]=[];semantics[name]=[];changes[name]=[]
        for index,record in enumerate(receipt['records']):
            raw=(artifacts/name/record['artifact']).read_bytes();artifact=json.loads(raw)
            if artifact['compiler_policy']!=declared[name]:raise ValueError('Artifact policy differs from declaration')
            if len(artifact['kernels'])!=record['kernel_count']:raise ValueError('Kernel count mismatch')
            if artifact['source']['sha256']!=manifest['variants'][index]['source_sha256']:raise ValueError('Source hash mismatch')
            if [k['identity'] for k in artifact['kernels']]!=record['kernel_identities']:raise ValueError('Kernel identity mismatch')
            hashes[name].append(hashlib.sha256(raw).hexdigest())
            for key in ['name','source','compiler_policy']:artifact.pop(key,None)
            semantic=hashlib.sha256(json.dumps(artifact,sort_keys=True).encode()).hexdigest()
            prior=fingerprints.setdefault(record['fingerprint'],semantic)
            if prior!=semantic:raise ValueError('One fingerprint aliases distinct executable bodies')
            semantics[name].append(semantic)
            old=baseline['records'][index]
            if record['fingerprint']!=old['fingerprint']:
                changes[name].append({'graph':record['graph'],'split':record['split'],'before_kernels':old['kernel_count'],'after_kernels':record['kernel_count']})
    if changes['default'] or semantics['default']!=semantics['baseline']:raise ValueError('Configurable default changed the unchanged compiler executable')
    groups={}
    for index,digest in enumerate(semantics['baseline']):groups.setdefault(digest,[]).append(manifest['variants'][index])
    cross_split=[{'graphs':[r['graph'] for r in rows],'splits':[r['split'] for r in rows]} for rows in groups.values() if len({r['split'] for r in rows})>1]
    return {'membership_sha256':identity,'default_equals_unchanged':True,'artifact_sha256':hashes,
            'semantic_sha256':semantics,'changes':changes,'cross_split_baseline_aliases':cross_split,
            'scope':'Structural qualification only; exact aliases must not be described as independent performance contrasts'}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for key in ['corpus','artifacts','output']:p.add_argument('--'+key,type=Path,required=True)
    args=p.parse_args();result=qualify(args.corpus,args.artifacts)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'changes':{k:len(v) for k,v in result['changes'].items()},'cross_split_baseline_aliases':result['cross_split_baseline_aliases']}))


if __name__=='__main__':main()
