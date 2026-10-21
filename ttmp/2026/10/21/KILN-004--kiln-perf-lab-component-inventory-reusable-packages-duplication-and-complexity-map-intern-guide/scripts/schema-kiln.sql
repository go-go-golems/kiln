-- KILN-004 extension of the PB-ARCH-001 inventory schema (schema.sql, copied verbatim from /tmp/schema.sql).
-- Applied after schema.sql. Adds what a Kiln × Perf Lab inventory needs that a Playback one does not:
-- versioned record/wire formats, the prompt context of a diary step, and crosslinks from diary steps to rows.

ALTER TABLE diary_entries ADD COLUMN prompt_context TEXT;
ALTER TABLE diary_entries ADD COLUMN diary_path TEXT;     -- ticket-relative markdown the step was parsed from

CREATE TABLE IF NOT EXISTS formats (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- e.g. "kiln-program/1", "kiln-paired/1", "perf-lab-sampler/1"
  kind TEXT,                          -- record | wire | file | archive | ir | manifest | protocol
  producers TEXT,                     -- modules/packages that write it
  consumers TEXT,                     -- modules/packages that read it
  fields TEXT,                        -- JSON list of {name, type, note}, or prose
  definition_path TEXT,
  definition_lines TEXT,
  notes TEXT,
  source_area TEXT
);

-- One row per (diary step → inventory row). how = 'explicit' when the row carried diary_step(s) in its JSON,
-- 'mentioned' when the loader found the row's key (a path or format name) in the step's text.
CREATE TABLE IF NOT EXISTS diary_links (
  id INTEGER PRIMARY KEY,
  agent_area TEXT NOT NULL,
  step INTEGER NOT NULL,
  target_table TEXT NOT NULL,
  target_id INTEGER,                  -- rowid in target_table for this build (the DB is rebuilt on every load)
  target_key TEXT NOT NULL,           -- the row's natural key, human-readable
  how TEXT NOT NULL,
  UNIQUE(agent_area, step, target_table, target_key)
);

CREATE VIEW IF NOT EXISTS v_diary_crosslinks AS
SELECT d.agent_area, d.step, d.title AS step_title, d.commit_hash, l.target_table, l.target_key, l.how
FROM diary_entries d JOIN diary_links l ON l.agent_area = d.agent_area AND l.step = d.step;

CREATE VIEW IF NOT EXISTS v_area_counts AS
SELECT a.area,
       (SELECT COUNT(*) FROM modules x WHERE x.source_area = a.area) AS modules,
       (SELECT COUNT(*) FROM facts x WHERE x.source_area = a.area) AS facts,
       (SELECT COUNT(*) FROM endpoints x WHERE x.source_area = a.area) AS endpoints,
       (SELECT COUNT(*) FROM duplications x WHERE x.source_area = a.area) AS duplications,
       (SELECT COUNT(*) FROM reusable_components x WHERE x.source_area = a.area) AS reusable,
       (SELECT COUNT(*) FROM complexity_hotspots x WHERE x.source_area = a.area) AS hotspots,
       (SELECT COUNT(*) FROM formats x WHERE x.source_area = a.area) AS formats,
       (SELECT COUNT(*) FROM diary_entries x WHERE x.agent_area = a.area) AS diary_steps,
       (SELECT COUNT(*) FROM diary_links x WHERE x.agent_area = a.area) AS diary_links
FROM agents a ORDER BY a.number;
