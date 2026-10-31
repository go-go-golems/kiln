"""PyTorch storage/stream bridge to existing Kiln CUDA launcher (no copies)."""
import torch
from kiln_launch import load, open_program


DTYPES = {"f32": torch.float32, "f16": torch.float16, "bf16": torch.bfloat16, "u8": torch.uint8}


class TorchProgram:
    def __init__(self, artifact, device=0, include_paths=()):
        self.artifact = load(artifact)
        for spec in self.artifact['inputs'] + self.artifact['outputs']:
            if spec['dtype'] not in DTYPES:
                raise ValueError(f"Unsupported storage dtype: {spec['dtype']}")
            buffer = self.artifact['buffers'][spec['buffer']]
            if buffer['dtype'] != spec['dtype']:
                raise ValueError(f"Tensor/buffer dtype mismatch: {spec['name']}")
            required = torch.empty((), dtype=DTYPES[spec['dtype']]).element_size()
            for dim in spec['shape']: required *= dim
            if buffer['bytes'] < required:
                raise ValueError(f"Insufficient buffer size: {spec['name']}")
        self.device = torch.device('cuda', device)
        self.program = open_program(self.artifact, backend='cuda', device=device, allocate=False, include_paths=include_paths)

    def __call__(self, *inputs):
        if len(inputs) != len(self.artifact['inputs']):
            raise ValueError('Input count mismatch')
        pointers, buffers = {}, {}
        with torch.cuda.device(self.device):
            stream = torch.cuda.current_stream(self.device)
            for spec, tensor in zip(self.artifact['inputs'], inputs):
                if tensor.device != self.device or tensor.dtype != DTYPES[spec['dtype']] or not tensor.is_contiguous() or list(tensor.shape) != spec['shape']:
                    raise ValueError(f'Input {spec["name"]}: expected contiguous {spec['dtype']} {spec["shape"]} on {self.device}')
                tensor.record_stream(stream)
                pointers[spec['name']] = tensor.data_ptr()
                buffers[spec['buffer']] = tensor
            result = {}
            for spec in self.artifact['outputs']:
                if spec['buffer'] not in buffers:
                    buffers[spec['buffer']] = torch.empty(spec['shape'], dtype=DTYPES[spec['dtype']], device=self.device)
                result[spec['name']] = buffers[spec['buffer']]
                pointers[spec['name']] = result[spec['name']].data_ptr()
            scratch = {}
            for spec in self.program.scratch:
                tensor = torch.empty(spec['bytes'], dtype=torch.uint8, device=self.device)
                tensor.record_stream(stream)
                buffers[spec['id']] = tensor
                scratch[spec['id']] = tensor.data_ptr()
            self.program.launch(stream=stream.cuda_stream, scratch=scratch, **pointers)
            return result

    def close(self):
        self.program.close()
