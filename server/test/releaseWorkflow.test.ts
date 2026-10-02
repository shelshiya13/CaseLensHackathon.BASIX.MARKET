import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: () => null,
  disableGeminiForAuthenticationError: () => false,
  isGeminiAuthenticationRejected: () => false
}));

import { createExpressApp } from '../src/app.js';
import { getDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

describe('release workflow smoke test', () => {
  let tempDir = '';
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof createExpressApp>['listen']> | null = null;

  const request = (route: string, options: RequestInit = {}, token?: string) => {
    const headers = new Headers(options.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${baseUrl}/api${route}`, { ...options, headers });
  };

  const jsonRequest = (route: string, method: string, body: unknown, token?: string) =>
    request(route, { method, body: JSON.stringify(body) }, token);

  const uploadFixtures = async (caseId: string, names: string[], token: string) => {
    const form = new FormData();
    form.set('shareWithGuardian', 'true');
    for (const name of names) {
      const fixturePath = path.resolve('server/src/seed/demo-docs', name);
      const bytes = fs.readFileSync(fixturePath);
      form.append('files', new Blob([bytes], { type: 'text/plain' }), name);
    }

    const response = await request(`/cases/${caseId}/documents`, { method: 'POST', body: form }, token);
    expect(response.status).toBe(200);
    const payload = await response.json() as { documents: Array<{ docId: string; jobId: string }> };
    expect(payload.documents).toHaveLength(names.length);

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      const jobs = await Promise.all(payload.documents.map(async document => {
        const jobResponse = await request(`/jobs/${document.jobId}`, {}, token);
        expect(jobResponse.status).toBe(200);
        return (await jobResponse.json() as { job: { status: string; error?: string } }).job;
      }));

      const failed = jobs.find(job => job.status === 'failed');
      if (failed) throw new Error(`Document pipeline failed: ${failed.error || 'unknown error'}`);
      if (jobs.every(job => job.status === 'done')) return payload.documents;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Document processing jobs did not finish within 90 seconds.');
  };

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-release-'));
    process.env.DATA_DIR = path.join(tempDir, 'data');
    await runMigrations();

    const app = createExpressApp();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server?.once('listening', resolve));
    const address = server?.address();
    if (!address || typeof address === 'string') throw new Error('Release test server did not bind to a TCP port.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    const db = await getDb();
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('registers counsel, processes evidence, serves a guardian, and closes/reopens with an audit trail', async () => {
    const stamp = Date.now();
    const email = `release-${stamp}@example.test`;
    const guardianEmail = `guardian-${stamp}@example.test`;

    const registerResponse = await jsonRequest('/auth/lawyer/register', 'POST', {
      name: 'Release Test Counsel',
      email,
      password: 'release-password-123'
    });
    expect(registerResponse.status).toBe(200);
    const registration = await registerResponse.json() as { token: string };

    const loginResponse = await jsonRequest('/auth/lawyer/login', 'POST', {
      email,
      password: 'release-password-123'
    });
    expect(loginResponse.status).toBe(200);
    const lawyer = await loginResponse.json() as { token: string };

    const createResponse = await jsonRequest('/cases', 'POST', {
      caseRef: `REL-${stamp}`,
      title: 'Release Verification Matter',
      caseType: 'Commercial Contract',
      court: 'Demo Court',
      parties: [
        { name: 'Fictional Traders Pvt Ltd', partyRole: 'client' },
        { name: 'Sample Supplies LLP', partyRole: 'opposing' }
      ],
      guardianIdentifier: guardianEmail,
      guardianName: 'Release Test Guardian',
      guardianRelationship: 'Client'
    }, lawyer.token);
    expect(createResponse.status).toBe(200);
    const createdCase = await createResponse.json() as { caseId: string; caseRef: string };
    expect(createdCase.caseId).toBeTruthy();

    const firstDemoLoadResponse = await jsonRequest('/demo/load', 'POST', {}, lawyer.token);
    expect(firstDemoLoadResponse.status).toBe(200);
    const firstDemoLoad = await firstDemoLoadResponse.json() as { caseId: string; caseRef: string };
    const repeatedDemoLoadResponse = await jsonRequest('/demo/load', 'POST', {}, lawyer.token);
    expect(repeatedDemoLoadResponse.status).toBe(200);
    expect(await repeatedDemoLoadResponse.json()).toMatchObject({
      success: true,
      alreadyExists: true,
      caseId: firstDemoLoad.caseId,
      caseRef: firstDemoLoad.caseRef
    });

    const baselineDocs = await uploadFixtures(createdCase.caseId, [
      '01_Supply_Contract.txt',
      '02_Invoice_INV-2041.txt',
      '03_Email_Payment_Claim.txt'
    ], lawyer.token);

    const privateDocumentForm = new FormData();
    privateDocumentForm.set('shareWithGuardian', 'false');
    privateDocumentForm.append('files', new Blob(['Counsel-only working note.'], { type: 'text/plain' }), 'Counsel_Working_Note.txt');
    const privateUploadResponse = await request(`/cases/${createdCase.caseId}/documents`, {
      method: 'POST',
      body: privateDocumentForm
    }, lawyer.token);
    expect(privateUploadResponse.status).toBe(200);
    const privateUpload = await privateUploadResponse.json() as { documents: Array<{ docId: string; jobId: string }> };
    const privateJobResponse = await request(`/jobs/${privateUpload.documents[0].jobId}`, {}, lawyer.token);
    expect(privateJobResponse.status).toBe(200);

    const missingResponse = await request(`/cases/${createdCase.caseId}/missing-evidence`, {}, lawyer.token);
    expect(missingResponse.status).toBe(200);
    const missingData = await missingResponse.json() as { missingEvidence: Array<{ status: string }> };
    expect(missingData.missingEvidence.some(item => item.status === 'open')).toBe(true);

    const duplicateForm = new FormData();
    const duplicateBytes = fs.readFileSync(path.resolve('server/src/seed/demo-docs/01_Supply_Contract.txt'));
    duplicateForm.append('files', new Blob([duplicateBytes], { type: 'text/plain' }), '01_Supply_Contract.txt');
    const duplicateResponse = await request(`/cases/${createdCase.caseId}/documents`, { method: 'POST', body: duplicateForm }, lawyer.token);
    expect(duplicateResponse.status).toBe(409);

    const finalDocs = await uploadFixtures(createdCase.caseId, ['04_Payment_Record.txt', '05_Delivery_Record.txt'], lawyer.token);

    const scanForm = new FormData();
    scanForm.set('shareWithGuardian', 'false');
    scanForm.append('files', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'scan.png');
    const scanUploadResponse = await request(`/cases/${createdCase.caseId}/documents`, { method: 'POST', body: scanForm }, lawyer.token);
    expect(scanUploadResponse.status).toBe(200);
    const scanUpload = await scanUploadResponse.json() as { documents: Array<{ docId: string; jobId: string }> };
    const scanJobId = scanUpload.documents[0].jobId;
    const scanDeadline = Date.now() + 30_000;
    let scanJobStatus = '';
    while (Date.now() < scanDeadline) {
      const scanJobResponse = await request(`/jobs/${scanJobId}`, {}, lawyer.token);
      const scanJob = (await scanJobResponse.json() as { job: { status: string; error?: string } }).job;
      scanJobStatus = scanJob.status;
      if (scanJobStatus === 'done') break;
      if (scanJobStatus === 'failed') throw new Error(`OCR fallback blocked document processing: ${scanJob.error}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(scanJobStatus).toBe('done');

    const documentsResponse = await request(`/cases/${createdCase.caseId}/documents`, {}, lawyer.token);
    const documentRows = await documentsResponse.json() as { documents: Array<{ id: string; processing_warning?: string | null }> };
    const scannedDocument = documentRows.documents.find(document => document.id === scanUpload.documents[0].docId);
    expect(scannedDocument?.processing_warning).toContain('OCR is unavailable');

    const documentPagesResponse = await request(`/documents/pages/${baselineDocs[0].docId}`, {}, lawyer.token);
    expect(documentPagesResponse.status).toBe(200);
    const documentPages = await documentPagesResponse.json() as { pages: Array<{ text: string }> };
    expect(documentPages.pages[0]?.text).toContain('MASTER SUPPLY AGREEMENT');

    const evidenceResponse = await request(`/cases/${createdCase.caseId}/evidence`, {}, lawyer.token);
    expect(evidenceResponse.status).toBe(200);
    const evidenceData = await evidenceResponse.json() as { evidence: Array<{ id: string; source_quote: string; page_no: number; status: string }> };
    expect(evidenceData.evidence.length).toBeGreaterThan(2);
    expect(evidenceData.evidence.every(item => item.source_quote.length > 0 && item.page_no >= 1)).toBe(true);

    const conflictsResponse = await request(`/cases/${createdCase.caseId}/conflicts`, {}, lawyer.token);
    expect(conflictsResponse.status).toBe(200);
    const conflictsData = await conflictsResponse.json() as { conflicts: Array<{ id: string; conflict_type: string; status: string; evidence_b_id: string }> };
    expect(conflictsData.conflicts.some(item => item.status === 'open' && item.conflict_type === 'amount_mismatch')).toBe(true);
    expect(conflictsData.conflicts.some(item => item.status === 'open' && item.conflict_type === 'date_mismatch')).toBe(true);

    const analysisResponse = await jsonRequest(`/cases/${createdCase.caseId}/analysis/run`, 'POST', {}, lawyer.token);
    expect(analysisResponse.status).toBe(200);
    const versionsResponse = await request(`/cases/${createdCase.caseId}/analysis/versions`, {}, lawyer.token);
    const versionsData = await versionsResponse.json() as { versions: Array<{ reasoning: { findings?: unknown[] } }> };
    expect(versionsData.versions.length).toBeGreaterThan(0);
    expect(versionsData.versions[0].reasoning.findings?.length).toBeGreaterThan(0);

    const amountConflict = conflictsData.conflicts.find(item => item.status === 'open' && item.conflict_type === 'amount_mismatch');
    const paymentEvidence = evidenceData.evidence.find(item => item.id === amountConflict?.evidence_b_id && item.status === 'active');
    expect(paymentEvidence).toBeTruthy();
    const correctionResponse = await jsonRequest(`/evidence/${paymentEvidence!.id}/review`, 'POST', {
      action: 'correct_value',
      fieldToCorrect: 'amount',
      correctedValue: '₹2,40,000',
      reason: 'Counsel verified the supplemental payment record for this release test.'
    }, lawyer.token);
    expect(correctionResponse.status).toBe(200);
    expect(await correctionResponse.json()).toMatchObject({ success: true, status: 'corrected' });

    const db = await getDb();
    const reviewJob = db.prepare<{ id: string }>(`
      SELECT id FROM jobs WHERE case_id = ? AND kind = 'reanalyze_after_review'
      ORDER BY created_at DESC LIMIT 1
    `).get(createdCase.caseId);
    expect(reviewJob).toBeTruthy();
    const reviewDeadline = Date.now() + 30_000;
    while (reviewJob && Date.now() < reviewDeadline) {
      const jobResponse = await request(`/jobs/${reviewJob.id}`, {}, lawyer.token);
      const jobData = await jobResponse.json() as { job: { status: string; error?: string } };
      if (jobData.job.status === 'failed') throw new Error(`Human review reanalysis failed: ${jobData.job.error}`);
      if (jobData.job.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const conflictsAfterCorrectionResponse = await request(`/cases/${createdCase.caseId}/conflicts`, {}, lawyer.token);
    const conflictsAfterCorrection = await conflictsAfterCorrectionResponse.json() as { conflicts: Array<{ conflict_type: string; status: string }> };
    expect(conflictsAfterCorrection.conflicts.some(item => item.conflict_type === 'amount_mismatch' && item.status === 'resolved_by_correction')).toBe(true);

    const timelineResponse = await request(`/cases/${createdCase.caseId}/timeline`, {}, lawyer.token);
    expect(timelineResponse.status).toBe(200);
    const timeline = await timelineResponse.json() as { activityEvents: unknown[]; documentDatedEvents: unknown[] };
    expect(timeline.activityEvents.length).toBeGreaterThan(0);
    expect(timeline.documentDatedEvents.length).toBeGreaterThan(0);

    const signoffResponse = await jsonRequest(`/cases/${createdCase.caseId}/review/signoff`, 'POST', {}, lawyer.token);
    expect(signoffResponse.status).toBe(200);

    const otpResponse = await jsonRequest('/auth/guardian/otp/request', 'POST', { identifier: guardianEmail });
    expect(otpResponse.status).toBe(200);
    const otp = await otpResponse.json() as { devCode?: string };
    expect(otp.devCode).toMatch(/^\d{6}$/);

    const verifyResponse = await jsonRequest('/auth/guardian/otp/verify', 'POST', { identifier: guardianEmail, code: otp.devCode });
    expect(verifyResponse.status).toBe(200);
    const guardian = await verifyResponse.json() as { token: string };

    const guardianDashboardResponse = await request('/dashboard/guardian', {}, guardian.token);
    expect(guardianDashboardResponse.status).toBe(200);
    const guardianDashboard = await guardianDashboardResponse.json() as { cases: Array<{ id: string }> };
    expect(guardianDashboard.cases.some(item => item.id === createdCase.caseId)).toBe(true);

    const guardianCaseResponse = await request(`/guardian/cases/${createdCase.caseId}`, {}, guardian.token);
    expect(guardianCaseResponse.status).toBe(200);
    const guardianCase = await guardianCaseResponse.json() as { sharedDocuments: Array<{ id: string }>; case: Record<string, unknown> };
    expect(guardianCase.sharedDocuments.length).toBe(5);
    expect(guardianCase.case).not.toHaveProperty('latestAnalysis');
    expect(guardianCase.sharedDocuments.some(document => document.id === privateUpload.documents[0].docId)).toBe(false);

    const downloadResponse = await request(`/documents/file/${guardianCase.sharedDocuments[0].id}`, {}, guardian.token);
    expect(downloadResponse.status).toBe(200);
    expect((await downloadResponse.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const privateDownloadResponse = await request(`/documents/file/${privateUpload.documents[0].docId}`, {}, guardian.token);
    expect(privateDownloadResponse.status).toBe(404);

    const guardianInternalResponse = await request(`/cases/${createdCase.caseId}/evidence`, {}, guardian.token);
    expect(guardianInternalResponse.status).toBe(403);

    const closeResponse = await jsonRequest(`/cases/${createdCase.caseId}/close`, 'POST', { reason: 'Release smoke test closure.' }, lawyer.token);
    expect(closeResponse.status).toBe(200);
    const reopenResponse = await jsonRequest(`/cases/${createdCase.caseId}/reopen`, 'POST', { reason: 'Release smoke test supplementary review.' }, lawyer.token);
    expect(reopenResponse.status).toBe(200);
    expect(await reopenResponse.json()).toMatchObject({ success: true, status: 'Reopened' });

    const guardianNotificationsResponse = await request('/notifications', {}, guardian.token);
    expect(guardianNotificationsResponse.status).toBe(200);
    const notifications = await guardianNotificationsResponse.json() as { notifications: Array<{ id: string; title: string }> };
    expect(notifications.notifications.some(item => item.title === 'Case Closed')).toBe(true);
    expect(notifications.notifications.some(item => item.title === 'Case Reopened')).toBe(true);
    const oneReadNotification = notifications.notifications[0];
    const markOneReadResponse = await jsonRequest(`/notifications/${oneReadNotification.id}/read`, 'POST', {}, guardian.token);
    expect(markOneReadResponse.status).toBe(200);
    const markAllReadResponse = await jsonRequest('/notifications/read-all', 'POST', {}, guardian.token);
    expect(markAllReadResponse.status).toBe(200);
    const readNotificationsResponse = await request('/notifications', {}, guardian.token);
    expect((await readNotificationsResponse.json() as { unreadCount: number }).unreadCount).toBe(0);

    const auditActions = db.prepare<{ action: string }>('SELECT action FROM audit_log WHERE case_id = ?').all(createdCase.caseId).map(item => item.action);
    expect(auditActions).toContain('case_close');
    expect(auditActions).toContain('case_reopen');
    const agentRunCount = db.prepare<{ count: number }>('SELECT COUNT(*) as count FROM agent_runs WHERE case_id = ?').get(createdCase.caseId)?.count || 0;
    expect(agentRunCount).toBeGreaterThan(0);

    const dashboardResponse = await request('/dashboard/lawyer', {}, lawyer.token);
    expect(dashboardResponse.status).toBe(200);
    const dashboard = await dashboardResponse.json() as { recentlyUpdatedCases: Array<{ id: string }> };
    expect(dashboard.recentlyUpdatedCases.some(item => item.id === createdCase.caseId)).toBe(true);
    expect(baselineDocs.length).toBe(3);
    expect(finalDocs.length).toBe(2);
  }, 120_000);
});
