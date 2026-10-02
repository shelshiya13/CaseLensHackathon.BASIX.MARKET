import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';
import { logAudit } from '../audit/auditLog.js';
import { updateCaseStatusIfNeeded } from './status.js';
import { createNotification } from '../notifications/service.js';
import { logPipelineStage } from '../agents/pipelineLog.js';

export const casesRouter = Router();

// GET /api/cases - List accessible cases for current lawyer
casesRouter.get('/', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const db = await getDb();
  const userId = req.user!.userId;

  const cases = db.prepare<any>(`
    SELECT c.*,
      (SELECT COUNT(*) FROM documents d WHERE d.case_id = c.id) as document_count,
      (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id AND e.status = 'active') as evidence_count,
      (SELECT COUNT(*) FROM conflicts cf WHERE cf.case_id = c.id AND cf.status = 'open') as conflict_count,
      (SELECT COUNT(*) FROM missing_evidence me WHERE me.case_id = c.id AND me.status = 'open') as missing_count
    FROM cases c
    LEFT JOIN case_access ca ON ca.case_id = c.id AND ca.user_id = ?
    WHERE c.assigned_lawyer_id = ? OR ca.access_level = 'owner_lawyer'
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(userId, userId);

  return res.json({ cases });
});

// POST /api/cases - Create new case
casesRouter.post('/', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const schema = z.object({
    caseRef: z.string().min(2, 'Case ID is required'),
    title: z.string().min(3, 'Title is required'),
    caseType: z.string().min(2, 'Case type is required'),
    court: z.string().optional(),
    caseNumber: z.string().optional(),
    filingDate: z.string().optional(),
    nextHearingAt: z.string().optional(),
    nextHearingType: z.string().optional(),
    description: z.string().optional(),
    guardianFriendlyTitle: z.string().optional(),
    parties: z.array(z.object({
      name: z.string().min(1),
      partyRole: z.enum(['client', 'opposing', 'other']),
      notes: z.string().optional()
    })).optional(),
    guardianIdentifier: z.string().optional(),
    guardianName: z.string().optional(),
    guardianRelationship: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });
  }

  const db = await getDb();
  const existing = db.prepare('SELECT id FROM cases WHERE case_ref = ?').get(parsed.data.caseRef.trim());
  if (existing) {
    return res.status(400).json({ error: { code: 'DUPLICATE_CASE_REF', message: 'Case ID already exists. Please choose a unique Case ID.' } });
  }

  const guardianIdentifier = parsed.data.guardianIdentifier?.trim().toLowerCase();
  const existingGuardian = guardianIdentifier
    ? db.prepare<any>('SELECT id, role FROM users WHERE email = ? OR mobile = ?').get(guardianIdentifier, guardianIdentifier)
    : null;
  if (existingGuardian && existingGuardian.role !== 'guardian') {
    return res.status(400).json({
      error: { code: 'INVALID_GUARDIAN_ACCOUNT', message: 'A lawyer account cannot be linked as a guardian.' }
    });
  }

  const caseId = crypto.randomUUID();
  const now = new Date().toISOString();
  const lawyerId = req.user!.userId;

  const persistCase = db.transaction(() => {
    db.prepare(`
    INSERT INTO cases (
      id, case_ref, title, case_type, status, court, case_number,
      filing_date, next_hearing_at, next_hearing_type, assigned_lawyer_id,
      description, guardian_friendly_title, is_demo, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
    caseId,
    parsed.data.caseRef.trim(),
    parsed.data.title.trim(),
    parsed.data.caseType,
    parsed.data.court || null,
    parsed.data.caseNumber || null,
    parsed.data.filingDate || null,
    parsed.data.nextHearingAt || null,
    parsed.data.nextHearingType || null,
    lawyerId,
    parsed.data.description || null,
    parsed.data.guardianFriendlyTitle || parsed.data.title.trim(),
    now,
    now
  );

  // Add lawyer access
    db.prepare(`
    INSERT INTO case_access (id, case_id, user_id, access_level, relationship_label, created_at)
    VALUES (?, ?, ?, 'owner_lawyer', 'Creator / Lead Counsel', ?)
    `).run(crypto.randomUUID(), caseId, lawyerId, now);

  // Add parties
  if (parsed.data.parties) {
    for (const p of parsed.data.parties) {
        db.prepare(`
        INSERT INTO case_parties (id, case_id, name, party_role, notes)
        VALUES (?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), caseId, p.name, p.partyRole, p.notes || null);
    }
  }

  // Link guardian if provided
    if (guardianIdentifier) {
      let guardianUser = existingGuardian;

      if (!guardianUser) {
        const gId = crypto.randomUUID();
        const isEmail = guardianIdentifier.includes('@');
        db.prepare(`
        INSERT INTO users (id, role, name, email, mobile, created_at)
        VALUES (?, 'guardian', ?, ?, ?, ?)
        `).run(
          gId,
          parsed.data.guardianName || 'Client / Guardian',
          isEmail ? guardianIdentifier : null,
          !isEmail ? guardianIdentifier : null,
          now
        );
        guardianUser = { id: gId, role: 'guardian' };
      }

      db.prepare(`
      INSERT INTO case_access (id, case_id, user_id, access_level, relationship_label, created_at)
      VALUES (?, ?, ?, 'guardian_view', ?, ?)
      `).run(crypto.randomUUID(), caseId, guardianUser.id, parsed.data.guardianRelationship || 'Client', now);
    }
  });

  try {
    persistCase();
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: cases.case_ref')) {
      return res.status(400).json({ error: { code: 'DUPLICATE_CASE_REF', message: 'Case ID already exists. Please choose a unique Case ID.' } });
    }
    throw error;
  }

  await recordTimelineEvent({
    caseId,
    eventType: 'case_created',
    description: `Case "${parsed.data.title}" (${parsed.data.caseRef}) initiated.`,
    actorType: 'lawyer',
    actorId: lawyerId,
    guardianVisible: true
  });

  await logAudit({
    actorId: lawyerId,
    action: 'case_create',
    entityType: 'case',
    entityId: caseId,
    caseId
  });

  return res.json({ caseId, caseRef: parsed.data.caseRef });
});

// GET /api/cases/:id - Retrieve case overview
casesRouter.get('/:id', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_case_summary');
  if (!hasAccess) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }

  const db = await getDb();
  const caseRow = db.prepare<any>(`
    SELECT c.*, u.name as assigned_lawyer_name
    FROM cases c
    JOIN users u ON u.id = c.assigned_lawyer_id
    WHERE c.id = ?
  `).get(caseId);

  if (!caseRow) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }

  const parties = db.prepare<any>('SELECT * FROM case_parties WHERE case_id = ?').all(caseId);
  const docCount = db.prepare<any>('SELECT COUNT(*) as c FROM documents WHERE case_id = ?').get(caseId)?.c || 0;
  const evidenceCount = db.prepare<any>("SELECT COUNT(*) as c FROM evidence WHERE case_id = ? AND status = 'active'").get(caseId)?.c || 0;
  const conflictCount = db.prepare<any>("SELECT COUNT(*) as c FROM conflicts WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;
  const missingCount = db.prepare<any>("SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ? AND status = 'open'").get(caseId)?.c || 0;

  const latestAnalysis = db.prepare<any>(`
    SELECT version_no, assessment_status, summary_text, created_at, model_used
    FROM analysis_versions WHERE case_id = ?
    ORDER BY version_no DESC LIMIT 1
  `).get(caseId);

  const response = {
    case: caseRow,
    parties,
    counts: {
      documents: docCount,
      evidence: evidenceCount,
      conflicts: conflictCount,
      missing: missingCount
    },
    latestAnalysis: latestAnalysis || null
  };
  logPipelineStage('API RESPONSE:case metrics', {
    filename: '', documentId: '', caseId, parser: 'GET /api/cases/:id',
    extractedCharacters: 0, evidenceCount, conflictCount, missingEvidenceCount: missingCount,
    startedAt: Date.now()
  }, { status: 200, documentCount: docCount });
  return res.json(response);
});

// PATCH /api/cases/:id - Update case metadata
casesRouter.patch('/:id', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'edit');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const allowedFields = ['title', 'case_type', 'court', 'case_number', 'filing_date', 'next_hearing_at', 'next_hearing_type', 'description', 'guardian_friendly_title'];

  const updates: string[] = [];
  const params: any[] = [];

  for (const field of allowedFields) {
    const camel = field.replace(/_([a-z])/g, g => g[1].toUpperCase());
    if (req.body[camel] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[camel]);
    } else if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No valid fields provided for update' } });
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(caseId);

  db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  if (req.body.nextHearingAt || req.body.next_hearing_at) {
    await recordTimelineEvent({
      caseId,
      eventType: 'hearing_scheduled',
      description: `Hearing scheduled/updated for ${new Date(req.body.nextHearingAt || req.body.next_hearing_at).toLocaleString()}`,
      actorType: 'lawyer',
      actorId: req.user!.userId,
      guardianVisible: true
    });
  }

  return res.json({ success: true });
});

// POST /api/cases/:id/close - Close case
casesRouter.post('/:id/close', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'close');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const reason = req.body.reason || 'Case proceedings concluded.';
  const db = await getDb();
  const now = new Date().toISOString();

  db.prepare("UPDATE cases SET closed_at = ?, status = 'Closed', updated_at = ? WHERE id = ?").run(now, now, caseId);

  await recordTimelineEvent({
    caseId,
    eventType: 'case_closed',
    description: `Case closed by counsel. Reason: ${reason}`,
    actorType: 'lawyer',
    actorId: req.user!.userId,
    guardianVisible: true
  });

  // Notify guardians
  const guardians = db.prepare<any>(`
    SELECT u.id FROM users u
    JOIN case_access ca ON ca.user_id = u.id
    WHERE ca.case_id = ? AND ca.access_level = 'guardian_view'
  `).all(caseId);

  for (const g of guardians) {
    await createNotification({
      userId: g.id,
      caseId,
      kind: 'case_status_changed',
      title: 'Case Closed',
      body: 'Your lawyer has updated this case status to Closed.'
    });
  }

  await logAudit({
    actorId: req.user!.userId,
    action: 'case_close',
    entityType: 'case',
    entityId: caseId,
    caseId,
    details: { reason }
  });

  return res.json({ success: true, status: 'Closed' });
});

// POST /api/cases/:id/reopen - Reopen case
casesRouter.post('/:id/reopen', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'close');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const reason = req.body.reason || 'Reopened for supplementary evidence review.';
  const db = await getDb();
  const now = new Date().toISOString();

  db.prepare("UPDATE cases SET closed_at = NULL, updated_at = ? WHERE id = ?").run(now, caseId);
  await updateCaseStatusIfNeeded(caseId, req.user!.userId);

  await recordTimelineEvent({
    caseId,
    eventType: 'case_reopened',
    description: `Case reopened by counsel. Reason: ${reason}`,
    actorType: 'lawyer',
    actorId: req.user!.userId,
    guardianVisible: true
  });

  const guardians = db.prepare<any>(`
    SELECT u.id FROM users u
    JOIN case_access ca ON ca.user_id = u.id
    WHERE ca.case_id = ? AND ca.access_level = 'guardian_view'
  `).all(caseId);

  for (const guardian of guardians) {
    await createNotification({
      userId: guardian.id,
      caseId,
      kind: 'case_status_changed',
      title: 'Case Reopened',
      body: 'Your lawyer has reopened this case for further review.'
    });
  }

  await logAudit({
    actorId: req.user!.userId,
    action: 'case_reopen',
    entityType: 'case',
    entityId: caseId,
    caseId,
    details: { reason }
  });

  return res.json({ success: true, status: 'Reopened' });
});

// GET /api/cases/:id/notes - Internal lawyer notes
casesRouter.get('/:id/notes', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const notes = db.prepare<any>(`
    SELECT cn.*, u.name as author_name
    FROM case_notes cn
    JOIN users u ON u.id = cn.author_id
    WHERE cn.case_id = ?
    ORDER BY cn.created_at DESC
  `).all(caseId);

  return res.json({ notes });
});

// POST /api/cases/:id/notes - Add note
casesRouter.post('/:id/notes', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const body = req.body.body?.trim();
  if (!body) return res.status(400).json({ error: { code: 'EMPTY_NOTE', message: 'Note content is required' } });

  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO case_notes (id, case_id, author_id, body, internal, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(id, caseId, req.user!.userId, body, now);

  return res.json({ id, body, createdAt: now });
});

// GET /api/cases/:id/guardians - List linked guardians
casesRouter.get('/:id/guardians', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const guardians = db.prepare<any>(`
    SELECT ca.id as access_id, ca.relationship_label, ca.created_at as linked_at,
           u.id as user_id, u.name, u.email, u.mobile
    FROM case_access ca
    JOIN users u ON u.id = ca.user_id
    WHERE ca.case_id = ? AND ca.access_level = 'guardian_view'
  `).all(caseId);

  return res.json({ guardians });
});

// POST /api/cases/:id/guardians - Link new guardian
casesRouter.post('/:id/guardians', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'edit');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const schema = z.object({
    identifier: z.string().min(3),
    name: z.string().min(1),
    relationshipLabel: z.string().default('Client')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0].message } });

  const cleanId = parsed.data.identifier.trim().toLowerCase();
  const isEmail = cleanId.includes('@');
  const db = await getDb();
  const now = new Date().toISOString();

  let user = db.prepare<any>('SELECT id FROM users WHERE email = ? OR mobile = ?').get(cleanId, cleanId);
  if (!user) {
    const uid = crypto.randomUUID();
    db.prepare(`
      INSERT INTO users (id, role, name, email, mobile, created_at)
      VALUES (?, 'guardian', ?, ?, ?, ?)
    `).run(uid, parsed.data.name, isEmail ? cleanId : null, !isEmail ? cleanId : null, now);
    user = { id: uid };
  }

  const existingAccess = db.prepare('SELECT id FROM case_access WHERE case_id = ? AND user_id = ?').get(caseId, user.id);
  if (!existingAccess) {
    db.prepare(`
      INSERT INTO case_access (id, case_id, user_id, access_level, relationship_label, created_at)
      VALUES (?, ?, ?, 'guardian_view', ?, ?)
    `).run(crypto.randomUUID(), caseId, user.id, parsed.data.relationshipLabel, now);
  }

  return res.json({ success: true, userId: user.id });
});

// DELETE /api/cases/:id/guardians/:accessId
casesRouter.delete('/:id/guardians/:accessId', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const { id: caseId, accessId } = req.params;
  const hasAccess = await canAccessCase(req.user, caseId, 'edit');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  db.prepare('DELETE FROM case_access WHERE id = ? AND case_id = ?').run(accessId, caseId);
  return res.json({ success: true });
});

// POST /api/cases/:id/review/signoff - Explicit lawyer sign-off
casesRouter.post('/:id/review/signoff', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'review');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const latestAnalysis = db.prepare<any>(`
    SELECT id, version_no FROM analysis_versions WHERE case_id = ? ORDER BY version_no DESC LIMIT 1
  `).get(caseId);

  const reviewId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO human_reviews (id, case_id, action, reason, reviewer_id, created_at, resulting_version_id)
    VALUES (?, ?, 'signoff', 'Case review and legal audit sign-off confirmed by counsel.', ?, ?, ?)
  `).run(reviewId, caseId, req.user!.userId, now, latestAnalysis?.id || null);

  await recordTimelineEvent({
    caseId,
    eventType: 'review_requested',
    description: `Formal legal case audit sign-off recorded by ${req.user!.name} for version v${latestAnalysis?.version_no || 1}.`,
    actorType: 'lawyer',
    actorId: req.user!.userId,
    guardianVisible: false
  });

  return res.json({ success: true, signedAt: now });
});
