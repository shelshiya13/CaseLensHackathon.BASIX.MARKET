-- 001_init.sql: CaseLens Core Schema
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('lawyer', 'guardian')),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  mobile TEXT UNIQUE,
  password_hash TEXT,
  enrolment_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  code_hmac TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  case_ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL,
  status TEXT NOT NULL,
  court TEXT,
  case_number TEXT,
  filing_date TEXT,
  next_hearing_at TEXT,
  next_hearing_type TEXT,
  assigned_lawyer_id TEXT NOT NULL,
  description TEXT,
  guardian_friendly_title TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  closed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS case_parties (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  name TEXT NOT NULL,
  party_role TEXT NOT NULL CHECK(party_role IN ('client', 'opposing', 'other')),
  notes TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS case_access (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK(access_level IN ('owner_lawyer', 'guardian_view')),
  relationship_label TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(case_id, user_id)
);

CREATE TABLE IF NOT EXISTS case_notes (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  internal INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  doc_type_guess TEXT,
  page_count INTEGER NOT NULL DEFAULT 1,
  shared_with_guardian INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  processing_status TEXT NOT NULL CHECK(processing_status IN ('uploaded', 'extracting', 'structuring', 'validating', 'done', 'failed')),
  failure_reason TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS document_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  text TEXT NOT NULL,
  extraction_method TEXT NOT NULL CHECK(extraction_method IN ('text_layer', 'gemini_ocr', 'plain_text', 'docx')),
  char_count INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  document_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  chunk_id TEXT,
  evidence_type TEXT NOT NULL,
  fact_label TEXT NOT NULL,
  fact_text TEXT NOT NULL,
  entity TEXT,
  date_value TEXT,
  date_raw TEXT,
  amount_value INTEGER,
  currency TEXT,
  amount_raw TEXT,
  source_quote TEXT NOT NULL,
  confidence REAL,
  confidence_basis TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'challenged', 'corrected', 'superseded', 'rejected')),
  supersedes_evidence_id TEXT,
  created_by TEXT NOT NULL CHECK(created_by IN ('evidence_agent', 'human')),
  validation_notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_relations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  from_evidence_id TEXT NOT NULL,
  to_evidence_id TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN ('supports', 'contradicts', 'corresponds_to', 'refers_to')),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (from_evidence_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY (to_evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  claim_source_evidence_id TEXT NOT NULL,
  claim_kind TEXT NOT NULL CHECK(claim_kind IN ('payment_completed', 'delivery_completed', 'contract_exists', 'amount_owed', 'other')),
  status TEXT NOT NULL CHECK(status IN ('verified', 'unverified', 'contradicted', 'insufficient')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_source_evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  conflict_ref TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  evidence_a_id TEXT NOT NULL,
  evidence_b_id TEXT NOT NULL,
  description TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  severity TEXT CHECK(severity IN ('High', 'Medium', 'Low')),
  severity_basis TEXT,
  status TEXT NOT NULL CHECK(status IN ('open', 'resolved_by_correction', 'dismissed_by_human', 'superseded')),
  detected_in_version INTEGER NOT NULL,
  resolved_in_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_a_id) REFERENCES evidence(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_b_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS missing_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  missing_ref TEXT NOT NULL,
  claim_id TEXT,
  required_item TEXT NOT NULL,
  rationale TEXT NOT NULL,
  basis_evidence_ids TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open', 'satisfied', 'dismissed_by_human')),
  detected_in_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS analysis_versions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  trigger_ref TEXT,
  summary_text TEXT NOT NULL,
  assessment_status TEXT NOT NULL CHECK(assessment_status IN ('insufficient_evidence', 'conflict_detected', 'missing_evidence', 'verified_consistent', 'human_review_required')),
  reasoning_json TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL,
  conflict_snapshot_json TEXT NOT NULL,
  missing_snapshot_json TEXT NOT NULL,
  state_diff_json TEXT,
  model_used TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  UNIQUE(case_id, version_no)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  source TEXT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('system', 'lawyer', 'guardian')),
  actor_id TEXT,
  guardian_visible INTEGER NOT NULL DEFAULT 0,
  meta_json TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS human_reviews (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  evidence_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('incorrect', 'correct_value', 'confirm', 'reject', 'dismiss_conflict', 'dismiss_missing', 'signoff')),
  original_value_json TEXT,
  corrected_value_json TEXT,
  reason TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resulting_version_id TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  source_event_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  document_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('process_document', 'run_analysis', 'reanalyze_after_review')),
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'done', 'failed')),
  step TEXT NOT NULL CHECK(step IN ('uploading', 'extracting', 'structuring', 'validating', 'checking_conflicts', 'updating_case_state', 'generating_analysis', 'done')),
  step_log_json TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  case_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_state_store (
  case_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  state_version INTEGER NOT NULL DEFAULT 1,
  omega_session_ref TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Indexes for performance and referential lookups
CREATE INDEX IF NOT EXISTS idx_cases_lawyer ON cases(assigned_lawyer_id);
CREATE INDEX IF NOT EXISTS idx_cases_ref ON cases(case_ref);
CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties(case_id);
CREATE INDEX IF NOT EXISTS idx_case_access_user ON case_access(user_id);
CREATE INDEX IF NOT EXISTS idx_case_access_case ON case_access(case_id);
CREATE INDEX IF NOT EXISTS idx_case_notes_case ON case_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(case_id, sha256);
CREATE INDEX IF NOT EXISTS idx_document_pages_doc ON document_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_case ON evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_evidence_doc ON evidence(document_id);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(case_id, status);
CREATE INDEX IF NOT EXISTS idx_conflicts_case ON conflicts(case_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_status ON conflicts(case_id, status);
CREATE INDEX IF NOT EXISTS idx_missing_case ON missing_evidence(case_id);
CREATE INDEX IF NOT EXISTS idx_missing_status ON missing_evidence(case_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_case ON claims(case_id);
CREATE INDEX IF NOT EXISTS idx_analysis_case ON analysis_versions(case_id, version_no);
CREATE INDEX IF NOT EXISTS idx_timeline_case ON timeline_events(case_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_case ON notifications(case_id);
CREATE INDEX IF NOT EXISTS idx_jobs_case ON jobs(case_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_log(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
