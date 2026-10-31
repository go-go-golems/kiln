"""Manifest-driven corpus export/compilation; input modules must be trusted.

This runner owns acquisition-to-artifact plumbing, not PassBench scoring or
matching policy. Dataset modules execute during import and FX ShapeProp.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

FORMAT = 'kiln-passnet-corpus/1'


def load_module(path):
    spec = importlib.util.spec_from_file_location('passnet_source', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_manifest(directory):
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('format') != FORMAT:
        raise ValueError(f'Expected {FORMAT}')
    graphs = set()
    for record in manifest['variants']:
        if record['graph'] in graphs:
            raise ValueError('Duplicate graph identity')
        graphs.add(record['graph'])
        order=record.get('source_input_order')
        if order is not None and (not isinstance(order,list) or any(type(i) is not int for i in order) or sorted(order)!=list(range(len(record.get('inputs',{}))))):
            raise ValueError('Source input order must be an exact argument permutation')
        script = Path(record['script'])
        if script.name != str(script) or not script.name.endswith('.kiln.js'):
            raise ValueError('Script must be a local .kiln.js filename')
        graph = Path(record['graph'])
        if graph.is_absolute() or '..' in graph.parts:
            raise ValueError('Graph must be a dataset-relative path')
    return manifest


def translate_graph(upstream, graph, metadata_mode, *, input_order=None):
    import torch
    from fx_trace import trace_module
    from fx_export import export_graph
    from fx_import import import_graph
    model = load_module(upstream / graph / 'model.py').GraphModule()
    metadata = []
    for filename in ('input_meta.py', 'weight_meta.py'):
        module = load_module(upstream / graph / filename)
        metadata.extend(c for c in vars(module).values()
                        if isinstance(c, type) and hasattr(c, 'shape') and hasattr(c, 'name'))
    metadata.sort(key=lambda c: int(c.name.split('_')[-1]))
    if len({c.name for c in metadata}) != len(metadata):
        raise ValueError(f'{graph}: duplicate input metadata')
    traced = trace_module(model)
    if input_order is not None:
        from torch.fx import Graph,GraphModule
        placeholders=[n for n in traced.graph.nodes if n.op=='placeholder']
        if sorted(input_order)!=list(range(len(placeholders))) or len(metadata)!=len(placeholders):
            raise ValueError('Input binding order must be an exact source-argument permutation')
        canonical=Graph();mapping={}
        for index in input_order:
            old=placeholders[index];mapping[old]=canonical.placeholder(old.target,type_expr=old.type)
        for old in traced.graph.nodes:
            if old.op!='placeholder':mapping[old]=canonical.node_copy(old,lambda value:mapping[value])
        traced=GraphModule(traced,canonical)
        metadata=[metadata[index] for index in input_order]
    if metadata_mode == 'fake':
        from torch._subclasses.fake_tensor import FakeTensorMode
        mode = FakeTensorMode(allow_fallback_kernels=False)
        with mode:
            values = [torch.empty(c.shape, dtype=getattr(torch, c.dtype.split('.')[-1])) for c in metadata]
        exported = export_graph(traced, values, fake_mode=mode)
    else:
        values = [torch.randn(c.shape).to(getattr(torch, c.dtype.split('.')[-1])) for c in metadata]
        exported = export_graph(traced, values)
    result = import_graph(exported)
    from reference_domains import ReferenceDomainError,constraints_for_graph,attach_reference_data
    try:constraints=constraints_for_graph(traced)
    except ReferenceDomainError as error:
        # Domain inference is independent of mathematical import coverage.
        # Preserve uncertainty and leave the compiler's normal check enabled.
        constraints=[]
        result['reference_domain_diagnostic']=str(error)
    result['reference_constraints']=constraints
    result['script']=attach_reference_data(result['script'],result['inputs'],constraints)
    result["tensor_nodes"] = {node["id"]: node["tensor_meta"] for node in exported["nodes"] if isinstance(node.get("tensor_meta"), dict)}
    result["tensor_variables"] = {f'v{i}': node['tensor_meta'] for i,node in enumerate(exported['nodes']) if isinstance(node.get('tensor_meta'),dict)}
    return result


def source_order_inputs(record,inputs):
    """Map canonical program arguments back to the trusted source signature."""
    order=record.get('source_input_order',list(range(len(inputs))))
    if sorted(order)!=list(range(len(inputs))):raise ValueError('Invalid source input binding order')
    result=[None]*len(inputs)
    for canonical,source in enumerate(order):result[source]=inputs[canonical]
    return result


def canonical_order_inputs(record,inputs):
    """Map source replay arguments into a generated program's canonical order."""
    order=record.get('source_input_order',list(range(len(inputs))))
    if sorted(order)!=list(range(len(inputs))):raise ValueError('Invalid canonical input binding order')
    return [inputs[index] for index in order]


