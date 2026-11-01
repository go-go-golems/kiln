"""The one dtype table shared by the importer, the dispatcher and the runtime bridge.

Spellings are FX/torch names (``str(tensor.dtype)``); values are Kiln storage dtypes. Pure data,
importable without torch.
"""

# operations with floating semantics accept exactly these
FLOATING = {'torch.float32': 'f32', 'torch.float16': 'f16', 'torch.bfloat16': 'bf16'}
# values the importer admits: floating, integer and bool
IMPORTED = FLOATING | {'torch.int64': 'i64', 'torch.int32': 'i32', 'torch.bool': 'bool'}
# every storage dtype a Kiln artifact may carry
STORAGE = IMPORTED | {'torch.uint8': 'u8'}
KILN_TO_TORCH = {kiln: torch_name for torch_name, kiln in STORAGE.items()}
