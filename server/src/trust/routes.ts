import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { verifyDocumentIntegrity } from '../integrity/integrityService.js';
import { verifyAuditChain } from '../audit/auditLog.js';
import { invalidateSignoffs, listSignoffs, signVersion } from '../versions/signoffService.js';

export const trustRouter = Router();

// GET /api/cases/:id/integrity — SHA-256 re-hash every file, flag tamper/duplicates
trustRouter.get('/cases/:id/integrity', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const { results, tampered } = await verifyDocumentIntegrity(caseId, req.user!.userId);
  const db = await getDb();
  const hashGroups = db.prepare<any>('SELECT sha256, COUNT(*) as n, GROUP_CONCAT(filename) as files FROM documents WHERE case_id = ? GROUP BY sha256 HAVING n > 1').all(caseId);
  return res.json({ results, tampered, duplicates: hashGroups, ok: tampered.length === 0 });
});

// GET /api/cases/:id/audit/verify — hash-chain verification
trustRouter.get('/cases/:id/audit/verify', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  return res.json({ verification: await verifyAuditChain(caseId) });
});

// GET /api/cases/:id/signoffs
trustRouter.get('/cases/:id/signoffs', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  return res.json({ signoffs: await listSignoffs(caseId) });
});

// POST /api/cases/:id/signoffs { versionNo } — lawyer signs + locks a version
trustRouter.post('/cases/:id/signoffs', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const versionNo = Number(req.body?.versionNo);
  if (!versionNo) return res.status(400).json({ error: { code: 'INVALID_VERSION', message: 'versionNo is required.' } });
  try {
    const signoff = await signVersion(caseId, versionNo, req.user!.userId, req.user!.name);
    return res.json({ signoff });
  } catch (err) {
    return res.status(400).json({ error: { code: 'SIGN_FAILED', message: err instanceof Error ? err.message : 'Sign-off failed.' } });
  }
});

// POST /api/cases/:id/signoffs/invalidate { reason }
trustRouter.post('/cases/:id/signoffs/invalidate', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const count = await invalidateSignoffs(caseId, String(req.body?.reason || 'Manual invalidation by counsel.'));
  return res.json({ success: true, invalidated: count });
});
