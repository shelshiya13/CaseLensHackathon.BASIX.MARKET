import React from 'react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: () => null,
  disableGeminiForAuthenticationError: () => false,
  isGeminiAuthenticationRejected: () => false
}));

import { createExpressApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/client.js';
import { signToken } from '../src/auth/middleware.js';
import { EvidenceTab } from '../../src/pages/lawyer/tabs/EvidenceTab.js';

const demoDir = path.resolve(process.cwd(), 'server/src/seed/demo-docs');
const envDataDir = process.env.DATA_DIR;
let tempDir = '';
let baseUrl = '';
let server: ReturnType<ReturnType<typeof createExpressApp>['listen']> | null = null;
let token = '';

async function api<T>(route: string, init: RequestInit = {}, authToken = token): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${authToken}`);
  const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
  const body = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body as T;
}

async function waitForJob(jobId: string): Promise<any> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await api<{ job: any }>(`/api/jobs/${jobId}`);
    if (response.job.status === 'done') return response.job;
    if (response.job.status === 'failed') throw new Error(`Job ${jobId} failed: ${response.job.error}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function createCase(caseRef: string, guardianIdentifier?: string): Promise<string> {
  const result = await api<{ caseId: string }>('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caseRef,
      title: `Integration ${caseRef}`,
      caseType: 'Commercial',
      guardianIdentifier,
      guardianName: guardianIdentifier ? 'Test Guardian' : undefined
    })
  });
  return result.caseId;
}

