import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGemini } = vi.hoisted(() => ({ mockGemini: { client: null as any, disable: vi.fn() } }));
vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: () => mockGemini.client,
  disableGeminiForAuthenticationError: mockGemini.disable
}));

import { createExpressApp } from '../src/app.js';
import { signToken } from '../src/auth/middleware.js';
import { getDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

const featureModes = ['ask', 'hearing_brief', 'counter_argument', 'document_request'] as const;
type FeatureMode = typeof featureModes[number];
const unavailableCases = [
  { label: '401', error: Object.assign(new Error('unauthorized'), { status: 401 }) },
  { label: '403 invalid key', error: Object.assign(new Error('API key not valid'), { status: 403 }) },
  { label: '429 quota', error: Object.assign(new Error('Resource exhausted'), { status: 429 }) },
  { label: 'timeout', error: Object.assign(new Error('The request timed out'), { name: 'TimeoutError' }) },
  { label: 'invalid API key', error: Object.assign(new Error('API_KEY_INVALID'), { status: 400 }) }
];

let tempDir = '';
let baseUrl = '';
let server: ReturnType<ReturnType<typeof createExpressApp>['listen']> | null = null;
let token = '';
let caseId = '';
let emptyCaseId = '';
const originalDataDir = process.env.DATA_DIR;

async function request(route: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + token);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(baseUrl + route, { ...init, headers });
  return { response, body: await response.json() as any };
}

function responseFor(mode: FeatureMode) {
  const cited = 'The active record supports this statement [E-001].';
  if (mode === 'ask') return { answer: cited };
  if (mode === 'hearing_brief') return {
    case_summary: cited,
    important_facts: [cited], strong_evidence: [cited], weak_evidence: [], conflicts: [], missing_documents: [],
    witness_suggestions: [], questions_for_client: [], questions_for_opposing_counsel: [], timeline: []
  };
  if (mode === 'counter_argument') return { possible_defence_arguments: [cited], possible_prosecution_arguments: [cited], weaknesses: [], risks: [] };
  return { professional_letter: cited, email: cited, client_checklist: [{ document: 'Bank receipt', reason: cited }], document_request: [{ document: 'Bank receipt', reason: cited }] };
}

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-case-ai-'));
  process.env.DATA_DIR = path.join(tempDir, 'data');
  await runMigrations();
  const app = createExpressApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server?.once('listening', resolve));
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('Case AI test server did not start.');
  baseUrl = 'http://127.0.0.1:' + address.port;

  const db = await getDb();
  const now = new Date().toISOString();
  const lawyerId = 'case-ai-lawyer';
  db.prepare('INSERT INTO users (id, role, name, email, created_at) VALUES (?, ?, ?, ?, ?)').run(lawyerId, 'lawyer', 'AI Test Counsel', 'case-ai@example.test', now);
  token = signToken({ userId: lawyerId, role: 'lawyer', name: 'AI Test Counsel', email: 'case-ai@example.test' });

  const addCase = (id: string, ref: string) => {
    db.prepare('INSERT INTO cases (id, case_ref, title, case_type, status, assigned_lawyer_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, ref, 'AI Test Matter', 'Commercial', 'Under Analysis', lawyerId, now, now);
    db.prepare('INSERT INTO case_access (id, case_id, user_id, access_level, created_at) VALUES (?, ?, ?, ?, ?)').run(id + '-access', id, lawyerId, 'owner_lawyer', now);
  };
  caseId = 'case-ai-evidence';
  emptyCaseId = 'case-ai-empty';
  addCase(caseId, 'AI-001');
  addCase(emptyCaseId, 'AI-EMPTY');
  db.prepare("INSERT INTO documents (id, case_id, filename, mime, size_bytes, sha256, storage_path, page_count, uploaded_by, uploaded_at, processing_status) VALUES ('case-ai-doc', ?, 'payment-record.txt', 'text/plain', 32, 'hash', 'payment-record.txt', 1, ?, ?, 'done')").run(caseId, lawyerId, now);
  db.prepare("INSERT INTO evidence (id, case_id, evidence_ref, document_id, page_no, evidence_type, fact_label, fact_text, source_quote, confidence, status, created_by, created_at) VALUES ('case-ai-e1', ?, 'E-001', 'case-ai-doc', 1, 'payment', 'Payment record', 'Payment of INR 500 is recorded on 12 March 2026.', 'Payment of INR 500 is recorded on 12 March 2026.', 0.9, 'active', 'human', ?)").run(caseId, now);
  db.prepare("INSERT INTO evidence (id, case_id, evidence_ref, document_id, page_no, evidence_type, fact_label, fact_text, source_quote, confidence, status, created_by, created_at) VALUES ('case-ai-e2', ?, 'E-002', 'case-ai-doc', 2, 'invoice_line', 'Invoice due date', 'Invoice due date is 20 March 2026.', 'Invoice due date is 20 March 2026.', 0.55, 'active', 'human', ?)").run(caseId, now);
  db.prepare("INSERT INTO conflicts (id, case_id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id, description, why_it_matters, status, detected_in_version, created_at, updated_at) VALUES ('case-ai-conflict', ?, 'C-001', 'date_mismatch', 'case-ai-e1', 'case-ai-e2', 'Records show different dates.', 'Confirm the payment date.', 'open', 1, ?, ?)").run(caseId, now, now);
  db.prepare("INSERT INTO missing_evidence (id, case_id, missing_ref, required_item, rationale, basis_evidence_ids, status, detected_in_version, created_at, updated_at) VALUES ('case-ai-gap', ?, 'M-001', 'Bank credit advice', 'Confirm when the payment posted.', '[\"case-ai-e1\"]', 'open', 1, ?, ?)").run(caseId, now, now);
}, 30_000);

