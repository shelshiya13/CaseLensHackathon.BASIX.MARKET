import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { submitEvidenceReview } from '../review/service.js';
import { runManualAnalysis } from '../agents/orchestrator.js';
import { getCaseTimeline, recordTimelineEvent } from '../agents/timelineAgent.js';
import { buildCaseStateFromDb } from '../agents/state/caseState.js';
import { getActiveStateAdapter } from '../agents/state/omegaAdapter.js';
import { updateCaseStatusIfNeeded } from '../cases/status.js';
import { logPipelineStage } from '../agents/pipelineLog.js';

export const evidenceRouter = Router();

// GET /api/cases/:id/evidence - List evidence items
evidenceRouter.get('/cases/:id/evidence', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const evidence = db.prepare<any>(`
    SELECT e.*, d.filename as document_filename, d.mime as document_mime
    FROM evidence e
    JOIN documents d ON d.id = e.document_id
    WHERE e.case_id = ?
    ORDER BY e.evidence_ref ASC, e.created_at ASC
  `).all(caseId);

  const responseEvidence = evidence.map(e => ({
      ...e,
      confidence_basis: e.confidence_basis ? JSON.parse(e.confidence_basis) : null
    }));
  logPipelineStage('API RESPONSE:evidence', {
    filename: '', documentId: '', caseId, parser: 'GET /api/cases/:id/evidence',
    extractedCharacters: 0, evidenceCount: responseEvidence.length, conflictCount: 0,
    missingEvidenceCount: 0, startedAt: Date.now()
  }, { status: 200 });
  return res.json({ evidence: responseEvidence });
});

// GET /api/evidence/:eid - Get single evidence item
evidenceRouter.get('/evidence/:eid', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const eid = req.params.eid;
  const db = await getDb();
  const item = db.prepare<any>(`
    SELECT e.*, d.filename as document_filename, d.mime as document_mime
    FROM evidence e
    JOIN documents d ON d.id = e.document_id
    WHERE e.id = ?
  `).get(eid);

  if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

  const hasAccess = await canAccessCase(req.user, item.case_id, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  return res.json({
    evidence: {
      ...item,
      confidence_basis: item.confidence_basis ? JSON.parse(item.confidence_basis) : null
    }
  });
});

// POST /api/evidence/:eid/review - Lawyer review action
evidenceRouter.post('/evidence/:eid/review', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const eid = req.params.eid;
  const db = await getDb();
  const item = db.prepare<any>('SELECT case_id FROM evidence WHERE id = ?').get(eid);
  if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' } });

  const hasAccess = await canAccessCase(req.user, item.case_id, 'review');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case closed or forbidden' } });

  try {
    const result = await submitEvidenceReview(item.case_id, eid, req.user!.userId, req.body);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(400).json({ error: { code: 'REVIEW_ERROR', message: err.message } });
  }
});

// GET /api/cases/:id/conflicts - List conflicts
evidenceRouter.get('/cases/:id/conflicts', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const conflicts = db.prepare<any>(`
    SELECT c.*,
      ea.evidence_ref as evidence_a_ref, ea.fact_text as evidence_a_fact, ea.amount_raw as evidence_a_amount,
      ea.date_raw as evidence_a_date, da.filename as evidence_a_doc, ea.page_no as evidence_a_page,
      eb.evidence_ref as evidence_b_ref, eb.fact_text as evidence_b_fact, eb.amount_raw as evidence_b_amount,
      eb.date_raw as evidence_b_date, db.filename as evidence_b_doc, eb.page_no as evidence_b_page
    FROM conflicts c
    JOIN evidence ea ON ea.id = c.evidence_a_id
    JOIN documents da ON da.id = ea.document_id
    JOIN evidence eb ON eb.id = c.evidence_b_id
    JOIN documents db ON db.id = eb.document_id
    WHERE c.case_id = ?
    ORDER BY c.conflict_ref ASC
  `).all(caseId);

  return res.json({ conflicts });
});

// POST /api/conflicts/:cid/dismiss - Dismiss conflict with reason
evidenceRouter.post('/conflicts/:cid/dismiss', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const cid = req.params.cid;
  const db = await getDb();
  const conflict = db.prepare<any>('SELECT * FROM conflicts WHERE id = ?').get(cid);
  if (!conflict) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conflict not found' } });

  const hasAccess = await canAccessCase(req.user, conflict.case_id, 'review');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Forbidden' } });

  const reason = req.body.reason?.trim();
  if (!reason) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: 'A written reason is required to dismiss a conflict' } });

  db.prepare("UPDATE conflicts SET status = 'dismissed_by_human', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    cid
  );

  await recordTimelineEvent({
    caseId: conflict.case_id,
    eventType: 'conflict_resolved',
    description: `Conflict ${conflict.conflict_ref} dismissed by counsel. Reason: "${reason}"`,
    source: conflict.conflict_ref,
    actorType: 'lawyer',
    actorId: req.user!.userId,
    guardianVisible: false
  });

  await updateCaseStatusIfNeeded(conflict.case_id, req.user!.userId);
  return res.json({ success: true });
});

