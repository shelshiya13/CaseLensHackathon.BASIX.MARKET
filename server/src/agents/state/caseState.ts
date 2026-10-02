import { getDb } from '../../db/client.js';

export interface CaseStateDocument {
  id: string;
  filename: string;
  type?: string;
  pages: number;
  processed: boolean;
  sha256: string;
}

export interface CaseStateEvidence {
  id: string;
  ref: string;
  docId: string;
  page: number;
  type: string;
  fact: string;
  entity?: string | null;
  date?: string | null;
  dateRaw?: string | null;
  amount?: number | null;
  currency?: string | null;
  amountRaw?: string | null;
  sourceQuote: string;
  status: 'active' | 'challenged' | 'corrected' | 'superseded' | 'rejected';
  createdBy: 'evidence_agent' | 'human';
}

export interface CaseStateRelation {
  id: string;
  fromEvidenceId: string;
  toEvidenceId: string;
  relation: 'supports' | 'contradicts' | 'corresponds_to' | 'refers_to';
  reason: string;
}

export interface CaseStateClaim {
  id: string;
  claimText: string;
  claimSourceEvidenceId: string;
  claimKind: 'payment_completed' | 'delivery_completed' | 'contract_exists' | 'amount_owed' | 'other';
  status: 'verified' | 'unverified' | 'contradicted' | 'insufficient';
}

export interface CaseStateConflict {
  id: string;
  ref: string;
  conflictType: string;
  evidenceAId: string;
  evidenceBId: string;
  description: string;
  whyItMatters: string;
  severity?: 'High' | 'Medium' | 'Low' | null;
  severityBasis?: string | null;
  status: 'open' | 'resolved_by_correction' | 'dismissed_by_human' | 'superseded';
}

export interface CaseStateMissingEvidence {
  id: string;
  ref: string;
  claimId?: string | null;
  requiredItem: string;
  rationale: string;
  basisEvidenceIds: string[];
  status: 'open' | 'satisfied' | 'dismissed_by_human';
}

export interface CaseStateHumanCorrection {
  id: string;
  evidenceId?: string | null;
  action: string;
  originalValue?: any;
  correctedValue?: any;
  reason: string;
  reviewerId: string;
  createdAt: string;
}

export interface CaseStateAssessment {
  versionNo: number;
  status: 'insufficient_evidence' | 'conflict_detected' | 'missing_evidence' | 'verified_consistent' | 'human_review_required';
  summary: string;
  citedEvidenceRefs: string[];
  findings?: Array<{
    finding_id: string;
    statement: string;
    evidence_refs: string[];
    rule_or_fact_applied: string;
    conflict_refs: string[];
    missing_refs: string[];
    impact: string;
    status: 'supported' | 'contradicted' | 'unverified' | 'insufficient';
  }>;
}

export interface CaseState {
  caseId: string;
  stateVersion: number;
  documents: CaseStateDocument[];
  evidence: CaseStateEvidence[];
  relations: CaseStateRelation[];
  claims: CaseStateClaim[];
  conflicts: CaseStateConflict[];
  missingEvidence: CaseStateMissingEvidence[];
  humanCorrections: CaseStateHumanCorrection[];
  currentAssessment: CaseStateAssessment | null;
  previousAssessments: number[];
  timelineCursor?: string;
  lastAnalyzedAt?: string;
  openQuestions: string[];
}

