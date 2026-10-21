-- PB-ARCH-001 codebase inventory schema.
-- One row = one fact about the Playback codebase, with evidence paths so a
-- browsable site can link every claim back to source.  Natural keys are UNIQUE
-- so re-loading a JSON file is idempotent (INSERT OR REPLACE).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,          -- e.g. "services/api", "app", "shared"
  path TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- service | app | shared-lib | python-service | rust-service | infra | tooling | spike
  language TEXT,                      -- typescript | python | rust | shell | sql | caddyfile
  runtime TEXT,                       -- node | python | deepstream | caddy | postgres | nats | ...
  port TEXT,
  purpose TEXT,
  entrypoint TEXT,
  loc_prod INTEGER,
  loc_test INTEGER,
  notes TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY,
  package TEXT NOT NULL,              -- packages.name
  path TEXT NOT NULL UNIQUE,          -- repo-relative file or directory path
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- feature | route | middleware | service | worker | lib | component | hook | page | store | schema | driver | model | config | test-infra | script
  purpose TEXT,
  loc INTEGER,
  key_exports TEXT,                   -- comma/semicolon list of notable exports
  notes TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS functionalities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,             -- recording | live-video | vision-pipeline | search | chat-agent | mcp | stations | annotations | datasets | canvas-3d | calibration | auth | settings | integrations | observability | ops | media | privacy | factory-agents | public-api | ...
  description TEXT NOT NULL,
  surface TEXT,                       -- ui | api | mcp | chat | background | cli | all
  user_facing INTEGER DEFAULT 0,      -- 0/1
  notes TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS functionality_modules (
  functionality TEXT NOT NULL,        -- functionalities.name
  module_path TEXT NOT NULL,          -- modules.path (may be a dir)
  role TEXT,                          -- entry | ui | api | worker | schema | shared | test
  UNIQUE(functionality, module_path)
);

CREATE TABLE IF NOT EXISTS endpoints (
  id INTEGER PRIMARY KEY,
  package TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  auth TEXT,                          -- public | session | admin | sysadmin | api-key | internal | bearer | auth-only
  handler_path TEXT,
  description TEXT,
  route_constant TEXT,                -- name in shared/api-routes.ts if any
  source_area TEXT,
  UNIQUE(package, method, path)
);

CREATE TABLE IF NOT EXISTS db_tables (
  id INTEGER PRIMARY KEY,
  schema_name TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT,
  owner_package TEXT,
  writers TEXT,
  readers TEXT,
  notes TEXT,
  source_area TEXT,
  UNIQUE(schema_name, name)
);

