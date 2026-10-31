"""Rank current importer first blockers by possible complete-family gain.

This is a planning census, not a compiler or PassBench acceptance result. An error
is only the first visible blocker in a graph; later blockers may remain hidden.
"""

import collections
import json
from pathlib import Path


TICKET = Path(__file__).resolve().parent.parent
SOURCE = TICKET / "sources/input-mutation-wave-import-v1.json"
OUTPUT = TICKET / "sources/current-capability-wave-frontier-v1.json"


def classify(error):
    e = error.lower()
    if "only supported floating tensor inputs" in e:
        return "typed indexing"
    if "no nvidia driver" in e:
        return "local driver probe"
    if "scaled_dot_product_attention" in e or "multi_head_attention_forward" in e:
        return "attention"
    if "dropout" in e:
        return "dropout/effects"
    if "get_attr" in e:
        return "captured constants"
    if "norm" in e or "einsum" in e or "torch.max" in e:
        return "reductions/contractions"
    if "unfold" in e or "interpolate" in e or "conv1d" in e or "conv3d" in e:
        return "spatial neighborhoods"
    if "strided tensor slices" in e or "unsupported tensor method t" in e:
        return "layouts/views"
    if "in-place operation" in e or "mutationproxy" in e:
        return "mutation/effects"
    if "shapeprop error" in e:
        return "source trace/shape propagation"
    if "float: inf" in e:
        return "nonfinite scalar"
    if "unsupported tensor method" in e or "unsupported target" in e:
        return "other operator bindings"
    return "unclassified"


def main():
    records = json.loads(SOURCE.read_text())["records"]
    by_task = collections.defaultdict(list)
    for row in records:
        by_task[row["sample"]].append(row)

    wave = collections.defaultdict(lambda: {"blocked_graphs": 0, "affected_tasks": set(),
                                       "single_first_blocker_tasks": set(), "errors": collections.Counter()})
    task_rows = []
    for sample, rows in by_task.items():
        blocked = [r for r in rows if r["status"] != "imported"]
        kinds = collections.Counter(classify(r.get("error", "")) for r in blocked)
        task_rows.append({"sample": sample, "graphs": len(rows), "imported": len(rows) - len(blocked),
                          "blocked": len(blocked), "first_blockers": dict(sorted(kinds.items()))})
        for row in blocked:
            kind = classify(row.get("error", ""))
            wave[kind]["blocked_graphs"] += 1
            wave[kind]["affected_tasks"].add(sample)
            wave[kind]["errors"][row.get("error", "").splitlines()[0]] += 1
        if len(kinds) == 1:
            wave[next(iter(kinds))]["single_first_blocker_tasks"].add(sample)

    ranked = []
    for name, v in wave.items():
        ranked.append({"capability": name, "blocked_graphs": v["blocked_graphs"],
                       "affected_tasks": len(v["affected_tasks"]),
                       "single_first_blocker_tasks": len(v["single_first_blocker_tasks"]),
                       "single_first_blocker_samples": sorted(v["single_first_blocker_tasks"]),
                       "first_errors": dict(v["errors"].most_common())})
    ranked.sort(key=lambda x: (-x["single_first_blocker_tasks"], -x["blocked_graphs"], x["capability"]))
    result = {"format": "kiln-current-capability-frontier/1", "source": str(SOURCE.relative_to(TICKET)),
              "caveat": "First blockers only; single-first-blocker tasks are possible, not assured, completion gain.",
              "graphs": len(records), "imported_graphs": sum(r["status"] == "imported" for r in records),
              "tasks": len(by_task), "complete_import_tasks": sum(r["blocked"] == 0 for r in task_rows),
              "ranked_capabilities": ranked, "task_details": task_rows}
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n")
    print(f"{result['complete_import_tasks']}/{result['tasks']} complete import tasks; "
          f"{result['imported_graphs']}/{result['graphs']} imported graphs")
    for row in ranked:
        print(f"{row['single_first_blocker_tasks']:2} possible complete tasks | "
              f"{row['affected_tasks']:2} affected tasks | {row['blocked_graphs']:3} blocked graphs | "
              f"{row['capability']}")


if __name__ == "__main__":
    main()
