CREATE TABLE IF NOT EXISTS case_ai_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  agent_type TEXT NOT NULL CHECK(agent_type IN ('adversarial_review', 'evidence_request', 'hearing_preparation')),
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'fallback', 'failed')),
  engine TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  trigger TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending', 'approved', 'dismissed')),
  review_comment TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  UNIQUE (case_id, agent_type, version_no)
);

CREATE INDEX IF NOT EXISTS idx_case_ai_runs_history
  ON case_ai_runs(case_id, agent_type, version_no DESC);

CREATE TABLE IF NOT EXISTS evidence_request_items (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  missing_evidence_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK(status IN ('pending_approval', 'requested', 'received', 'pending_review', 'verified', 'dismissed')),
  received_document_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES case_ai_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (missing_evidence_id) REFERENCES missing_evidence(id) ON DELETE CASCADE,
  FOREIGN KEY (received_document_id) REFERENCES documents(id) ON DELETE SET NULL,
  UNIQUE(run_id, missing_evidence_id)
);

CREATE INDEX IF NOT EXISTS idx_evidence_request_status
  ON evidence_request_items(case_id, status, updated_at DESC);