async function uploadFiles(caseId: string, filenames: string[], shareWithGuardian = false): Promise<string[]> {
  const form = new FormData();
  form.append('shareWithGuardian', String(shareWithGuardian));
  for (const filename of filenames) {
    form.append('files', new Blob([fs.readFileSync(path.join(demoDir, filename))], { type: 'application/pdf' }), filename);
  }
  const result = await api<{ documents: Array<{ docId: string; jobId: string }> }>(`/api/cases/${caseId}/documents`, {
    method: 'POST',
    body: form
  });
  return result.documents.map(document => document.jobId);
}

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-pipeline-'));
  process.env.DATA_DIR = path.join(tempDir, 'data');
  await runMigrations();

  const app = createExpressApp();
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server?.once('listening', resolve));
  const address = server?.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port.');
  baseUrl = `http://127.0.0.1:${address.port}`;

  const registerResponse = await fetch(`${baseUrl}/api/auth/lawyer/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Pipeline Test Lawyer',
      email: `pipeline-${Date.now()}@example.test`,
      password: 'integration-test-password'
    })
  });
  const registerBody = await registerResponse.json();
  if (!registerResponse.ok) throw new Error(JSON.stringify(registerBody));
  token = registerBody.token;
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  const db = await getDb();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (envDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = envDataDir;
});

describe('document upload evidence pipeline', () => {
  it('persists PDF facts, conflicts, analysis, timeline, metrics, API DTOs, and renders evidence', async () => {
    const caseId = await createCase(`PIPE-${Date.now()}`);
    const jobIds = await uploadFiles(caseId, [
      '01_Supply_Contract.pdf',
      '02_Invoice_INV-2041.pdf',
      '03_Email_Payment_Claim.pdf',
      '04_Payment_Record.pdf',
      '05_Delivery_Record.pdf'
    ]);
    expect(jobIds).toHaveLength(5);
    await Promise.all(jobIds.map(waitForJob));

    const [caseResult, evidenceResult, conflictsResult, missingResult, timelineResult, versionsResult] = await Promise.all([
      api<any>(`/api/cases/${caseId}`),
      api<{ evidence: any[] }>(`/api/cases/${caseId}/evidence`),
      api<{ conflicts: any[] }>(`/api/cases/${caseId}/conflicts`),
      api<{ missingEvidence: any[] }>(`/api/cases/${caseId}/missing-evidence`),
      api<{ activityEvents: any[]; documentDatedEvents: any[] }>(`/api/cases/${caseId}/timeline`),
      api<{ versions: any[] }>(`/api/cases/${caseId}/analysis/versions`)
    ]);

    expect(evidenceResult.evidence.length).toBeGreaterThan(0);
    expect(evidenceResult.evidence.every(item => item.fact_text && item.source_quote)).toBe(true);
    expect(evidenceResult.evidence.some(item => item.evidence_type === 'invoice_total')).toBe(true);
    expect(conflictsResult.conflicts.map(item => item.conflict_type)).toEqual(expect.arrayContaining(['amount_mismatch', 'date_mismatch']));
    expect(missingResult.missingEvidence.filter(item => item.status === 'open')).toHaveLength(0);
    expect(timelineResult.activityEvents.some(event => event.event_type === 'evidence_structured')).toBe(true);
    expect(versionsResult.versions.length).toBeGreaterThan(0);
    expect(versionsResult.versions[0].reasoning.findings.length).toBeGreaterThan(0);
    expect(caseResult.counts.evidence).toBeGreaterThan(0);
    expect(caseResult.counts.conflicts).toBeGreaterThan(0);

    const agentHistory = await api<{ agents: any; runs: any[] }>(`/api/cases/${caseId}/ai-agents`);
    expect(agentHistory.runs.some(run => run.agentType === 'adversarial_review')).toBe(true);
    expect(agentHistory.agents.adversarial_review.status).toMatch(/fallback|completed/);
    const manualAnalysis = await api<{ success: boolean }>(`/api/cases/${caseId}/analysis/run`, { method: 'POST' });
    expect(manualAnalysis.success).toBe(true);
    const afterManual = await api<{ runs: any[] }>(`/api/cases/${caseId}/ai-agents`);
    expect(afterManual.runs.filter(run => run.agentType === 'adversarial_review').length).toBeGreaterThanOrEqual(2);

    const markup = renderToStaticMarkup(React.createElement(EvidenceTab, {
      caseId,
      evidence: evidenceResult.evidence,
      findings: [],
      isClosed: false,
      onRefresh: () => undefined,
      onOpenSourceViewer: () => undefined
    }));
    expect(markup).toContain(evidenceResult.evidence[0].fact_text);
    expect(markup).toContain(evidenceResult.evidence[0].source_quote);
    expect(markup).not.toContain('No evidence uploaded');
  }, 45_000);

  it('creates a missing-evidence record when a payment claim has no supporting payment evidence', async () => {
    const caseId = await createCase(`MISSING-${Date.now()}`);
    const jobIds = await uploadFiles(caseId, ['03_Email_Payment_Claim.pdf']);
    await Promise.all(jobIds.map(waitForJob));

    const result = await api<{ missingEvidence: any[] }>(`/api/cases/${caseId}/missing-evidence`);
    expect(result.missingEvidence.some(item => item.required_item.includes('payment receipt'))).toBe(true);
  }, 30_000);

  it('denies guardian access to the lawyer case DTO and returns the restricted guardian DTO', async () => {
    const identifier = `guardian-${Date.now()}@example.test`;
    const caseRef = `GUARDIAN-${Date.now()}`;
    const caseId = await createCase(caseRef, identifier);
    const db = await getDb();
    const guardian = db.prepare<any>('SELECT id, name, email FROM users WHERE email = ?').get(identifier);
    expect(guardian).toBeTruthy();
    const guardianToken = signToken({
      userId: guardian.id,
      role: 'guardian',
      name: guardian.name,
      email: guardian.email
    });

    const lawyerDtoResponse = await fetch(`${baseUrl}/api/cases/${caseId}`, {
      headers: { Authorization: `Bearer ${guardianToken}` }
    });
    expect(lawyerDtoResponse.status).toBe(403);

    const guardianDto = await api<any>(`/api/guardian/cases/${caseId}`, {}, guardianToken);
    expect(guardianDto.case.title).toBe(`Integration ${caseRef}`);
    expect(guardianDto.case).not.toHaveProperty('description');
    expect(guardianDto.case).not.toHaveProperty('assigned_lawyer_id');
    expect(guardianDto).not.toHaveProperty('parties');
    expect(guardianDto).not.toHaveProperty('evidence');

    const sharedJobIds = await uploadFiles(caseId, ['01_Supply_Contract.pdf'], true);
    const privateJobIds = await uploadFiles(caseId, ['02_Invoice_INV-2041.pdf']);
    await Promise.all([...sharedJobIds, ...privateJobIds].map(waitForJob));

    const guardianDocuments = await api<{ documents: any[] }>(`/api/cases/${caseId}/documents`, {}, guardianToken);
    expect(guardianDocuments.documents).toHaveLength(1);
    expect(guardianDocuments.documents[0].filename).toBe('01_Supply_Contract.pdf');
    expect(guardianDocuments.documents[0]).not.toHaveProperty('storage_path');
    expect(guardianDocuments.documents[0]).not.toHaveProperty('sha256');

    const fileResponse = await fetch(`${baseUrl}/api/documents/file/${guardianDocuments.documents[0].id}`, {
      headers: { Authorization: `Bearer ${guardianToken}` }
    });
    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers.get('content-type')).toContain('application/pdf');

    const jobResponse = await fetch(`${baseUrl}/api/jobs/${sharedJobIds[0]}`, {
      headers: { Authorization: `Bearer ${guardianToken}` }
    });
    expect(jobResponse.status).toBe(403);
    const systemStatusResponse = await fetch(`${baseUrl}/api/system/status`, {
      headers: { Authorization: `Bearer ${guardianToken}` }
    });
    expect(systemStatusResponse.status).toBe(403);

    await api(`/api/cases/${caseId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Guardian notification test' })
    });
    const guardianNotifications = await api<{ notifications: any[] }>(
      '/api/notifications',
      {},
      guardianToken
    );
    expect(guardianNotifications.notifications.length).toBeGreaterThan(0);
    expect(guardianNotifications.notifications[0].case_ref).toBeNull();
    expect(guardianNotifications.notifications[0].case_title).toBe(`Integration ${caseRef}`);
  }, 30_000);

  it('rejects invalid and partially duplicate batches without persisting any batch files or jobs', async () => {
    const caseId = await createCase(`BATCH-${Date.now()}`);
    const initialJobIds = await uploadFiles(caseId, ['01_Supply_Contract.pdf']);
    await Promise.all(initialJobIds.map(waitForJob));
    const initialDocuments = await api<{ documents: any[] }>(`/api/cases/${caseId}/documents`);

    const duplicateBatch = new FormData();
    duplicateBatch.append('files', new Blob([fs.readFileSync(path.join(demoDir, '02_Invoice_INV-2041.pdf'))], { type: 'application/pdf' }), '02_Invoice_INV-2041.pdf');
    duplicateBatch.append('files', new Blob([fs.readFileSync(path.join(demoDir, '01_Supply_Contract.pdf'))], { type: 'application/pdf' }), '01_Supply_Contract-copy.pdf');
    const duplicateResponse = await fetch(`${baseUrl}/api/cases/${caseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: duplicateBatch
    });
    expect(duplicateResponse.status).toBe(409);

    const invalidBatch = new FormData();
    invalidBatch.append('files', new Blob(['not a pdf'], { type: 'application/pdf' }), 'broken.pdf');
    const invalidResponse = await fetch(`${baseUrl}/api/cases/${caseId}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: invalidBatch
    });
    expect(invalidResponse.status).toBe(400);

    const finalDocuments = await api<{ documents: any[] }>(`/api/cases/${caseId}/documents`);
    expect(finalDocuments.documents.map(document => document.id)).toEqual(initialDocuments.documents.map(document => document.id));
    const db = await getDb();
    expect(db.prepare<any>('SELECT COUNT(*) as count FROM jobs WHERE case_id = ?').get(caseId)?.count).toBe(1);
  }, 30_000);
});