def export_task(upstream, sample, directory, metadata_mode="fake"):
    directory.mkdir(parents=True, exist_ok=True)
    records = []
    for i, graph in enumerate((upstream / sample / 'graph_list.txt').read_text().splitlines()):
        if not graph.strip():
            continue
        result = translate_graph(upstream, graph, metadata_mode)
        script = f'{i:03d}.kiln.js'
        (directory / script).write_text(result['script'])
        records.append({'graph': graph, 'script': script, 'inputs': result['inputs'],
                        'input_dtypes': result['input_dtypes'], 'output_structure': result['output_structure'],
                        'reference_constraints':result['reference_constraints'],
                        'reference_domain_diagnostic':result.get('reference_domain_diagnostic')})
    manifest = {'format': FORMAT, 'sample': sample, 'metadata_mode': metadata_mode, 'variants': records}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    read_manifest(directory)
    print(f'Exported {len(records)} variants', flush=True)


def inspect_corpus(upstream, sample_list, output):
    """Record every graph's first import blocker; never claim execution coverage."""
    records = []
    for task_index, sample in enumerate(sample_list.read_text().splitlines()):
        graphs = (upstream / sample / 'graph_list.txt').read_text().splitlines()
        for graph in graphs:
            if not graph.strip():
                continue
            try:
                translate_graph(upstream, graph, 'fake')
                result = {'status': 'imported'}
            except Exception as error:
                result = {'status': 'blocked', 'error_type': type(error).__name__, 'error': str(error)}
            records.append({'sample': sample, 'graph': graph, **result})
        output.write_text(json.dumps({'format': 'kiln-passnet-import-audit/1',
                                     'tasks_observed': task_index+1, 'records': records}, indent=2)+'\n')
        print(task_index+1, sample, flush=True)


def compile_task(directory, kiln, target, contraction=None):
    directory = directory.resolve()
    manifest = read_manifest(directory)
    results = []
    for record in manifest['variants']:
        source = directory / record['script']
        output = source.with_suffix('.json')
        command = ['node', 'scripts/kiln-export.mjs', '--script', str(source),
                   '--target', target, '--out', str(output)]
        if contraction is not None:command.extend(['--contraction',contraction])
        with source.with_suffix('.compile.log').open('w') as log:
            result = subprocess.run(command, cwd=kiln, stdout=log, stderr=subprocess.STDOUT)
        results.append({'graph': record['graph'], 'command': command,
                        'returncode': result.returncode, 'artifact': output.name})
        (directory / 'compile-receipt.json').write_text(json.dumps(results, indent=2) + '\n')
        print(record['script'], result.returncode, flush=True)
        if result.returncode:
            raise SystemExit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    export = commands.add_parser('export')
    export.add_argument('--upstream', type=Path, required=True)
    export.add_argument('--sample', required=True)
    export.add_argument('--output', type=Path, required=True)
    export.add_argument('--metadata-mode', choices=['fake', 'execute'], default='fake')
    compile = commands.add_parser('compile')
    compile.add_argument('--directory', type=Path, required=True)
    compile.add_argument('--kiln', type=Path, required=True)
    compile.add_argument('--target', required=True)
    compile.add_argument('--contraction',choices=['allow','separate'])
    audit = commands.add_parser('inspect')
    audit.add_argument('--upstream', type=Path, required=True)
    audit.add_argument('--sample-list', type=Path, required=True)
    audit.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'export':
        export_task(args.upstream, args.sample, args.output, args.metadata_mode)
    elif args.command == 'compile':
        compile_task(args.directory, args.kiln, args.target, args.contraction)
    else:
        inspect_corpus(args.upstream, args.sample_list, args.output)


if __name__ == '__main__':
    main()
