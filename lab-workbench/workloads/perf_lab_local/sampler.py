"""Deformable-attention sampling, the computation Scenario A studies, at a size a laptop runs quickly.

For each of Q queries and H heads, P fractional locations are sampled bilinearly from a C-channel value
map and reduced with attention weights. Three implementations compute the same function:

- ``unfused`` samples every point with ``grid_sample`` into a [B·H, C, Q, P] tensor (the *sampled
  intermediate*) and then reduces it.
- ``gather`` gathers the four neighbours of one point at a time and accumulates into [B·H, C, Q], so the
  intermediate is never materialized, at the cost of many small eager operations.
- ``compiled`` is ``unfused`` compiled by TorchInductor, which may fuse sampling and reduction into one
  generated kernel; whether it did is recorded as activation, not assumed.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn.functional as F
from torch.profiler import record_function


@dataclass(frozen=True)
class Shape:
    heads: int
    channels: int
    queries: int
    points: int
    spatial: int

    @property
    def bh(self) -> int:
        return self.heads  # batch 1

    def intermediate_numel(self) -> int:
        return self.bh * self.channels * self.queries * self.points


def shape_from(opts: dict) -> Shape:
    return Shape(
        heads=int(opts.get("heads", 8)),
        channels=int(opts.get("channels", 32)),
        queries=int(opts.get("queries", 2048)),
        points=int(opts.get("points", 16)),
        spatial=int(opts.get("spatial", 64)),
    )


def make_inputs(shape: Shape, seed: int, device: str, dtype: torch.dtype):
    """Value map, normalized sampling grid in [-1, 1] and softmax attention weights (generated on CPU)."""
    g = torch.Generator().manual_seed(seed)
    value = torch.randn(shape.bh, shape.channels, shape.spatial, shape.spatial, generator=g)
    grid = torch.rand(shape.bh, shape.queries, shape.points, 2, generator=g) * 2 - 1
    weights = torch.softmax(torch.randn(shape.bh, shape.queries, shape.points, generator=g), dim=-1)
    return value.to(device, dtype), grid.to(device, dtype), weights.to(device, dtype)


def unfused(value: torch.Tensor, grid: torch.Tensor, weights: torch.Tensor, ledger: list | None = None):
    with record_function("sample"):
        sampled = F.grid_sample(value, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    if ledger is not None:
        ledger.append(tensor_entry("sampled_intermediate", "sampled_intermediate", sampled, "freed after reduce", "sample"))
    with record_function("reduce"):
        out = (sampled * weights.unsqueeze(1)).sum(-1)
    return out


def gather(value: torch.Tensor, grid: torch.Tensor, weights: torch.Tensor, ledger: list | None = None):
    bh, c, h, w = value.shape
    q, p = grid.shape[1], grid.shape[2]
    flat = value.reshape(bh, c, h * w)
    out = value.new_zeros(bh, c, q)
    for i in range(p):
        with record_function("gather"):
            gx = grid[:, :, i, 0]
            gy = grid[:, :, i, 1]
            # align_corners=False: pixel centers at (k + 0.5) / size in normalized space
            x = ((gx + 1) * w - 1) / 2
            y = ((gy + 1) * h - 1) / 2
            x0 = torch.floor(x)
            y0 = torch.floor(y)
            corners = (
                (x0, y0, (x0 + 1 - x) * (y0 + 1 - y)),
                (x0 + 1, y0, (x - x0) * (y0 + 1 - y)),
                (x0, y0 + 1, (x0 + 1 - x) * (y - y0)),
                (x0 + 1, y0 + 1, (x - x0) * (y - y0)),
            )
            aw = weights[:, :, i]
        with record_function("accumulate"):
            for k, (cx, cy, cw) in enumerate(corners):
                inside = (cx >= 0) & (cx <= w - 1) & (cy >= 0) & (cy <= h - 1)
                idx = (cy.clamp(0, h - 1) * w + cx.clamp(0, w - 1)).long()
                gathered = torch.gather(flat, 2, idx.unsqueeze(1).expand(bh, c, q))
                if ledger is not None and i == 0 and k == 0:
                    ledger.append(tensor_entry("point_slice", "gather.point_slice", gathered, "per corner and point, freed each step", "accumulate"))
                out += gathered * (cw * inside * aw).unsqueeze(1)
    return out


def plain(value: torch.Tensor, grid: torch.Tensor, weights: torch.Tensor) -> torch.Tensor:
    """``unfused`` without profiler ranges, the function handed to torch.compile."""
    sampled = F.grid_sample(value, grid, mode="bilinear", padding_mode="zeros", align_corners=False)
    return (sampled * weights.unsqueeze(1)).sum(-1)


EAGER = {"unfused": unfused, "gather": gather}


def tensor_entry(name: str, role: str, t: torch.Tensor, lifetime: str, allocated_in: str | None = None) -> dict:
    return {
        "range": allocated_in,
        "name": name,
        "role": role,
        "shape": list(t.shape),
        "dtype": {"name": str(t.dtype).replace("torch.", ""), "bytes": t.element_size()},
        "numel": t.numel(),
        "bytes": t.numel() * t.element_size(),
        "device": str(t.device),
        "lifetime": lifetime,
    }
