import { getDb } from '../db/client.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';

export function deriveCaseStatus(
  caseRow: { closed_at?: string | null },
  docCount: number,
  activeJobCount: number,
  openConflictCount: number,
  openMissingCount: number,
  challengedEvidenceCount: number,
  latestAssessmentStatus?: string | null,
  hasAnalysis = false
): string {
  if (caseRow.closed_at) {
    return 'Closed';
  }
  if (activeJobCount > 0) {
    return 'Under Analysis';
  }
  if (docCount === 0) {
    return 'New';
  }
  if (openConflictCount > 0) {
    return 'Conflict Detected';
  }
  if (openMissingCount > 0) {
    return 'Missing Evidence';
  }
  if (challengedEvidenceCount > 0 || latestAssessmentStatus === 'human_review_required') {
    return 'Human Review';
  }
  if (!hasAnalysis) {
    return 'Evidence Review';
  }
  return 'Decision/Assessment Generated';
}

export async function updateCaseStatusIfNeeded(caseId: string, actorId?: string): Promise<string> {
  const db = await getDb();
  const caseRow = db.prepare<any>('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!caseRow) return 'New';

  const docCount = db.prepare<any>('SELECT COUNT(*) as c FROM documents WHERE case_id = ?').get(caseId)?.c || 0;
  const activeJobCount = db.prepare<any>(`
    SELECT COUNT(*) as c FROM jobs WHERE case_id = ? AND status IN ('queued', 'running')
  `).get(caseId)?.c || 0;
  const openConflictCount = db.prepare<any>(`
    SELECT COUNT(*) as c FROM conflicts WHERE case_id = ? AND status = 'open'
  `).get(caseId)?.c || 0;
  const openMissingCount = db.prepare<any>(`
    SELECT COUNT(*) as c FROM missing_evidence WHERE case_id = ? AND status = 'open'
  `).get(caseId)?.c || 0;
  const challengedEvidenceCount = db.prepare<any>(`
    SELECT COUNT(*) as c FROM evidence WHERE case_id = ? AND status = 'challenged'
  `).get(caseId)?.c || 0;
  const latestAnalysis = db.prepare<any>(`
    SELECT assessment_status FROM analysis_versions WHERE case_id = ? ORDER BY version_no DESC LIMIT 1
  `).get(caseId);

  const newStatus = deriveCaseStatus(
    caseRow,
    docCount,
    activeJobCount,
    openConflictCount,
    openMissingCount,
    challengedEvidenceCount,
    latestAnalysis?.assessment_status,
    Boolean(latestAnalysis)
  );

  if (newStatus !== caseRow.status) {
    const now = new Date().toISOString();
    db.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, caseId);

    await recordTimelineEvent({
      caseId,
      eventType: 'status_changed',
      description: `Case status updated from "${caseRow.status}" to "${newStatus}".`,
      actorType: actorId ? 'lawyer' : 'system',
      actorId: actorId || null,
      guardianVisible: true,
      meta: { oldStatus: caseRow.status, newStatus }
    });
  }

  return newStatus;
}
