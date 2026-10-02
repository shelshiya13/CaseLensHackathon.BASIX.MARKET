CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT,
  document_id TEXT,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success', 'failed', 'needs_review')),
  confidence REAL NOT NULL DEFAULT 0,
  citations TEXT,
  source_quotes TEXT,
  page_references TEXT,
  summary TEXT NOT NULL,
  diagnostics_json TEXT,
  payload_json TEXT,
  retry_attempts INTEGER NOT NULL DEFAULT 0,
  persisted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_case_document
  ON agent_runs (case_id, document_id, agent_name, persisted_at);
