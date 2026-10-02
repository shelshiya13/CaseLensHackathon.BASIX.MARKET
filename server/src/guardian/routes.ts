import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { createGuardianSummary, listGuardianSummaries } from './guardianSummaryService.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';

export const guardianSummaryRouter = Router();

// GET /api/cases/:id/guardian-summaries (lawyer view)
guardianSummaryRouter.get('/cases/:id/guardian-summaries', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  return res.json({ summaries: await listGuardianSummaries(caseId) });
});

// POST /api/cases/:id/guardian-summaries { approvalText }
guardianSummaryRouter.post('/cases/:id/guardian-summaries', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const approvalText = req.body?.approvalText;
  if (typeof approvalText !== 'string' || !approvalText.trim()) {
    return res.status(400).json({ error: { code: 'INVALID_APPROVAL', message: 'approvalText is required.' } });
  }
  try {
    const summary = await createGuardianSummary(caseId, approvalText, req.user!.userId);
    await recordTimelineEvent({
      caseId, eventType: 'review_requested',
      description: 'Guardian-friendly summary published in Plain English, Tamil, and Hindi.',
      actorType: 'lawyer', actorId: req.user!.userId, guardianVisible: true,
    });
    return res.json({ summary });
  } catch (err) {
    return res.status(400).json({ error: { code: 'GUARDIAN_SUMMARY_REJECTED', message: err instanceof Error ? err.message : 'Invalid approval text.' } });
  }
});

// GET /api/guardian/cases/:id/summaries (restricted: only converted summaries, never confidential notes)
guardianSummaryRouter.get('/guardian/cases/:id/summaries', requireAuth, requireRole('guardian'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_case_summary')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const db = await getDb();
  const rows = db.prepare<any>('SELECT id, plain_english, tamil_text, hindi_text, provider, created_at FROM guardian_summaries WHERE case_id = ? ORDER BY created_at DESC').all(caseId);
  return res.json({ summaries: rows });
});
