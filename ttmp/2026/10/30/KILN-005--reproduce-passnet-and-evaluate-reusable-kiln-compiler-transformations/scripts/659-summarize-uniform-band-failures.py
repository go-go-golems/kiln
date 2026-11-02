"""Summarize any verified uniform band's graph outcomes without changing acceptance rules.

Generalizes script 656 (ordinary band) to every band: 659 BAND."""

import argparse
import collections
import json
from pathlib import Path


TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / "sources/uniform-importable-qualification-v1"


def category(graph, block):
    if graph.get("nominal_accepted"):
        return "accepted"
    if "No compiled program for input metadata and constants" in block:
        return "dispatch_specialization_miss"
    if "SubgraphMatcher cannot be initialized with an pattern with dead code" in block:
        return "matcher_dead_code_pattern"
    if "No passes modified the graph" in block:
        return "matcher_no_replacement"
    if not graph.get("execution_ok", False):
        return "other_execution_failure"
    if not graph["correct_at"]["-5"]:
        return "nominal_numerical_failure"
    return "other_audit_failure"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("band", choices=("pending-ordinary", "pending-large", "regression"))
    band = parser.parse_args().band
    AUDIT = STUDY / f"{band}-audit.json"
    OUTPUT = STUDY / f"{band}-failure-summary.json"
    audit = json.loads(AUDIT.read_text())
    plan = json.loads((STUDY / f"{band}-plan.json").read_text())
    assert audit["tasks_expected"] == len(plan["tasks"]) and audit["graphs_expected"] == sum(t["graphs"] for t in plan["tasks"])
    tasks = []
    counts = collections.Counter()
    dtypes = collections.defaultdict(collections.Counter)
    loose = collections.Counter()
    for task in audit["records"]:
        failures = []
        log = (STUDY / band / f"task-{task['index']:03d}" / "benchmark.log").read_text()
        blocks = log.split("graph-net-test-compiler-log [Processing] ")[1:]
        assert len(blocks) == task["graph_count"]
        for graph, block in zip(task["graphs"], blocks):
            kind = category(graph, block)
            counts[kind] += 1
            dtype = graph["graph"].split("/")[3]
            dtypes[kind][dtype] += 1
            if kind == "nominal_numerical_failure":
                for tolerance in ("-4", "-3", "1"):
                    if graph["correct_at"][tolerance]:
                        loose[tolerance] += 1
            if kind != "accepted":
                failures.append({"graph": graph["graph"], "dtype": dtype, "kind": kind,
                                 "status": graph.get("execution_status"), "matches": graph.get("matches"),
                                 "correct_at": graph.get("correct_at")})
        if failures:
            family = task["graphs"][0]["graph"].split("/samples/", 1)[-1].split("/_decomposed/", 1)[0]
            tasks.append({"index": task["index"], "source_family": family,
                          "graphs": task["graph_count"], "accepted_graphs": task["graph_count"] - len(failures),
                          "failure_counts": dict(collections.Counter(f["kind"] for f in failures)),
                          "failures": failures})
    result = {"format": "kiln-uniform-band-failure-summary/1", "band": band,
              "source": str(AUDIT.relative_to(TICKET)), "tasks_with_failures": len(tasks),
              "graph_outcomes": dict(counts), "outcomes_by_dtype": {k: dict(v) for k, v in dtypes.items()},
              "nominal_numerical_failures_accepted_at_looser_tolerance": dict(loose), "tasks": tasks}
    assert counts["accepted"] == audit["graphs_nominal_accepted"]
    assert len(tasks) == audit["tasks_expected"] - audit["tasks_nominal_accepted"]
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "tasks"}, indent=2))
    for task in tasks:
        print(f"task {task['index']:03d} {task['accepted_graphs']:2}/{task['graphs']:2} "
              f"{task['failure_counts']} {task['source_family']}")


if __name__ == "__main__":
    main()
