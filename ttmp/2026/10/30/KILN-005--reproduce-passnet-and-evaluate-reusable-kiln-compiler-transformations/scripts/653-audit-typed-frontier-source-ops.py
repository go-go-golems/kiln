"""Trace all current typed-first-blocker graphs to inspect subsequent FX operations.

Tracing records source structure; it does not run ShapeProp, import Kiln, or prove
that a typed implementation would complete any family.
"""

import collections
import json
import sys
from pathlib import Path


TICKET = Path(__file__).resolve().parent.parent
SOURCES = TICKET / "sources"
sys.path.insert(0, str(Path.cwd() / "integrations/passnet"))
from corpus import load_module  # noqa: E402
from fx_trace import trace_module  # noqa: E402


def target_name(node):
    target = node.target
    if node.op == "call_function":
        if hasattr(target, "__module__") and hasattr(target, "__name__"):
            return f"{target.__module__}.{target.__name__}"
    return str(target)


def main():
    source = SOURCES / "input-mutation-wave-import-v1.json"
    records = json.loads(source.read_text())["records"]
    typed = [r for r in records if "only supported floating tensor inputs accepted" in r.get("error", "")]
    families = collections.defaultdict(list)
    failures = []
    for row in typed:
        try:
            graph = SOURCES / "upstream" / row["graph"] / "model.py"
            traced = trace_module(load_module(graph).GraphModule())
            calls = collections.Counter(f"{n.op}:{target_name(n)}" for n in traced.graph.nodes
                                        if n.op.startswith("call_") or n.op == "get_attr")
            families[row["sample"]].append({"graph": row["graph"], "calls": dict(sorted(calls.items())),
                                             "nodes": len(list(traced.graph.nodes))})
        except Exception as exc:
            failures.append({"sample": row["sample"], "graph": row["graph"],
                             "error": f"{type(exc).__name__}: {exc}"})

    summary = []
    for sample, graphs in families.items():
        all_targets = [set(g["calls"]) for g in graphs]
        union = sorted(set.union(*all_targets))
        common = sorted(set.intersection(*all_targets))
        summary.append({"sample": sample, "traced_graphs": len(graphs),
                        "call_targets_union": union, "call_targets_common": common,
                        "graph_node_range": [min(g["nodes"] for g in graphs), max(g["nodes"] for g in graphs)]})
    summary.sort(key=lambda r: r["sample"])
    target_families = collections.Counter(target for family in summary for target in family["call_targets_union"])
    result = {"format": "kiln-typed-frontier-source-ops/1", "source": str(source.relative_to(TICKET)),
              "caveat": "FX source tracing without ShapeProp; operations may hide later importer, dtype, or runtime blockers.",
              "typed_first_blocker_graphs": len(typed), "traced_graphs": sum(map(len, families.values())),
              "trace_failures": failures, "target_family_counts": dict(target_families.most_common()),
              "family_summary": summary}
    output = SOURCES / "typed-frontier-source-ops-v1.json"
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"traced {result['traced_graphs']}/{len(typed)} typed-first-blocker graphs "
          f"across {len(summary)} families; failures={len(failures)}")
    for name, count in target_families.most_common():
        print(f"{count:2} families {name}")


if __name__ == "__main__":
    main()