export async function buildCaseStateFromDb(caseId: string): Promise<CaseState> {
  const db = await getDb();

  const docs = db.prepare<any>(`
    SELECT id, filename, doc_type_guess as type, page_count as pages,
           processing_status, sha256
    FROM documents WHERE case_id = ?
  `).all(caseId).map(d => ({
    id: d.id,
    filename: d.filename,
    type: d.type || undefined,
    pages: d.pages,
    processed: d.processing_status === 'done',
    sha256: d.sha256
  }));

  const evs = db.prepare<any>(`
    SELECT id, evidence_ref, document_id, page_no, evidence_type,
           fact_text, entity, date_value, date_raw, amount_value, currency,
           amount_raw, source_quote, status, created_by
    FROM evidence WHERE case_id = ?
    ORDER BY evidence_ref ASC
  `).all(caseId).map(e => ({
    id: e.id,
    ref: e.evidence_ref,
    docId: e.document_id,
    page: e.page_no,
    type: e.evidence_type,
    fact: e.fact_text,
    entity: e.entity,
    date: e.date_value,
    dateRaw: e.date_raw,
    amount: e.amount_value,
    currency: e.currency,
    amountRaw: e.amount_raw,
    sourceQuote: e.source_quote,
    status: e.status,
    createdBy: e.created_by
  }));

  const rels = db.prepare<any>(`
    SELECT id, from_evidence_id, to_evidence_id, relation, reason
    FROM evidence_relations WHERE case_id = ?
  `).all(caseId).map(r => ({
    id: r.id,
    fromEvidenceId: r.from_evidence_id,
    toEvidenceId: r.to_evidence_id,
    relation: r.relation,
    reason: r.reason
  }));

  const clms = db.prepare<any>(`
    SELECT id, claim_text, claim_source_evidence_id, claim_kind, status
    FROM claims WHERE case_id = ?
  `).all(caseId).map(c => ({
    id: c.id,
    claimText: c.claim_text,
    claimSourceEvidenceId: c.claim_source_evidence_id,
    claimKind: c.claim_kind,
    status: c.status
  }));

  const confs = db.prepare<any>(`
    SELECT id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id,
           description, why_it_matters, severity, severity_basis, status
    FROM conflicts WHERE case_id = ?
  `).all(caseId).map(c => ({
    id: c.id,
    ref: c.conflict_ref,
    conflictType: c.conflict_type,
    evidenceAId: c.evidence_a_id,
    evidenceBId: c.evidence_b_id,
    description: c.description,
    whyItMatters: c.why_it_matters,
    severity: c.severity,
    severityBasis: c.severity_basis,
    status: c.status
  }));

  const miss = db.prepare<any>(`
    SELECT id, missing_ref, claim_id, required_item, rationale,
           basis_evidence_ids, status
    FROM missing_evidence WHERE case_id = ?
  `).all(caseId).map(m => ({
    id: m.id,
    ref: m.missing_ref,
    claimId: m.claim_id,
    requiredItem: m.required_item,
    rationale: m.rationale,
    basisEvidenceIds: JSON.parse(m.basis_evidence_ids || '[]'),
    status: m.status
  }));

  const revs = db.prepare<any>(`
    SELECT id, evidence_id, action, original_value_json, corrected_value_json,
           reason, reviewer_id, created_at
    FROM human_reviews WHERE case_id = ?
    ORDER BY created_at ASC
  `).all(caseId).map(h => ({
    id: h.id,
    evidenceId: h.evidence_id,
    action: h.action,
    originalValue: h.original_value_json ? JSON.parse(h.original_value_json) : null,
    correctedValue: h.corrected_value_json ? JSON.parse(h.corrected_value_json) : null,
    reason: h.reason,
    reviewerId: h.reviewer_id,
    createdAt: h.created_at
  }));

  const allVersions = db.prepare<any>(`
    SELECT version_no, assessment_status, summary_text, reasoning_json, created_at
    FROM analysis_versions WHERE case_id = ?
    ORDER BY version_no ASC
  `).all(caseId);

  const prevVersionNos = allVersions.map(v => v.version_no);
  const latestVersion = allVersions[allVersions.length - 1];

  let currentAssessment: CaseStateAssessment | null = null;
  let openQuestions: string[] = [];
  if (latestVersion) {
    const reasoning = JSON.parse(latestVersion.reasoning_json || '{}');
    const citedRefs: string[] = [];
    if (reasoning.findings) {
      for (const f of reasoning.findings) {
        if (f.evidence_refs) citedRefs.push(...f.evidence_refs);
      }
    }
    openQuestions = reasoning.open_questions || [];

    currentAssessment = {
      versionNo: latestVersion.version_no,
      status: latestVersion.assessment_status,
      summary: latestVersion.summary_text,
      citedEvidenceRefs: Array.from(new Set(citedRefs)),
      findings: reasoning.findings
    };
  }

  // Check state store for version number
  const storeRow = db.prepare<any>(`
    SELECT state_version FROM case_state_store WHERE case_id = ?
  `).get(caseId);

  return {
    caseId,
    stateVersion: storeRow?.state_version || 1,
    documents: docs,
    evidence: evs,
    relations: rels,
    claims: clms,
    conflicts: confs,
    missingEvidence: miss,
    humanCorrections: revs,
    currentAssessment,
    previousAssessments: prevVersionNos,
    lastAnalyzedAt: latestVersion?.created_at,
    openQuestions
  };
}