// GET /api/cases/:id/missing-evidence - List missing evidence items
evidenceRouter.get('/cases/:id/missing-evidence', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const missing = db.prepare<any>('SELECT * FROM missing_evidence WHERE case_id = ? ORDER BY missing_ref ASC').all(caseId);

  return res.json({
    missingEvidence: missing.map(m => ({
      ...m,
      basis_evidence_ids: JSON.parse(m.basis_evidence_ids || '[]')
    }))
  });
});

// POST /api/missing-evidence/:mid/dismiss - Dismiss missing item
evidenceRouter.post('/missing-evidence/:mid/dismiss', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const mid = req.params.mid;
  const db = await getDb();
  const item = db.prepare<any>('SELECT * FROM missing_evidence WHERE id = ?').get(mid);
  if (!item) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Item not found' } });

  const hasAccess = await canAccessCase(req.user, item.case_id, 'review');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Forbidden' } });

  const reason = req.body.reason?.trim();
  if (!reason) return res.status(400).json({ error: { code: 'REASON_REQUIRED', message: 'A written reason is required' } });

  db.prepare("UPDATE missing_evidence SET status = 'dismissed_by_human', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    mid
  );

  await updateCaseStatusIfNeeded(item.case_id, req.user!.userId);
  return res.json({ success: true });
});

// POST /api/cases/:id/analysis/run - Explicit analysis trigger
evidenceRouter.post('/cases/:id/analysis/run', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'review');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed' } });

  const db = await getDb();
  const activeEvCount = db.prepare<any>("SELECT COUNT(*) as c FROM evidence WHERE case_id = ? AND status = 'active'").get(caseId)?.c || 0;
  if (activeEvCount === 0) {
    return res.status(400).json({
      error: { code: 'NO_EVIDENCE', message: 'No active evidence uploaded yet. Upload evidence to begin AI analysis.' }
    });
  }

  try {
    const versionId = await runManualAnalysis(caseId, req.user!.userId);
    return res.json({ success: true, versionId });
  } catch (err: any) {
    return res.status(500).json({ error: { code: 'ANALYSIS_FAILED', message: err.message } });
  }
});

// GET /api/cases/:id/analysis/versions - List analysis versions
evidenceRouter.get('/cases/:id/analysis/versions', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const versions = db.prepare<any>(`
    SELECT * FROM analysis_versions WHERE case_id = ? ORDER BY version_no DESC
  `).all(caseId);

  return res.json({
    versions: versions.map(v => ({
      ...v,
      reasoning: JSON.parse(v.reasoning_json || '{}'),
      state_diff: v.state_diff_json ? JSON.parse(v.state_diff_json) : []
    }))
  });
});

// GET /api/cases/:id/analysis/compare?a=1&b=2 - Compare versions
evidenceRouter.get('/cases/:id/analysis/compare', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const vA = parseInt(req.query.a as string, 10);
  const vB = parseInt(req.query.b as string, 10);
  if (isNaN(vA) || isNaN(vB)) {
    return res.status(400).json({ error: { code: 'INVALID_VERSIONS', message: 'Valid version numbers a and b required' } });
  }

  const db = await getDb();
  const rowA = db.prepare<any>('SELECT * FROM analysis_versions WHERE case_id = ? AND version_no = ?').get(caseId, vA);
  const rowB = db.prepare<any>('SELECT * FROM analysis_versions WHERE case_id = ? AND version_no = ?').get(caseId, vB);

  if (!rowA || !rowB) {
    return res.status(404).json({ error: { code: 'VERSION_NOT_FOUND', message: 'Specified versions not found' } });
  }

  return res.json({
    versionA: { ...rowA, reasoning: JSON.parse(rowA.reasoning_json || '{}') },
    versionB: { ...rowB, reasoning: JSON.parse(rowB.reasoning_json || '{}') }
  });
});

// GET /api/cases/:id/timeline
evidenceRouter.get('/cases/:id/timeline', requireAuth, async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const isGuardian = req.user!.role === 'guardian';
  const cap = isGuardian ? 'read_case_summary' : 'read_internal';
  const hasAccess = await canAccessCase(req.user, caseId, cap);
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const timelineData = await getCaseTimeline(caseId, isGuardian);
  return res.json(timelineData);
});

// GET /api/cases/:id/agent-state - Return persistent CaseState
evidenceRouter.get('/cases/:id/agent-state', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const adapter = getActiveStateAdapter();
  const state = await adapter.load(caseId) || await buildCaseStateFromDb(caseId);

  return res.json({
    adapterName: adapter.name,
    caseState: state
  });
});
