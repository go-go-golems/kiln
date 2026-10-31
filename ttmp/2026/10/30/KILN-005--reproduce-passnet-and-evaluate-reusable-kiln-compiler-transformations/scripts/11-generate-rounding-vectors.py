#!/usr/bin/env python3
"""Generate bit-exact FP32 conversion expectations with installed PyTorch CPU."""
import json
import random
import struct
from pathlib import Path
import torch

random.seed(42)
source = [0,0x80000000,0x7f800000,0xff800000,0x7fc00000,1,0x80000001,0x007fffff,0x00800000]
# Exercise midpoint rounding and adjacent FP32 values around finite half encodings.
for b in range(0,0x7bff,31):
    lo=torch.tensor([b],dtype=torch.int16).view(torch.float16).float().item()
    hi=torch.tensor([b+1],dtype=torch.int16).view(torch.float16).float().item()
    mid=struct.unpack('<I',struct.pack('<f',(lo+hi)/2))[0]
    source.extend([mid-1 if mid else 0,mid,mid+1])
source.extend(random.getrandbits(32) for _ in range(20000))
raw=b''.join(struct.pack('<I',b) for b in source)
x=torch.frombuffer(bytearray(raw),dtype=torch.float32)
f16=x.half().view(torch.int16).tolist()
bf16=x.bfloat16().view(torch.int16).tolist()
result={'torch_version':torch.__version__,'seed':42,'vectors':[{'f32':b,'f16':h&65535,'bf16':bf&65535} for b,h,bf in zip(source,f16,bf16)]}
out=Path(__file__).resolve().parents[1]/'sources/rounding-vectors.json'
out.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'{len(source)} vectors saved to {out}')