beforeEach(() => {
  mockGemini.client = null;
  mockGemini.disable.mockReset().mockReturnValue(false);
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  const db = await getDb();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (originalDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = originalDataDir;
  vi.restoreAllMocks();
});

describe('grounded case AI routes', () => {
  it.each(featureModes)('%s endpoint uses the stored-evidence fallback when Gemini is not configured', async mode => {
    const { response, body } = await request('/api/cases/' + caseId + '/ai/' + mode, { method: 'POST', body: JSON.stringify(mode === 'ask' ? { question: 'What payment date is recorded?' } : {}) });
    expect(response.status).toBe(200);
    expect(body.generationSource).toBe('stored_evidence');
    expect(body.fallbackUsed).toBe(true);
    expect(JSON.stringify(body.result)).toContain('[E-001]');
    expect(JSON.stringify(body.result)).not.toContain('temporarily unavailable');
  });

  it.each(featureModes)('%s endpoint parses a successful Gemini response and preserves only valid citations', async mode => {
    const generateContent = vi.fn().mockResolvedValue({ text: JSON.stringify(responseFor(mode)) });
    mockGemini.client = { models: { generateContent } };
    const { response, body } = await request('/api/cases/' + caseId + '/ai/' + mode, { method: 'POST', body: JSON.stringify(mode === 'ask' ? { question: 'What payment date is recorded?' } : {}) });
    expect(response.status).toBe(200);
    expect(body.generationSource).toBe('gemini');
    expect(generateContent).toHaveBeenCalledOnce();
    expect(JSON.stringify(body.result)).toContain('[E-001]');
  });

  it.each([
    ['malformed JSON', '{not valid JSON'],
    ['forged citation', JSON.stringify({ answer: 'The record proves payment was complete [E-999].' })]
  ])('falls back when Gemini returns %s', async (_label, modelText) => {
    mockGemini.client = { models: { generateContent: vi.fn().mockResolvedValue({ text: modelText }) } };
    const { response, body } = await request('/api/cases/' + caseId + '/ai/ask', { method: 'POST', body: JSON.stringify({ question: 'What payment is recorded?' }) });
    expect(response.status).toBe(200);
    expect(body.generationSource).toBe('stored_evidence');
    expect(body.result.answer).toContain('[E-001]');
    expect(body.result.answer).not.toContain('[E-999]');
  });

  it.each(unavailableCases.flatMap(failure => featureModes.map(mode => ({ ...failure, mode }))))(
    '$mode falls back to evidence after Gemini $label failure',
    async ({ mode, error }) => {
      const generateContent = vi.fn().mockRejectedValue(error);
      mockGemini.client = { models: { generateContent } };
      const { response, body } = await request('/api/cases/' + caseId + '/ai/' + mode, { method: 'POST', body: JSON.stringify(mode === 'ask' ? { question: 'What payment date is recorded?' } : {}) });
      expect(response.status).toBe(200);
      expect(body.generationSource).toBe('stored_evidence');
      expect(body.fallbackUsed).toBe(true);
      expect(JSON.stringify(body.result)).toContain('[E-001]');
      expect(JSON.stringify(body.result)).not.toContain('temporarily unavailable');
    }
  );

  it('returns the sole no-evidence message only when the active evidence query is empty', async () => {
    const { response, body } = await request('/api/cases/' + emptyCaseId + '/ai/hearing_brief', { method: 'POST', body: '{}' });
    expect(response.status).toBe(422);
    expect(body.error).toEqual({ code: 'NO_ACTIVE_EVIDENCE', message: 'No evidence is currently available for grounded analysis.' });
  });

  it('validates the Ask the Case question before generation', async () => {
    const { response, body } = await request('/api/cases/' + caseId + '/ai/ask', { method: 'POST', body: JSON.stringify({ question: '   ' }) });
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('INVALID_QUESTION');
    expect(mockGemini.client).toBeNull();
  });
});
