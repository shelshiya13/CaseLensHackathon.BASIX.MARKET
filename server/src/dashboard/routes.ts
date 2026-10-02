import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase, mapStatusToGuardianPlainLanguage } from '../access/policy.js';

export const dashboardRouter = Router();

// GET /api/dashboard/lawyer - Comprehensive live counts for lawyer
dashboardRouter.get('/lawyer', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const db = await getDb();
  const userId = req.user!.userId;
  const now = new Date().toISOString();

  // Accessible cases
  const accessibleCases = db.prepare<any>(`
    SELECT c.*,
      (SELECT COUNT(*) FROM conflicts cf WHERE cf.case_id = c.id AND cf.status = 'open') as open_conflicts,
      (SELECT COUNT(*) FROM missing_evidence me WHERE me.case_id = c.id AND me.status = 'open') as open_missing,
      (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id AND e.status = 'challenged') as challenged_evidence,
      (SELECT COUNT(*) FROM evidence e WHERE e.case_id = c.id AND e.status = 'active') as active_evidence
    FROM cases c
    LEFT JOIN case_access ca ON ca.case_id = c.id AND ca.user_id = ?
    WHERE c.assigned_lawyer_id = ? OR ca.access_level = 'owner_lawyer'
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `).all(userId, userId);

  const activeCasesCount = accessibleCases.filter(c => c.status !== 'Closed').length;
  const pendingCasesCount = accessibleCases.filter(c => c.status === 'New').length;
  const casesWithConflictsCount = accessibleCases.filter(c => c.open_conflicts > 0).length;
  const casesWithMissingCount = accessibleCases.filter(c => c.open_missing > 0).length;
  const casesAwaitingReviewCount = accessibleCases.filter(c => c.status === 'Human Review' || c.challenged_evidence > 0).length;

  // Upcoming hearings
  const upcomingHearings = db.prepare<any>(`
    SELECT c.id, c.case_ref, c.title, c.next_hearing_at, c.next_hearing_type, c.status
    FROM cases c
    LEFT JOIN case_access ca ON ca.case_id = c.id AND ca.user_id = ?
    WHERE (c.assigned_lawyer_id = ? OR ca.access_level = 'owner_lawyer')
      AND c.next_hearing_at IS NOT NULL
      AND c.next_hearing_at >= ?
      AND c.closed_at IS NULL
    GROUP BY c.id
    ORDER BY c.next_hearing_at ASC
    LIMIT 10
  `).all(userId, userId, now);

  // Recently added evidence
  const recentEvidence = db.prepare<any>(`
    SELECT e.id, e.case_id, e.evidence_ref, e.fact_label, e.fact_text, e.created_at,
           c.case_ref, d.filename as document_filename
    FROM evidence e
    JOIN cases c ON c.id = e.case_id
    JOIN documents d ON d.id = e.document_id
    LEFT JOIN case_access ca ON ca.case_id = c.id AND ca.user_id = ?
    WHERE c.assigned_lawyer_id = ? OR ca.access_level = 'owner_lawyer'
    ORDER BY e.created_at DESC
    LIMIT 8
  `).all(userId, userId);

  // Status distribution
  const statusMap: Record<string, number> = {};
  for (const c of accessibleCases) {
    statusMap[c.status] = (statusMap[c.status] || 0) + 1;
  }

  return res.json({
    summary: {
      activeCases: activeCasesCount,
      pendingCases: pendingCasesCount,
      casesWithConflicts: casesWithConflictsCount,
      casesWithMissingEvidence: casesWithMissingCount,
      casesAwaitingReview: casesAwaitingReviewCount,
      totalCases: accessibleCases.length
    },
    upcomingHearings,
    recentlyUpdatedCases: accessibleCases.slice(0, 6),
    recentEvidence,
    statusDistribution: statusMap
  });
});

// GET /api/dashboard/guardian - Guardian case list
dashboardRouter.get('/guardian', requireAuth, requireRole('guardian'), async (req: Request, res: Response) => {
  const db = await getDb();
  const userId = req.user!.userId;
  const now = new Date().toISOString();

  const cases = db.prepare<any>(`
    SELECT c.id, c.guardian_friendly_title, c.title, c.status,
           c.next_hearing_at, c.next_hearing_type, c.court, c.updated_at,
           ca.relationship_label
    FROM cases c
    JOIN case_access ca ON ca.case_id = c.id
    WHERE ca.user_id = ? AND ca.access_level = 'guardian_view'
    ORDER BY c.updated_at DESC
  `).all(userId);

  const mappedCases = cases.map(c => ({
    id: c.id,
    displayTitle: c.guardian_friendly_title || c.title,
    rawStatus: c.status,
    plainStatus: mapStatusToGuardianPlainLanguage(c.status),
    nextHearingAt: c.next_hearing_at,
    nextHearingType: c.next_hearing_type,
    hasUpcomingHearing: Boolean(c.next_hearing_at && c.next_hearing_at >= now),
    court: c.court,
    relationship: c.relationship_label,
    updatedAt: c.updated_at
  }));

  return res.json({ cases: mappedCases });
});

// GET /api/guardian/cases/:id - Guardian strict DTO view
dashboardRouter.get('/cases/:id', requireAuth, requireRole('guardian'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_case_summary');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  const caseRow = db.prepare<any>(`
    SELECT c.id, c.guardian_friendly_title, c.title, c.status,
           c.next_hearing_at, c.next_hearing_type, c.court, c.case_number,
           c.filing_date, c.closed_at, u.name as lawyer_name
    FROM cases c
    JOIN users u ON u.id = c.assigned_lawyer_id
    WHERE c.id = ?
  `).get(caseId);

  if (!caseRow) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  // Only shared documents
  const sharedDocs = db.prepare<any>(`
    SELECT id, filename, mime, size_bytes, uploaded_at
    FROM documents
    WHERE case_id = ? AND shared_with_guardian = 1
    ORDER BY uploaded_at DESC
  `).all(caseId);

  // Only guardian visible timeline updates
  const updates = db.prepare<any>(`
    SELECT id, occurred_at, description, event_type
    FROM timeline_events
    WHERE case_id = ? AND guardian_visible = 1
    ORDER BY occurred_at DESC
  `).all(caseId);

  return res.json({
    case: {
      id: caseRow.id,
      title: caseRow.guardian_friendly_title || caseRow.title,
      status: mapStatusToGuardianPlainLanguage(caseRow.status),
      isClosed: Boolean(caseRow.closed_at),
      court: caseRow.court,
      caseNumber: caseRow.case_number,
      filingDate: caseRow.filing_date,
      nextHearingAt: caseRow.next_hearing_at,
      nextHearingType: caseRow.next_hearing_type,
      hasUpcomingHearing: Boolean(caseRow.next_hearing_at && new Date(caseRow.next_hearing_at) >= new Date()),
      lawyerName: caseRow.lawyer_name
    },
    sharedDocuments: sharedDocs,
    updates
  });
});
