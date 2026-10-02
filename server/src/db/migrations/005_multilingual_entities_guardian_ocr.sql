-- 005_multilingual_entities_guardian_ocr.sql
PRAGMA foreign_keys = ON;

-- Multilingual document translations (original preserved + English translation)
CREATE TABLE IF NOT EXISTS document_translations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_no INTEGER NOT NULL,
  source_language TEXT NOT NULL DEFAULT 'en',
  original_text TEXT NOT NULL,
  english_text TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deterministic_fallback',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(document_id, page_no, source_language)
);

-- Entity resolution: canonical entities + aliases with lawyer review state
CREATE TABLE IF NOT EXISTS entity_clusters (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','accepted','rejected','merged','split')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'deterministic',
  created_at TEXT NOT NULL,
  FOREIGN KEY (cluster_id) REFERENCES entity_clusters(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  UNIQUE(cluster_id, alias)
);

-- Guardian-friendly summaries: lawyer approval text -> plain translations (no confidential notes)
CREATE TABLE IF NOT EXISTS guardian_summaries (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  approval_text TEXT NOT NULL,
  plain_english TEXT NOT NULL,
  tamil_text TEXT NOT NULL,
  hindi_text TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deterministic_fallback',
  approved_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- OCR results for handwritten/phone/scan/receipt/invoice/signed docs with confidence + highlight
CREATE TABLE IF NOT EXISTS ocr_results (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_no INTEGER NOT NULL DEFAULT 1,
  raw_text TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'deterministic_fallback',
  highlights_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  UNIQUE(document_id, page_no)
);

CREATE INDEX IF NOT EXISTS idx_doc_translations_doc ON document_translations(document_id);
CREATE INDEX IF NOT EXISTS idx_entity_clusters_case ON entity_clusters(case_id);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_case ON entity_aliases(case_id);
CREATE INDEX IF NOT EXISTS idx_guardian_summaries_case ON guardian_summaries(case_id);
CREATE INDEX IF NOT EXISTS idx_ocr_results_doc ON ocr_results(document_id);
