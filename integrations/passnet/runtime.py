"""PyTorch storage/stream bridge to existing Kiln CUDA launcher (no copies)."""
import torch
from kiln_launch import load, open_program


class TorchProgram:
    def __init__(self, artifact, device=0):
        self.artifact = load(artifact)
        self.device = torch.device('cuda', device)
        self.program = open_program(self.artifact, backend='cuda', device=device, allocate=False)

    def __call__(self, *inputs):
        if len(inputs) != len(self.artifact['inputs']):
            raise ValueError('Input count mismatch')
        pointers, buffers = {}, {}
        with torch.cuda.device(self.device):
            stream = torch.cuda.current_stream(self.device)
            for spec, tensor in zip(self.artifact['inputs'], inputs):
                if tensor.device != self.device or tensor.dtype != torch.float32 or not tensor.is_contiguous() or list(tensor.shape) != spec['shape'] or spec['dtype'] != 'f32':
                    raise ValueError(f'Input {spec["name"]}: expected contiguous FP32 {spec["shape"]} on {self.device}')
                tensor.record_stream(stream)
                pointers[spec['name']] = tensor.data_ptr()
                buffers[spec['buffer']] = tensor
            result = {}
            for spec in self.artifact['outputs']:
                if spec['dtype'] != 'f32':
                    raise ValueError('Unsupported output dtype')
                if spec['buffer'] not in buffers:
                    buffers[spec['buffer']] = torch.empty(spec['shape'], dtype=torch.float32, device=self.device)
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
