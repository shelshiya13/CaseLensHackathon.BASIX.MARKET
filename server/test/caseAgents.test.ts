import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { mockedGemini } = vi.hoisted(() => ({ mockedGemini: { client: null as any, rejected: false } }));
vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: () => mockedGemini.client,
  disableGeminiForAuthenticationError: () => false,
  isGeminiAuthenticationRejected: () => mockedGemini.rejected,
  getGeminiApiKey: () => mockedGemini.client ? 'test-key' : null
}));

import { createExpressApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/client.js';
import { signToken } from '../src/auth/middleware.js';
import { CASE_AGENT_TYPES, markEvidenceRequestReadyForReview, runCaseAgent, updateEvidenceRequestOnDocument } from '../src/agents/caseAgents.js';

let tempDir = '';
let baseUrl = '';
let server: ReturnType<ReturnType<typeof createExpressApp>['listen']> | null = null;
let lawyerToken = '';
let otherLawyerToken = '';
let lawyerId = '';
let caseId = '';
let missingId = '';
const originalDataDir = process.env.DATA_DIR;

async function request<T = any>(route: string, init: RequestInit = {}, token = lawyerToken) {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : contentType.startsWith('text/') ? await response.text() : await response.arrayBuffer();
  return { response, body: body as T };
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-ai-agents-'));
  process.env.DATA_DIR = path.join(tempDir, 'data');
  mockedGemini.client = null;
  await runMigrations();
  const app = createExpressApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server?.once('listening', resolve));
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('AI agent test server did not start.');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const register = async (email: string) => {
    const res = await fetch(`${baseUrl}/api/auth/lawyer/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Agent Test Counsel', email, password: 'integration-test-password' }) });
    const data = await res.json(); if (!res.ok) throw new Error(JSON.stringify(data)); return data.token as string;
  };
  const lawyerEmail = `agent-${Date.now()}@example.test`;
  lawyerToken = await register(lawyerEmail);
  lawyerId = (await getDb()).prepare<any>('SELECT id FROM users WHERE email = ?').get(lawyerEmail)?.id;
  otherLawyerToken = await register(`other-agent-${Date.now()}@example.test`);
  const guardianEmail = `guardian-agent-${Date.now()}@example.test`;
  const created = await request<{ caseId: string }>('/api/cases', { method: 'POST', body: JSON.stringify({ caseRef: `AGENT-${Date.now()}`, title: 'Agent Integration Matter', caseType: 'Commercial', nextHearingAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), guardianIdentifier: guardianEmail }) });
  caseId = created.body.caseId;

  const db = await getDb();
  const documentA = 'agent-test-document-a';
  const documentB = 'agent-test-document-b';
  const now = new Date().toISOString();
  const createDoc = (id: string, filename: string) => db.prepare(`INSERT INTO documents (id, case_id, filename, mime, size_bytes, sha256, storage_path, doc_type_guess, page_count, shared_with_guardian, uploaded_by, uploaded_at, processing_status) VALUES (?, ?, ?, 'text/plain', 20, ?, ?, 'record', 1, 0, ?, ?, 'done')`).run(id, caseId, filename, id, path.join(tempDir, filename), lawyerId, now);
  createDoc(documentA, 'bank-record.txt'); createDoc(documentB, 'signed-ledger.txt');
  const evidenceA = 'agent-evidence-a'; const evidenceB = 'agent-evidence-b';
  const insertEvidence = (id: string, ref: string, documentId: string, fact: string, quote: string, confidence: number) => db.prepare(`INSERT INTO evidence (id, case_id, evidence_ref, document_id, page_no, evidence_type, fact_label, fact_text, source_quote, confidence, confidence_basis, status, created_by, created_at) VALUES (?, ?, ?, ?, 1, 'financial_record', 'Payment record', ?, ?, ?, 'OCR confidence value', 'active', 'human', ?)`)
    .run(id, caseId, ref, documentId, fact, quote, confidence, now);
  insertEvidence(evidenceA, 'E-1', documentA, 'Bank record shows a partial payment of 500.', 'Partial payment: INR 500', 0.92);
  insertEvidence(evidenceB, 'E-2', documentB, 'Ledger records full payment of 900.', 'Paid in full: INR 900', 0.48);
  db.prepare(`INSERT INTO claims (id, case_id, claim_text, claim_source_evidence_id, claim_kind, status, created_at, updated_at) VALUES ('agent-claim', ?, 'Payment was completed in full.', ?, 'payment_completed', 'unverified', ?, ?)`).run(caseId, evidenceB, now, now);
  db.prepare(`INSERT INTO conflicts (id, case_id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id, description, why_it_matters, severity, status, detected_in_version, created_at, updated_at) VALUES ('agent-conflict', ?, 'C-1', 'amount_mismatch', ?, ?, 'Records show different payment totals.', 'The paid amount requires verification.', 'High', 'open', 1, ?, ?)`).run(caseId, evidenceA, evidenceB, now, now);
  db.prepare(`INSERT INTO analysis_versions (id, case_id, version_no, trigger, summary_text, assessment_status, reasoning_json, evidence_snapshot_json, conflict_snapshot_json, missing_snapshot_json, model_used, created_at) VALUES ('agent-analysis', ?, 1, 'test', 'One supported payment record.', 'human_review_required', ?, '[]', '[]', '[]', 'deterministic', ?)`).run(caseId, JSON.stringify({ findings: [{ status: 'supported', evidence_refs: ['E-1'] }] }), now);
  missingId = 'agent-missing';
  db.prepare(`INSERT INTO missing_evidence (id, case_id, missing_ref, required_item, rationale, basis_evidence_ids, status, detected_in_version, created_at, updated_at) VALUES (?, ?, 'M-1', 'bank transfer confirmation', 'The records differ and a transfer confirmation would help reconcile the amount.', ?, 'open', 1, ?, ?)`).run(missingId, caseId, JSON.stringify([evidenceA, evidenceB]), now, now);
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  const db = await getDb(); db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = originalDataDir;
});

describe('case AI agents', () => {
  it('ground-cites adversarial findings and stores audit and timeline history', async () => {
    const { response, body } = await request<{ run: any }>(`/api/cases/${caseId}/ai-agents/adversarial_review/run`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(200);
    expect(body.run.status).toBe('fallback');
    expect(body.run.engine).toBe('deterministic rules');
    expect(body.run.payload.findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'Contradictory evidence', status: 'For Human Review' })]));
    expect(body.run.payload.findings).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'Unsupported assumption', evidenceRefs: ['E-2'] })]));
    for (const finding of body.run.payload.findings) {
      for (const statement of [finding.counterArgument, finding.suggestedVerification, finding.confidenceExplanation]) {
        expect(statement.evidenceRefs.length).toBeGreaterThan(0);
        expect(statement.evidenceRefs.every((ref: string) => ['E-1', 'E-2'].includes(ref))).toBe(true);
        expect(statement.text).toMatch(/\[E-[12]\]/);
      }
    }
    const db = await getDb();
    expect(db.prepare<any>("SELECT COUNT(*) AS c FROM audit_log WHERE case_id = ? AND action = 'case_ai_agent_completed'").get(caseId)?.c).toBeGreaterThan(0);
    expect(db.prepare<any>("SELECT COUNT(*) AS c FROM timeline_events WHERE case_id = ? AND event_type = 'case_ai_agent_completed'").get(caseId)?.c).toBeGreaterThan(0);
  });

  it('creates approval-gated evidence drafts and progresses request lifecycle only after lawyer approval', async () => {
    const { response, body } = await request<{ run: any }>(`/api/cases/${caseId}/ai-agents/evidence_request/run`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(200);
    const run = body.run;
    expect(run.payload.approvalRequired).toBe(true);
    expect(run.payload.deliveryStatus).toContain('Not sent');
    expect(run.payload.requests[0].missingEvidenceId).toBe(missingId);
    expect(run.payload.requests[0].reason.evidenceRefs).toEqual(['E-1', 'E-2']);
    let { body: history } = await request<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`);
    expect(history.runs.find(item => item.id === run.id).requestItems[0].status).toBe('pending_approval');
    const approve = await request<{ run: any }>(`/api/cases/${caseId}/ai-agents/runs/${run.id}/review`, { method: 'PATCH', body: JSON.stringify({ decision: 'approve' }) });
    expect(approve.response.status).toBe(200);
    ({ body: history } = await request<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`));
    expect(history.runs.find(item => item.id === run.id).requestItems[0].status).toBe('requested');
    const db = await getDb();
    expect(db.prepare<any>("SELECT COUNT(*) AS c FROM notifications WHERE case_id = ? AND kind = 'ai_agent_review_required'").get(caseId)?.c).toBeGreaterThan(0);
    expect(db.prepare<any>("SELECT COUNT(*) AS c FROM timeline_events WHERE case_id = ? AND event_type = 'evidence_request_approved'").get(caseId)?.c).toBe(1);

    const documentId = 'incoming-confirmation-doc'; const now = new Date().toISOString();
    db.prepare(`INSERT INTO documents (id, case_id, filename, mime, size_bytes, sha256, storage_path, doc_type_guess, page_count, shared_with_guardian, uploaded_by, uploaded_at, processing_status) VALUES (?, ?, 'incoming-bank-transfer-confirmation.txt', 'text/plain', 50, 'new-doc-hash', ?, 'bank_record', 1, 0, ?, ?, 'uploaded')`).run(documentId, caseId, path.join(tempDir, 'incoming.txt'), lawyerId, now);
    await updateEvidenceRequestOnDocument(caseId, documentId);
    ({ body: history } = await request<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`));
    expect(history.runs.find(item => item.id === run.id).requestItems[0].status).toBe('received');
    db.prepare("UPDATE documents SET processing_status = 'done' WHERE id = ?").run(documentId);
    db.prepare(`INSERT INTO evidence (id, case_id, evidence_ref, document_id, page_no, evidence_type, fact_label, fact_text, source_quote, confidence, status, created_by, created_at) VALUES ('agent-evidence-c', ?, 'E-3', ?, 1, 'bank_record', 'Transfer confirmation', 'Bank transfer confirmation received.', 'Transfer confirmation received', 0.9, 'active', 'human', ?)`).run(caseId, documentId, now);
    await markEvidenceRequestReadyForReview(caseId, documentId);
    ({ body: history } = await request<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`));
    expect(history.runs.find(item => item.id === run.id).requestItems[0].status).toBe('pending_review');
    const itemId = history.runs.find(item => item.id === run.id).requestItems[0].id;
    const verified = await request(`/api/cases/${caseId}/ai-agents/evidence-requests/${itemId}/verify`, { method: 'POST', body: JSON.stringify({ verified: true }) });
    expect(verified.response.status).toBe(200);
    expect(db.prepare<any>('SELECT status FROM missing_evidence WHERE id = ?').get(missingId)?.status).toBe('satisfied');
  });

  it('builds cited hearing versions with PDF and Markdown export', async () => {
    const first = await runCaseAgent(caseId, 'hearing_preparation', 'test-lawyer');
    const second = await runCaseAgent(caseId, 'hearing_preparation', 'test-lawyer');
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.payload.verifiedFacts).toHaveLength(1);
    expect(second.payload.verifiedFacts[0].evidenceRefs).toEqual(['E-1']);
    const walk = (value: any): any[] => value && typeof value === 'object'
      ? (Array.isArray(value) ? value.flatMap(walk) : (typeof value.text === 'string' ? [value, ...Object.values(value).filter(v => v !== value.text).flatMap(walk)] : Object.values(value).flatMap(walk)))
      : [];
    for (const statement of walk(second.payload)) {
      expect(statement.evidenceRefs.length).toBeGreaterThan(0);
      expect(statement.evidenceRefs.every((ref: string) => ['E-1', 'E-2', 'E-3'].includes(ref))).toBe(true);
    }
    const pdf = await request<ArrayBuffer>(`/api/cases/${caseId}/ai-agents/runs/${second.id}/brief.pdf`);
    expect(pdf.response.status).toBe(200);
    const pdfText = Buffer.from(pdf.body).toString('latin1');
    expect(pdfText.slice(0, 5)).toBe('%PDF-');
    expect(Number(pdfText.match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1])).toBe(1);
    const md = await request<string>(`/api/cases/${caseId}/ai-agents/runs/${second.id}/brief.md`);
    expect(md.response.status).toBe(200);
    expect(md.body).toContain('[E-1]');
    const { body: history } = await request<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`);
    expect(history.runs.filter(run => run.agentType === 'hearing_preparation')).toHaveLength(2);
  });

  it('uses Gemini when available and hides provider errors behind deterministic fallback', async () => {
    mockedGemini.client = { models: { generateContent: async () => ({ text: JSON.stringify({ suggestions: [
      { section: 'adversarial_review', text: 'The ledger records full payment of 900.', evidenceRefs: ['E-2'] },
      { section: 'adversarial_review', text: 'Fabricated unsupported line.', evidenceRefs: ['E-999'] },
      { section: 'adversarial_review', text: 'The unrelated vehicle was inspected yesterday.', evidenceRefs: ['E-2'] }
    ] }) }) } };
    const geminiRun = await runCaseAgent(caseId, 'adversarial_review', 'test-lawyer');
    expect(geminiRun.status).toBe('completed');
    expect(geminiRun.engine).not.toBe('deterministic rules');
    expect(geminiRun.payload.aiSuggestions).toHaveLength(1);
    expect(geminiRun.payload.aiSuggestions[0].text).toContain('[E-2]');
    mockedGemini.client = { models: { generateContent: async () => { throw new Error('secret provider response details'); } } };
    const fallbackRun = await runCaseAgent(caseId, 'hearing_preparation', 'test-lawyer');
    expect(fallbackRun.status).toBe('fallback');
    expect(JSON.stringify(fallbackRun.payload)).not.toContain('secret provider response details');
    mockedGemini.client = null;
  });

  it('enforces lawyer case permissions and protects agent exports', async () => {
    const denied = await request(`/api/cases/${caseId}/ai-agents`, {}, otherLawyerToken);
    expect(denied.response.status).toBe(404);
    const anonymous = await request(`/api/cases/${caseId}/ai-agents`, {}, '');
    expect(anonymous.response.status).toBe(401);
    expect(CASE_AGENT_TYPES).toHaveLength(3);
    const db = await getDb();
    const latestHearing = db.prepare<any>("SELECT id FROM case_ai_runs WHERE case_id = ? AND agent_type = 'hearing_preparation' ORDER BY version_no DESC LIMIT 1").get(caseId);
    const guardian = db.prepare<any>("SELECT id FROM users WHERE role = 'guardian' LIMIT 1").get();
    if (guardian) {
      const guardianToken = signToken({ userId: guardian.id, role: 'guardian', name: 'Guardian' });
      const guardianResponse = await request(`/api/cases/${caseId}/ai-agents/runs/${latestHearing.id}/brief.pdf`, {}, guardianToken);
      expect(guardianResponse.response.status).toBe(403);
    }
  });
});
