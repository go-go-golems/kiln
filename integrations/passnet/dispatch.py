"""Manifest-based typed dispatch and output reconstruction for compiled passes.

Only input metadata and explicit captured constants choose a compiled artifact.
There is no eager tensor computation or fallback implementation.
"""
import math
from pathlib import Path
from corpus import read_manifest
from dtypes import STORAGE


def freeze_constants(values):
    if not isinstance(values, (tuple, list)) or any(type(v) not in (str,int,float,bool,type(None)) or (type(v) is float and not math.isfinite(v)) for v in values):
        raise ValueError('Specialization constants must be finite scalar literals')
    return tuple((type(v).__name__,v) for v in values)


def count_outputs(structure):
    if 'output' in structure or 'input_alias' in structure: return 1
    kind, children = next(iter(structure.items()))
    return sum(count_outputs(child) for child in (children.values() if kind == 'dict' else children))


def restore_outputs(structure, outputs, inputs):
    if 'output' in structure:
        return outputs[structure['output']]
    if 'input_alias' in structure:
        return inputs[structure['input_alias']]
    kind, children = next(iter(structure.items()))
    if kind == 'dict':
        return {key:restore_outputs(child,outputs,inputs) for key,child in children.items()}
    values = [restore_outputs(child,outputs,inputs) for child in children]
    if kind == 'tuple': return tuple(values)
    if kind == 'list': return values
    raise ValueError(f'Invalid output structure: {kind}')


class CorpusDispatch:
    def __init__(self, directory, *, device=0, include_paths=(), program_factory=None):
        directory=Path(directory)
        manifest=read_manifest(directory)
        plans={}
        for record in manifest['variants']:
            descriptor=tuple((tuple(shape),record['input_dtypes'][name]) for name,shape in record['inputs'].items())
            key=(descriptor,freeze_constants(record.get('specialization',[])))
            source=(directory/record['script']).read_bytes()
            if key in plans:
                # The same rule identity and input metadata denote the same computation
                # (generate_pass classes patterns modulo output order), so equivalent
                # variants may differ only in output naming. Keep the first program.
                old=plans[key]
                same_class='output_permutation' in record and old['classed']
                if same_class:
                    conflict=len(record['input_mutations'])!=len(old['mutations']) or count_outputs(record['output_structure'])!=count_outputs(old['structure'])
                else:
                    conflict=source!=old['source'] or record['output_structure']!=old['structure'] or record['input_mutations']!=old['mutations']
                if conflict:
                    raise ValueError('Conflicting programs share a dispatch key')
            else:
                plans[key]={'artifact':(directory/record['script']).with_suffix('.json'),
                            'source':source,'structure':record['output_structure'],
                            'mutations':record['input_mutations'],'classed':'output_permutation' in record}
        if program_factory is None:
            from runtime import TorchProgram
            program_factory=TorchProgram
        self.programs={}
        try:
            for key,plan in plans.items():
                self.programs[key]=(program_factory(plan['artifact'],device=device,include_paths=include_paths),plan['structure'],plan['mutations'])
        except Exception:
            self.close()
            raise

    def __call__(self, *inputs, specialization=()):
        descriptor=tuple((tuple(value.shape),STORAGE[str(value.dtype)]) for value in inputs)
        key=(descriptor,freeze_constants(specialization))
        if key not in self.programs:
            raise ValueError(f'No compiled program for input metadata and constants: {key}')
        program,structure,mutations=self.programs[key]
        outputs=program(*inputs)
        # the compiled program wrote each mutated input in place: its output is the input tensor itself
        for mutation in mutations:
            if outputs[mutation['output']] is not inputs[mutation['input_index']]:
                raise ValueError(f"Mutation {mutation['output']} was not written into input {mutation['input_index']}")
        return restore_outputs(structure,outputs,inputs)

    def close(self):
        for program,_,_ in self.programs.values(): program.close()
        self.programs.clear()
