"""Manifest-based typed dispatch and output reconstruction for compiled passes.

Only input metadata and explicit captured constants choose a compiled artifact.
There is no eager tensor computation or fallback implementation.
"""
import math
from pathlib import Path
from corpus import read_manifest


def freeze_constants(values):
    if not isinstance(values, (tuple, list)) or any(type(v) not in (str,int,float,bool,type(None)) or (type(v) is float and not math.isfinite(v)) for v in values):
        raise ValueError('Specialization constants must be finite scalar literals')
    return tuple((type(v).__name__,v) for v in values)


def restore_outputs(structure, outputs):
    if 'output' in structure:
        return outputs[structure['output']]
    kind, children = next(iter(structure.items()))
    if kind == 'dict':
        return {key:restore_outputs(child,outputs) for key,child in children.items()}
    values = [restore_outputs(child,outputs) for child in children]
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
                old=plans[key]
                if source!=old['source'] or record['output_structure']!=old['structure']:
                    raise ValueError('Conflicting programs share a dispatch key')
            else:
                plans[key]={'artifact':(directory/record['script']).with_suffix('.json'),
                            'source':source,'structure':record['output_structure']}
        if program_factory is None:
            from runtime import TorchProgram
            program_factory=TorchProgram
        self.programs={}
        try:
            for key,plan in plans.items():
                self.programs[key]=(program_factory(plan['artifact'],device=device,include_paths=include_paths),plan['structure'])
        except Exception:
            self.close()
            raise

    def __call__(self, *inputs, specialization=()):
        names={'torch.float32':'f32','torch.float16':'f16','torch.bfloat16':'bf16','torch.uint8':'u8'}
        descriptor=tuple((tuple(value.shape),names[str(value.dtype)]) for value in inputs)
        key=(descriptor,freeze_constants(specialization))
        if key not in self.programs:
            raise ValueError(f'No compiled program for input metadata and constants: {key}')
        program,structure=self.programs[key]
        return restore_outputs(structure,program(*inputs))

    def close(self):
        for program,_ in self.programs.values(): program.close()
        self.programs.clear()
