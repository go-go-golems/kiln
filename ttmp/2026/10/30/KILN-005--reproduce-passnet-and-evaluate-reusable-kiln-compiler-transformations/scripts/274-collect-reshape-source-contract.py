#!/usr/bin/env python3
"""Archive installed public API contracts used by the reshape source binder."""
import json
from pathlib import Path
import torch
p=Path(__file__).resolve().parents[1]/'sources'
receipt={'scope':'Source API semantic reference; no PyTorch implementation copied','torch':torch.__version__,'aten_schema':str(torch.ops.aten.reshape.default._schema),'torch_reshape_doc':torch.reshape.__doc__,'tensor_reshape_doc':torch.Tensor.reshape.__doc__,'tensor_view_doc':torch.Tensor.view.__doc__}
(p/'pytorch-reshape-source-contract.json').write_text(json.dumps(receipt,indent=2)+'\n');print(receipt['aten_schema'])
