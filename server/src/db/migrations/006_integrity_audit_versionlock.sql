-- 006_integrity_audit_versionlock.sql
PRAGMA foreign_keys = ON;

-- Hash-chained audit records
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN record_hash TEXT;

-- Version lock sign-offs: invalidated automatically on later modification
CREATE TABLE IF NOT EXISTS version_signoffs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  version_id TEXT,
  signer_id TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'valid' CHECK(status IN ('valid','invalidated')),
  invalidated_at TEXT,
  invalidate_reason TEXT,
  signature_hash TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  UNIQUE(case_id, version_no, signer_id, signed_at)
);

-- Document integrity verification log (tamper detection)
CREATE TABLE IF NOT EXISTS integrity_checks (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL,
  actual_sha256 TEXT NOT NULL,
  match INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  checked_by TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_signoffs_case ON version_signoffs(case_id, version_no);
CREATE INDEX IF NOT EXISTS idx_integrity_doc ON integrity_checks(document_id);
