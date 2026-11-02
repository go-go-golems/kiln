"""Compare applied FX pattern IDs with frozen variant specialization IDs."""

import ast
import collections
import json
import re
from pathlib import Path


TICKET = Path(__file__).resolve().parent.parent
STUDY = TICKET / "sources/uniform-importable-qualification-v1"
BAND = STUDY / "pending-ordinary"
AUDIT = json.loads((STUDY / "pending-ordinary-audit.json").read_text())
OUTPUT = STUDY / "pending-ordinary-pattern-collisions.json"


def main():
    rows = []
    for task in AUDIT["records"]:
        index = task["index"]
        directory = BAND / f"task-{index:03d}"
        variants = json.loads((directory / "corpus/manifest.json").read_text())["variants"]
        blocks = (directory / "benchmark.log").read_text().split("graph-net-test-compiler-log [Processing] ")[1:]
        assert len(variants) == len(blocks) == len(task["graphs"])
        for graph_index, (variant, block) in enumerate(zip(variants, blocks)):
            if "No compiled program for input metadata and constants" not in block:
                continue
            applied = re.findall(r"Applied 1 replacements with KilnPattern(\d+)", block)
            expected = variant["specialization"]
            assert len(applied) == 1 and len(expected) == 1
            def return_value(pattern_id):
                path = directory / "passes" / f"KilnPattern{pattern_id:04d}.py"
                module = ast.parse(path.read_text())
                function = next(n for n in module.body if isinstance(n, ast.FunctionDef) and n.name == "pattern")
                return ast.unparse(next(n for n in function.body if isinstance(n, ast.Return)).value)
            rows.append({"task": index, "graph_index": graph_index, "graph": variant["graph"],
                         "applied_pattern": int(applied[0]), "compiled_pattern": expected[0],
                         "same_pattern": int(applied[0]) == expected[0],
                         "applied_return": return_value(int(applied[0])),
                         "compiled_return": return_value(expected[0]),
                         "input_shapes": list(variant["inputs"].values()),
                         "input_dtypes": list(variant["input_dtypes"].values())})
    result = {"format": "kiln-dispatch-pattern-collision-audit/1",
              "source": "sources/uniform-importable-qualification-v1/pending-ordinary",
              "dispatch_failures": len(rows), "pattern_id_mismatches": sum(not r["same_pattern"] for r in rows),
              "tasks": dict(collections.Counter(str(r["task"]) for r in rows)),
              "pattern_pairs": dict(collections.Counter(f"{r['task']}:{r['applied_pattern']}->{r['compiled_pattern']}" for r in rows)),
              "records": rows}
    assert result["dispatch_failures"] == 16
    OUTPUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "records"}, indent=2))
    for row in rows:
        print(f"task {row['task']:03d} graph {row['graph_index']:03d}: "
              f"applied {row['applied_pattern']} {row['applied_return']} "
              f"compiled {row['compiled_pattern']} {row['compiled_return']}")


if __name__ == "__main__":
    main()
