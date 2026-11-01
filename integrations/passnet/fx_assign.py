"""Basic-index regions for slice assignment (KILN-010).

A basic index (integers, slices with positive steps, None and one Ellipsis) selects a region of a
tensor: per source axis either one position ({'at': k}) or a strided range ({'slice': [start,
stop, step]}), with None axes inserted into the view. A View records that region against the
storage root it reads, so that

  * x[index] = value lowers to N.assign(root, entries, value), and
  * an in-place operation on a view (v = x[:, 0]; v += 1) writes its result back into the root.

Kiln programs are functional: after a write, every recorded view of the root is re-derived from
the root's new value. No PyTorch implementation copied.
"""
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class View:
    root: str            # FX name of the storage root (a fresh value)
    entries: tuple       # one per root axis: ('at', k) or ('slice', start, stop, step)
    axes: tuple          # one per view axis: a root axis index, or None for an inserted axis


def _length(entry):
    _, start, stop, step = entry
    return max(0, -(-(stop - start) // step))


def normalize(key, shape):
    """The region of `shape` selected by a basic index key, as (entries, axes)."""
    keys = list(key) if isinstance(key, tuple) else [key]
    if sum(k is Ellipsis for k in keys) > 1: raise ValueError('only one ellipsis allowed')
    consumed = sum(k is not None and k is not Ellipsis for k in keys)
    if consumed > len(shape): raise ValueError('too many tensor indices')
    expanded = []
    for item in keys:
        if item is Ellipsis: expanded.extend([slice(None)] * (len(shape) - consumed))
        else: expanded.append(item)
    if not any(k is Ellipsis for k in keys): expanded.extend([slice(None)] * (len(shape) - consumed))
    entries, axes, axis = [], [], 0
    for item in expanded:
        if item is None:
            axes.append(None); continue
        size = shape[axis]
        if type(item) is int:
            k = item + size if item < 0 else item
            if not 0 <= k < size: raise ValueError('tensor index out of range')
            entries.append(('at', k))
        elif isinstance(item, slice):
            if any(v is not None and type(v) is not int for v in (item.start, item.stop, item.step)):
                raise ValueError('static integer slice bounds required')
            start, stop, step = item.indices(size)
            if step <= 0: raise ValueError('negative-step slice assignment unsupported')
            entries.append(('slice', start, max(start, stop), step)); axes.append(axis)
        else:
            raise ValueError('advanced or dynamic indexing in a slice assignment unsupported')
        axis += 1
    return tuple(entries), tuple(axes)


def view_shape(view):
    return [1 if a is None else _length(view.entries[a]) for a in view.axes]


def region_shape(entries):
    return [_length(e) for e in entries if e[0] == 'slice']


def of(root, key, shape):
    entries, axes = normalize(key, shape)
    return View(root, entries, axes)


def compose(view, key):
    """The view `view[key]`, as a region of view's root."""
    shape = view_shape(view)
    entries2, axes2 = normalize(key, shape)
    entries = list(view.entries)
    keep = {}                       # view axis j kept by key -> its new identity (root axis or None)
    for j, (a, e) in enumerate(zip(view.axes, entries2)):
        if a is None:
            if e[0] == 'at': continue                                     # dropping an inserted axis
            if (e[1], e[2], e[3]) != (0, 1, 1): raise ValueError('a strided slice of an inserted axis')
            keep[j] = None; continue
        _, start, _, step = entries[a]
        if e[0] == 'at': entries[a] = ('at', start + step * e[1]); continue
        n = _length(e)
        first = start + step * e[1]
        entries[a] = ('slice', first, first + step * e[3] * (n - 1) + 1 if n else first, step * e[3])
        keep[j] = a
    axes = tuple(None if j is None else keep[j] for j in axes2)
    return View(view.root, tuple(entries), axes)


def assign_index(entries):
    """The Kiln nn.assign index: one entry per root axis."""
    return json.dumps([{'at': e[1]} if e[0] == 'at' else {'slice': list(e[1:])} for e in entries])


def read_key(view):
    """A basic index key that reads `view` from its root (positions in root-axis order, None axes in
    view order), for fx_indexing.lower_index."""
    key = []
    ats = [a for a, e in enumerate(view.entries) if e[0] == 'at']
    def emit_ats(upto):
        nonlocal ats
        while ats and ats[0] < upto: key.append(view.entries[ats.pop(0)][1])
    for a in view.axes:
        if a is None: key.append(None); continue
        emit_ats(a)
        _, start, stop, step = view.entries[a]
        key.append(slice(start, stop, step))
    emit_ats(len(view.entries))
    return tuple(key)
