import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { logPipelineStage } from '../agents/pipelineLog.js';

export const jobsRouter = Router();

// GET /api/jobs/:id - Poll job status & live stepper progress
jobsRouter.get('/:id', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const db = await getDb();

  const job = db.prepare<any>('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  const hasAccess = await canAccessCase(req.user, job.case_id, 'read_case_summary');
  if (!hasAccess) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
  }

  const metrics = {
    evidenceCount: db.prepare<any>("SELECT COUNT(*) as c FROM evidence WHERE case_id = ? AND status = 'active'").get(job.case_id)?.c || 0,
    conflictCount: db.prepare<any>("SELECT COUNT(*) as c FROM conflicts WHERE case_id = ? AND status = 'open'").get(job.case_id)?.c || 0,
    missingEvidenceCount: db.prepare<any>("SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ? AND status = 'open'").get(job.case_id)?.c || 0
  };
  const response = {
    job: {
      id: job.id,
      caseId: job.case_id,
      documentId: job.document_id,
      kind: job.kind,
      status: job.status,
      step: job.step,
      error: job.error,
      stepLogs: job.step_log_json ? JSON.parse(job.step_log_json) : [],
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      metrics
    }
  };
  const document = job.document_id ? db.prepare<any>('SELECT filename, mime FROM documents WHERE id = ?').get(job.document_id) : null;
  logPipelineStage('API RESPONSE:job', {
    filename: document?.filename || '',
    documentId: job.document_id || '',
    caseId: job.case_id,
    parser: 'GET /api/jobs/:id',
    extractedCharacters: 0,
    evidenceCount: metrics.evidenceCount,
    conflictCount: metrics.conflictCount,
    missingEvidenceCount: metrics.missingEvidenceCount,
    startedAt: Date.now()
  }, { status: 200, jobId, jobStatus: job.status, mimeType: document?.mime || '' });
  return res.json(response);
});
