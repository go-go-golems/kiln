"""Compare every manifest output to its original trusted source model on CUDA.

Correctness evidence only. Timing and benchmark acceptance belong to PassBench.
"""
import argparse
import json
from pathlib import Path
import torch
from corpus import read_manifest, load_module,canonical_order_inputs
from runtime import DTYPES, TorchProgram

RTOL = {torch.float32: 1.3e-6, torch.float16: 1e-3, torch.bfloat16: 1.6e-2}


def check_structure(structure, actual, expected, errors):
    if 'output' in structure:
        value = actual[structure['output']]
        assert value.shape == expected.shape and value.dtype == expected.dtype
        torch.testing.assert_close(value, expected, rtol=RTOL[expected.dtype], atol=1e-5)
        errors.append(float((value - expected).abs().max()))
        return
    kind, children = next(iter(structure.items()))
    if kind == 'dict':
        assert isinstance(expected, dict) and set(expected) == set(children)
        for key, child in children.items():
            check_structure(child, actual, expected[key], errors)
    else:
        assert isinstance(expected, tuple if kind == 'tuple' else list)
        assert len(expected) == len(children)
        for child, value in zip(children, expected):
            check_structure(child, actual, value, errors)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--inputs', choices=['random', 'replay'], default='random')
    parser.add_argument('--include-path', action='append', default=[])
    args = parser.parse_args()
    manifest = read_manifest(args.directory)
    receipt = json.loads((args.directory / 'compile-receipt.json').read_text())
    assert len(receipt) == len(manifest['variants'])
    for record, compiled in zip(manifest['variants'], receipt):
        assert record['graph'] == compiled['graph'] and compiled['returncode'] == 0
        assert compiled['artifact'] == Path(record['script']).with_suffix('.json').name
    results = []
    for i, record in enumerate(manifest['variants']):
        source = args.upstream / record['graph']
        model = load_module(source / 'model.py').GraphModule()
        torch.manual_seed(args.seed)
        if args.inputs == 'replay':
            from pass_bench.torch.test_compiler import get_input_dict
            named = get_input_dict(argparse.Namespace(model_path=str(source), device='cuda'))
            source_inputs = [named[f'in_{j}'] for j in range(len(named))]
            inputs = canonical_order_inputs(record,source_inputs)
        else:
            if record.get('source_arity',len(record['inputs']))!=len(record['inputs']):
                raise ValueError('Random inputs cannot drive a source model with dead arguments; use --inputs replay')
            inputs = [torch.randn(shape, device='cuda').to(DTYPES[record['input_dtypes'][name]])
                      for name, shape in record['inputs'].items()]
            order = record.get('source_input_order',list(range(len(inputs))))
            source_inputs = [None]*len(inputs)
            for canonical, position in enumerate(order): source_inputs[position] = inputs[canonical]
        program = TorchProgram(args.directory / receipt[i]['artifact'], include_paths=args.include_path)
        try:
            actual = program(*inputs)
            expected = model(*source_inputs)
            errors = []
            check_structure(record['output_structure'], actual, expected, errors)
            torch.cuda.synchronize()
            results.append({'graph': record['graph'], 'status': 'passed', 'seed': args.seed,
                            'inputs': args.inputs, 'output_max_abs_errors': errors})
        finally:
            program.close()
        (args.directory / f'gpu-{args.inputs}-receipt.json').write_text(json.dumps(results, indent=2) + '\n')
        print(i, 'PASS', record['graph'], flush=True)


if __name__ == '__main__':
    main()