CREATE TABLE IF NOT EXISTS nats_subjects (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL UNIQUE,
  publisher TEXT,
  subscribers TEXT,
  payload TEXT,
  notes TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS service_calls (
  id INTEGER PRIMARY KEY,
  from_package TEXT NOT NULL,
  to_package TEXT NOT NULL,
  protocol TEXT NOT NULL,             -- http | nats | db | fs | unix-socket | rtsp | websocket | mqtt | process
  description TEXT,
  evidence TEXT,
  source_area TEXT,
  UNIQUE(from_package, to_package, protocol, description)
);

CREATE TABLE IF NOT EXISTS reusable_components (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- library | ui-component | service | pattern | tool | schema
  description TEXT NOT NULL,
  current_consumers TEXT,             -- list of packages/modules using it
  external_deps TEXT,                 -- third-party deps it pulls in
  internal_deps TEXT,                 -- other repo modules it depends on (coupling)
  reuse_readiness TEXT NOT NULL,      -- ready | needs-extraction | entangled | domain-specific
  packaging_notes TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS duplications (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  locations TEXT NOT NULL,            -- JSON array of {path, lines, note}
  severity TEXT,                      -- low | medium | high
  suggested_consolidation TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS complexity_hotspots (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  loc INTEGER,
  reason TEXT NOT NULL,
  metric TEXT,                        -- e.g. "LOC", "fan-in", "state machine", "branches", "config surface"
  suggestion TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,              -- what the fact is about (package/module/feature/concept)
  fact TEXT NOT NULL,
  evidence_path TEXT,
  evidence_lines TEXT,
  category TEXT,                      -- architecture | contract | invariant | gotcha | decision | metric | history | security | performance
  confidence TEXT DEFAULT 'observed', -- observed | inferred
  source_area TEXT,
  UNIQUE(subject, fact)
);

CREATE TABLE IF NOT EXISTS dependencies (
  id INTEGER PRIMARY KEY,
  package TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT,
  kind TEXT,                          -- prod | dev | system | model | image
  purpose TEXT,
  source_area TEXT,
  UNIQUE(package, name, kind)
);

CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT,
  summary TEXT,
  topic TEXT,
  kind TEXT,                          -- topic | adr | rule | service-claude-md | spike | plan | investigation | html
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS diagrams (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,               -- mermaid | svg
  source TEXT NOT NULL,
  related TEXT,
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY,
  area TEXT NOT NULL UNIQUE,          -- e.g. "api-core" (matches source_area on every other table)
  number INTEGER,                     -- 1..14 launch order
  title TEXT,
  scope TEXT,                         -- JSON list of repo paths the agent owned
  findings_path TEXT,                 -- ttmp-relative path of the findings markdown
  inventory_path TEXT,                -- ttmp-relative path of the inventory JSON
  diary_path TEXT,                    -- ttmp-relative path of the agent's diary
  status TEXT,                        -- running | done | partial
  started_at TEXT,
  finished_at TEXT,
  summary TEXT,                       -- the agent's final <=300-word summary
  top_findings TEXT,                  -- JSON list of the 5 most important findings
  commits TEXT,                       -- JSON list of {hash, message}
  source_area TEXT
);

CREATE TABLE IF NOT EXISTS diary_entries (
  id INTEGER PRIMARY KEY,
  agent_area TEXT NOT NULL,           -- agents.area ("orchestrator" for the main diary)
  step INTEGER NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,                       -- the 1-2 prose paragraphs
  what_i_did TEXT,
  why TEXT,
  what_worked TEXT,
  what_didnt_work TEXT,               -- verbatim errors/commands
  what_i_learned TEXT,
  what_was_tricky TEXT,
  second_pair_of_eyes TEXT,
  future_work TEXT,
  code_review_instructions TEXT,
  technical_details TEXT,
  commit_hash TEXT,
  created_at TEXT,
  source_area TEXT,
  UNIQUE(agent_area, step)
);

CREATE TABLE IF NOT EXISTS load_log (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,
  area TEXT,
  loaded_at TEXT NOT NULL,
  rows_by_table TEXT
);

-- Convenience views for a browsable site.
CREATE VIEW IF NOT EXISTS v_package_summary AS
SELECT p.name, p.kind, p.language, p.port, p.purpose,
       (SELECT COUNT(*) FROM modules m WHERE m.package = p.name) AS module_count,
       (SELECT COUNT(*) FROM endpoints e WHERE e.package = p.name) AS endpoint_count,
       (SELECT COUNT(*) FROM facts f WHERE f.subject = p.name) AS fact_count
FROM packages p;

CREATE VIEW IF NOT EXISTS v_functionality_map AS
SELECT f.name AS functionality, f.category, f.surface, fm.module_path, fm.role, m.package
FROM functionalities f
LEFT JOIN functionality_modules fm ON fm.functionality = f.name
LEFT JOIN modules m ON m.path = fm.module_path;

CREATE VIEW IF NOT EXISTS v_service_graph AS
SELECT from_package, to_package, protocol, COUNT(*) AS n_calls
FROM service_calls GROUP BY from_package, to_package, protocol;

CREATE VIEW IF NOT EXISTS v_agent_progress AS
SELECT a.area, a.number, a.status,
       (SELECT COUNT(*) FROM diary_entries d WHERE d.agent_area = a.area) AS diary_steps,
       (SELECT MAX(step) FROM diary_entries d WHERE d.agent_area = a.area) AS last_step,
       (SELECT COUNT(*) FROM facts f WHERE f.source_area = a.area) AS facts,
       (SELECT COUNT(*) FROM modules m WHERE m.source_area = a.area) AS modules
FROM agents a ORDER BY a.number;
