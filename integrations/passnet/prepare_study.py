"""Select a structurally rich corpus without compiling or timing held-out graphs.

The fixed metadata envelope and exact-model exclusions are written before
scanning. A partial failure remains on disk; no outcome-based replacement occurs.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re

from corpus import FORMAT, translate_graph
from reference_domains import reference_domains


def digest(data):
    return hashlib.sha256(data).hexdigest()


def model_of(graph):
    return '/'.join(graph.split('/samples/',1)[1].split('/')[:2])


def classify(result, spec):
    """Only declared semantic/volume eligibility enters selection."""
    if set(result['input_dtypes'].values())!={'f32'}:
        return None,'non_fp32'
    shapes=[math.prod(node['shape']) for node in result['tensor_nodes'].values()]
    inputs=sum(math.prod(shape) for shape in result['inputs'].values())
    if not shapes or inputs>spec['max_input_elements'] or max(shapes)>spec['max_tensor_elements'] or sum(shapes)>spec['max_total_tensor_elements'] or len(shapes)>spec['max_tensor_nodes']:
        return None,'volume_excluded'
    matrices=[]
    for line in result['script'].splitlines():
        match=re.match(r'const (v\d+) = .*N\.(linear|matmul)\(N\.cast\((v\d+),',line)
        if match:
            output,kind,left=match.groups()
            matrices.append(math.prod(result['tensor_variables'][output]['shape'])*result['tensor_variables'][left]['shape'][-1])
    if matrices:
        if sum(matrices)>spec['max_matrix_products']:
            return None,'matrix_work_excluded'
        category='matrix'
    elif any(operator in result['script'] for operator in ['N.sum(','N.layer_norm(','N.rms_norm(','N.softmax(']):
        category='reduction'
    else:
        return None,'required_structure_absent'
    return {'category':category,'input_elements':inputs,'max_tensor_elements':max(shapes),
            'total_tensor_elements':sum(shapes),'tensor_nodes':len(shapes),'matrix_products':sum(matrices)},None


def prepare(upstream, output, config):
    spec=json.loads(config.read_text())
    keys={'format','salt','sample_list','evaluation_list','excluded_manifests','train_per_category','heldout_per_category',
          'max_tasks','max_graphs_per_task','max_input_elements','max_tensor_elements','max_total_tensor_elements','max_tensor_nodes','max_matrix_products','contraction'}
    if set(spec)!=keys or spec['format']!='kiln-rich-study-selection/1' or spec['contraction']!='separate':
        raise ValueError('Expected exact rich-study configuration with fixed separate rounding')
    for key in keys-{'format','salt','sample_list','evaluation_list','excluded_manifests','contraction'}:
        minimum=0 if key=='train_per_category' else 1
        if type(spec[key]) is not int or spec[key]<minimum:raise ValueError('Invalid integer bound: '+key)
    if output.exists():raise ValueError('Preserve frozen or partial selection; choose a new directory')
    output.mkdir(parents=True)
    (output/'selection-spec.json').write_bytes(config.read_bytes())
    source_names=['prepare_study.py','corpus.py','fx_import.py','fx_norm_ops.py','fx_linalg.py','fx_indexing.py','fx_trace.py','fx_export.py','reference_domains.py']
    source_hashes=lambda:{name:digest((Path(__file__).parent/name).read_bytes()) for name in source_names}
    initial_sources=source_hashes()
    sample_list=upstream/spec['sample_list'];evaluation_list=upstream/spec['evaluation_list']
    excluded_models=set();seen_programs=set()
    for sample in evaluation_list.read_text().splitlines():
        for graph in (upstream/sample/'graph_list.txt').read_text().splitlines():excluded_models.add(model_of(graph))
    for name in spec['excluded_manifests']:
        for record in json.loads((config.parent/name).read_text())['variants']:
            excluded_models.add(model_of(record['graph']));seen_programs.add(record['source_sha256'])
    counts=Counter();records=[];audit=[];selected_models=set();category_counts=Counter();tasks_scanned=0
    categories=['reduction','matrix']
    total=spec['train_per_category']+spec['heldout_per_category']
    samples=sorted(sample_list.read_text().splitlines(),key=lambda value:digest((spec['salt']+'\n'+value).encode()))
    def save_audit():
        (output/'scan-audit.json').write_text(json.dumps({'tasks_scanned':tasks_scanned,'counts':dict(counts),'category_counts':dict(category_counts),'records':audit},indent=2)+'\n')
    for task_index,sample in enumerate(samples[:spec['max_tasks']]):
        tasks_scanned=task_index+1
        listing=upstream/sample/'graph_list.txt'
        if not listing.is_file():
            audit.append({'sample':sample,'status':'missing_graph_list'});continue
        graphs=[graph for graph in listing.read_text().splitlines() if '/float32/' in graph][:spec['max_graphs_per_task']]
        for graph in graphs:
            model=model_of(graph);row={'sample':sample,'graph':graph,'model':model}
            if model in excluded_models or model in selected_models:row['status']='previous_or_selected_model_excluded'
            else:
                try:
                    result=translate_graph(upstream,graph,'fake');features,reason=classify(result,spec)
                    source_hash=digest(result['script'].encode())
                    if reason:row['status']=reason
                    elif source_hash in seen_programs:row['status']='previous_or_duplicate_program_excluded'
                    elif category_counts[features['category']]>=total:row['status']='category_quota_full'
                    else:
                        category=features['category'];split='train' if category_counts[category]<spec['train_per_category'] else 'heldout'
                        script=f'{len(records):03d}.kiln.js';(output/script).write_text(result['script'])
                        records.append({'graph':graph,'sample':sample,'split':split,'model':model,'category':category,'script':script,
                                        'source_sha256':source_hash,'inputs':result['inputs'],'input_dtypes':result['input_dtypes'],
                                        'output_structure':result['output_structure'],'reference_constraints':result['reference_constraints'],
                                        'reference_domain_diagnostic':result.get('reference_domain_diagnostic'),'structural_features':features,
                                        'source_files_sha256':{f.name:digest(f.read_bytes()) for f in sorted((upstream/graph).iterdir()) if f.is_file()}})
                        selected_models.add(model);seen_programs.add(source_hash);category_counts[category]+=1
                        row.update(status='selected',split=split,category=category)
                except Exception as error:row.update(status='unsupported',error_type=type(error).__name__,error=str(error))
            audit.append(row);counts[row['status']]+=1
            if row['status']=='selected':break
        if task_index%32==0 or all(category_counts[c]==total for c in categories):
            save_audit()
            print('SCAN',task_index+1,dict(category_counts),flush=True)
        if all(category_counts[c]==total for c in categories):break
    save_audit()
    if any(category_counts[c]!=total for c in categories):raise ValueError('Selection incomplete; preserve partial audit')
    if source_hashes()!=initial_sources:raise ValueError('Importer changed during selection; preserve partial sources')
    identity=digest(json.dumps(records,sort_keys=True).encode())
    manifest={'format':FORMAT,'sample':output.name,'membership_sha256':identity,
              'selection_status':'source_selected','importer_source_sha256':initial_sources,
              'numerical_policy':{'contraction':'separate'},'source_sample_list':spec['sample_list'],
              'source_sample_list_sha256':digest(sample_list.read_bytes()),'excluded_evaluation_list_sha256':digest(evaluation_list.read_bytes()),
              'excluded_models_sha256':digest(json.dumps(sorted(excluded_models)).encode()),
              'selection_spec_sha256':digest(config.read_bytes()),'selector_sha256':digest(Path(__file__).read_bytes()),
              'selection':'First eligible exact models in salted task-hash order; fixed per-category train/confirmation quotas; no compilation or timing feedback',
              'scope':'Fresh exact models relative to all evaluation models and prior policy corpora; architecture relatives may remain; metadata-restricted FP32 population',
              'variants':records}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (output/'reference-domains.json').write_text(json.dumps(reference_domains(output,upstream),indent=2)+'\n')
    print('FROZEN',len(records),'graphs',dict(category_counts),identity,flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['upstream','output','config']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();prepare(args.upstream,args.output,args.config)
