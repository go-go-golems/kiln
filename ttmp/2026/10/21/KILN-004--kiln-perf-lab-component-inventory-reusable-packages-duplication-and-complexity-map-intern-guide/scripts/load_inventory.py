#!/usr/bin/env python3
"""Build the KILN-004 inventory database from the ticket's JSON inventories and markdown diaries.

    python3 scripts/load_inventory.py            # rebuild various/kiln-inventory.sqlite
    python3 scripts/load_inventory.py --check    # validate only; prints problems, writes nothing
    python3 scripts/load_inventory.py --out X    # write somewhere else

Run from anywhere; paths resolve against this ticket. The database is rebuilt from scratch on every run
(schema.sql, then schema-kiln.sql, then every various/inventory/*.json, then every diary), written to a temporary
file and renamed into place, so concurrent runs never see a half-built file.

Inventory JSON: one file per area, various/inventory/<area>.json, an object whose keys are table names and whose
values are lists of row objects keyed by column name. source_area is filled from the file name. Two extra keys are
accepted on any row and are not columns: "diary_step" (int) or "diary_steps" (list of int) — the steps of that
area's diary that found the row; each becomes an explicit diary_links row. List/dict values are stored as JSON text.
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

TICKET = Path(__file__).resolve().parent.parent
REPO = TICKET.parents[3]  # ttmp/YYYY/MM/DD/<ticket> → repository root
INVENTORY = TICKET / "various" / "inventory"
DEFAULT_OUT = TICKET / "various" / "kiln-inventory.sqlite"

DIARIES = {
    "01-investigation-diary.md": "orchestrator",
    "07-diary-a-compiler-runtime-launchers-and-cuda-runner.md": "compiler-runtime",
    "08-diary-b-the-kiln-workbench-page.md": "workbench-ui",
    "09-diary-c-server-execution-core-and-evidence.md": "server-exec-evidence",
    "10-diary-d-perf-lab-and-the-kiln-lab-package.md": "perf-lab",
    "11-diary-e-design-history-of-kiln-and-ml-perf-tickets.md": "history",
}
COMMIT_PREFIX = {
    "orchestrator": "KILN-004: ",
    "compiler-runtime": "KILN-004 A: ",
    "workbench-ui": "KILN-004 B: ",
    "server-exec-evidence": "KILN-004 C: ",
    "perf-lab": "KILN-004 D: ",
    "history": "KILN-004 E: ",
}

# Natural key of every table that inventory JSON may fill.
KEYS = {
    "packages": ("name",),
    "modules": ("path",),
    "functionalities": ("name",),
    "functionality_modules": ("functionality", "module_path"),
    "endpoints": ("package", "method", "path"),
    "db_tables": ("schema_name", "name"),
    "nats_subjects": ("subject",),
    "service_calls": ("from_package", "to_package", "protocol", "description"),
    "reusable_components": ("name",),
    "duplications": ("title",),
    "complexity_hotspots": ("path",),
    "facts": ("subject", "fact"),
    "dependencies": ("package", "name", "kind"),
    "docs": ("path",),
    "diagrams": ("title",),
    "formats": ("name",),
}
# Keys the loader looks for in diary text to add 'mentioned' links.
MENTION_KEYS = {
    "modules": "path",
    "complexity_hotspots": "path",
    "reusable_components": "path",
    "formats": "name",
    "docs": "path",
    "packages": "name",
}
SECTIONS = {
    "prompt context": "prompt_context",
    "what i did": "what_i_did",
    "what was done": "what_i_did",
    "why": "why",
    "what worked": "what_worked",
    "what didn't work": "what_didnt_work",
    "what didn’t work": "what_didnt_work",
    "what i learned": "what_i_learned",
    "what was tricky": "what_was_tricky",
    "what was tricky to build": "what_was_tricky",
    "what warrants a second pair of eyes": "second_pair_of_eyes",
    "what should be done in the future": "future_work",
    "code review instructions": "code_review_instructions",
    "review": "code_review_instructions",
    "technical details": "technical_details",
}


def label(table, row):
    parts = [str(row.get(k, "")) for k in KEYS[table]]
    text = " | ".join(parts)
    return text if len(text) <= 160 else text[:157] + "..."


def git(*args):
    out = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True)
    return out.stdout if out.returncode == 0 else ""


def commits_for(area):
    prefix = COMMIT_PREFIX[area]
    rows = []
    for line in git("log", "--reverse", "--format=%h\t%s").splitlines():
        h, _, subject = line.partition("\t")
        if subject.startswith(prefix):
            rows.append({"hash": h, "message": subject})
    return rows


def step_origins(path):
    """First commit (hash, ISO date) that added each '## Step N' heading of a diary."""
    rel = str(path.relative_to(REPO))
    origins, current = {}, None
    for line in git("log", "--reverse", "--format=@@COMMIT %h %aI", "-U0", "--", rel).splitlines():
        if line.startswith("@@COMMIT "):
            _, h, date = line.split(" ", 2)
            current = (h, date)
        else:
            m = re.match(r"^\+## Step (\d+)", line)
            if m and current and int(m.group(1)) not in origins:
                origins[int(m.group(1))] = current
    return origins


def parse_diary(path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)
    steps = []
    for block in re.split(r"(?m)^## (?=Step \d+)", text)[1:]:
        heading, _, body = block.partition("\n")
        m = re.match(r"Step (\d+)\s*[:.—-]\s*(.*)", heading.strip())
        if not m:
            continue
        entry = {"step": int(m.group(1)), "title": m.group(2).strip(), "raw": block}
        parts = re.split(r"(?m)^### +(.+?)\s*$", body)
        entry["summary"] = parts[0].strip()
        for name, content in zip(parts[1::2], parts[2::2]):
            key = SECTIONS.get(name.strip().lower().rstrip(":"))
            if key is None:
                key = "technical_details"
                content = f"#### {name}\n{content}"
            entry[key] = (entry.get(key, "") + "\n" + content).strip()
        cm = re.search(r"\*\*Commit[^*]*\*\*:?\s*`?([0-9a-f]{7,40})`?", block)
        if cm:
            entry["commit_hash"] = cm.group(1)
        steps.append(entry)
    return steps


def build(db, problems):
    db.executescript((TICKET / "scripts" / "schema.sql").read_text())
    db.executescript((TICKET / "scripts" / "schema-kiln.sql").read_text())
    columns = {t: [r[1] for r in db.execute(f"PRAGMA table_info({t})")] for t in KEYS}
    for extra in ("agents", "diary_entries"):
        columns[extra] = [r[1] for r in db.execute(f"PRAGMA table_info({extra})")]
    owner, explicit_links, counts = {}, [], {}

    def insert(table, row, area, where):
        unknown = sorted(set(row) - set(columns[table]) - {"diary_step", "diary_steps"})
        if unknown:
            problems.append(f"{where}: unknown column(s) {unknown} for table {table}")
            return None
        values = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v)
                  for k, v in row.items() if k in columns[table]}
        if "source_area" in columns[table] and table != "agents":
            values.setdefault("source_area", area)
        cols = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        try:
            cur = db.execute(f"INSERT OR REPLACE INTO {table} ({cols}) VALUES ({marks})", list(values.values()))
        except sqlite3.Error as e:
            problems.append(f"{where}: {table}: {e}")
            return None
        return cur.lastrowid

    agents_file = INVENTORY / "agents.json"
    if agents_file.exists():
        for i, row in enumerate(json.loads(agents_file.read_text()).get("agents", [])):
            row = dict(row)
            row.setdefault("commits", commits_for(row["area"]) if row["area"] in COMMIT_PREFIX else [])
            insert("agents", row, None, f"agents.json[{i}]")

    for path in sorted(INVENTORY.glob("*.json")):
        if path.name == "agents.json":
            continue
        area = path.stem
        try:
            data = json.loads(path.read_text(encoding="utf-8") or "{}")
        except json.JSONDecodeError as e:
            problems.append(f"{path.name}: invalid JSON: {e}")
            continue
        file_counts = {}
        for table, rows in data.items():
            if table not in KEYS:
                problems.append(f"{path.name}: unknown table {table!r}")
                continue
            for i, row in enumerate(rows):
                where = f"{path.name}:{table}[{i}]"
                missing = [k for k in KEYS[table] if row.get(k) in (None, "")]
                if missing:
                    problems.append(f"{where}: missing key column(s) {missing}")
                    continue
                key = label(table, row)
                prior = owner.get((table, key))
                if prior and prior != area:
                    problems.append(f"{where}: {table} row {key!r} also defined by area {prior!r}; this one wins")
                owner[(table, key)] = area
                rowid = insert(table, row, area, where)
                if rowid is None:
                    continue
                steps = row.get("diary_steps") or ([row["diary_step"]] if "diary_step" in row else [])
                for s in steps:
                    explicit_links.append((area, int(s), table, rowid, key))
                file_counts[table] = file_counts.get(table, 0) + 1
        counts[path.name] = file_counts
        db.execute("INSERT INTO load_log (file, area, loaded_at, rows_by_table) VALUES (?, ?, datetime('now'), ?)",
                   (str(path.relative_to(TICKET)), area, json.dumps(file_counts)))

    diary_dir = TICKET / "reference"
    for name, area in DIARIES.items():
        path = diary_dir / name
        if not path.exists():
            continue
        origins = step_origins(path)
        for entry in parse_diary(path):
            origin = origins.get(entry["step"], (None, None))
            row = {k: v for k, v in entry.items() if k != "raw"}
            row.update(agent_area=area, source_area=area, diary_path=str(path.relative_to(TICKET)),
                       created_at=origin[1])
            row.setdefault("commit_hash", origin[0])
            insert("diary_entries", row, area, f"{name} step {entry['step']}")
            text = entry["raw"]
            for table, col in MENTION_KEYS.items():
                for rowid, key in db.execute(f"SELECT id, {col} FROM {table}"):
                    if key and len(key) >= 8 and key in text:
                        db.execute("INSERT OR IGNORE INTO diary_links (agent_area, step, target_table, target_id,"
                                   " target_key, how) VALUES (?, ?, ?, ?, ?, 'mentioned')",
                                   (area, entry["step"], table, rowid, key))
        counts[name] = {"diary_entries": len(parse_diary(path))}

    steps_known = {(a, s) for a, s in db.execute("SELECT agent_area, step FROM diary_entries")}
    for area, step, table, rowid, key in explicit_links:
        if (area, step) not in steps_known:
            problems.append(f"{area}.json: {table} row {key!r} names diary step {step}, which {area}'s diary lacks")
        db.execute("INSERT OR REPLACE INTO diary_links (agent_area, step, target_table, target_id, target_key, how)"
                   " VALUES (?, ?, ?, ?, ?, 'explicit')", (area, step, table, rowid, key))
    return counts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate only; write nothing")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    problems = []
    fd, tmp = tempfile.mkstemp(suffix=".sqlite", dir=args.out.parent if not args.check else None)
    os.close(fd)
    db = sqlite3.connect(tmp)
    try:
        counts = build(db, problems)
        db.commit()
        totals = {t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in [*KEYS, "agents", "diary_entries", "diary_links"]}
    finally:
        db.close()
    for name, c in counts.items():
        print(f"{name:70s} {json.dumps(c)}")
    print("totals:", json.dumps({k: v for k, v in totals.items() if v}))
    for p in problems:
        print("PROBLEM:", p, file=sys.stderr)
    if args.check:
        os.unlink(tmp)
    else:
        os.replace(tmp, args.out)
        print("wrote", args.out)
    sys.exit(1 if any("this one wins" not in p for p in problems) else 0)


if __name__ == "__main__":
    main()
