"""One declaration per FX operation: spellings, storage behavior and lowering.

The importer looks an FX node up by (kind, target), binds nothing itself and applies the
shared postconditions (metadata, storage, mutation legality) after the operation's lowering.
A spelling may belong to exactly one operation; registering it twice is an error.
"""
from dataclasses import dataclass, field
from typing import Callable



@dataclass(frozen=True)
class Call:
    """One FX call node as an operation sees it."""
    name: str            # FX node name (used in diagnostics)
    kind: str            # 'call_function' or 'call_method'
    target: str          # normalized target spelling
    args: tuple          # decoded positional arguments (Kiln variable names / JSON literals)
    kwargs: dict         # decoded keyword arguments
    raw_args: dict       # kiln-fx/1 encoded arguments, for reference identity checks
    meta: object         # FX tensor_meta of the result (dict, list of dicts, or None)
    ctx: object          # importer context: resolve(), source_of(), literal(), metadata, require_mutation_source()


@dataclass(frozen=True)
class Lowered:
    expr: object                 # Kiln expression text, or a list of them for multi-output views
    mutates: str | None = None   # FX node whose storage this in-place call updates
    fresh: bool | None = None    # overrides Op.fresh for this call (contiguous copies only when strided)
    view_write: str | None = None  # FX view (fx_assign.View) whose region this in-place call updates


@dataclass(frozen=True)
class Op:
    name: str
    lower: Callable[[Call], Lowered]
    functions: frozenset = field(default_factory=frozenset)   # call_function spellings
    methods: frozenset = field(default_factory=frozenset)     # call_method spellings
    fresh: bool = True   # result owns new storage (in-place calls may consume it later)


class Registry:
    def __init__(self):
        self.ops = {}

    def register(self, op):
        for kind, spellings in (('call_function', op.functions), ('call_method', op.methods)):
            for target in spellings:
                if (kind, target) in self.ops:
                    raise ValueError(f'{kind} {target} is declared by both {self.ops[kind, target].name} and {op.name}')
                self.ops[kind, target] = op
        return op

    def lookup(self, kind, target):
        return self.ops.get((kind, target))


def bind(node, what, args, kwargs, fields, *, require_first=True):
    """Bind positional and keyword arguments against an ordered PyTorch parameter list.

    node names the FX node and what the operation, in diagnostics."""
    if len(args) > len(fields) or set(kwargs) - set(fields):
        raise ValueError(f'{node}: unsupported {what} arguments')
    bound = dict(zip(fields, args))
    if set(bound) & set(kwargs):
        raise ValueError(f'{node}: duplicate {what} argument')
    bound.update(kwargs)
    if require_first and fields[0] not in bound:
        raise ValueError(f'{node}: {what} input required')
    return bound
