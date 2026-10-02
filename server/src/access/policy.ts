import { AuthUser } from '../auth/middleware.js';
import { getDb } from '../db/client.js';

export type Capability =
  | 'read_case_summary'
  | 'read_documents_shared'
  | 'read_internal'
  | 'upload'
  | 'edit'
  | 'review'
  | 'close';

export async function canAccessCase(
  user: AuthUser | undefined,
  caseId: string,
  capability: Capability
): Promise<boolean> {
  if (!user || !caseId) return false;

  const db = await getDb();

  // Find access record or direct lawyer ownership
  const caseRow = db.prepare<any>(`
    SELECT id, assigned_lawyer_id, closed_at FROM cases WHERE id = ?
  `).get(caseId);

  if (!caseRow) return false;

  const accessRow = db.prepare<any>(`
    SELECT access_level FROM case_access WHERE case_id = ? AND user_id = ?
  `).get(caseId, user.userId);

  const isAssignedLawyer = user.role === 'lawyer' && caseRow.assigned_lawyer_id === user.userId;
  const isOwnerLawyer = accessRow?.access_level === 'owner_lawyer';
  const hasLawyerAccess = isAssignedLawyer || isOwnerLawyer;
  const isGuardianWithAccess = user.role === 'guardian' && accessRow?.access_level === 'guardian_view';

  // If case is closed, mutations are blocked except specific metadata/notes (checked in handlers)
  const isClosed = Boolean(caseRow.closed_at);

  if (user.role === 'lawyer') {
    if (!hasLawyerAccess) return false;

    switch (capability) {
      case 'read_case_summary':
      case 'read_documents_shared':
      case 'read_internal':
        return true;
      case 'upload':
      case 'review':
        return !isClosed; // Read-only for evidence mutations if closed
      case 'edit':
      case 'close':
        return true;
      default:
        return false;
    }
  }

  if (user.role === 'guardian') {
    if (!isGuardianWithAccess) return false;

    switch (capability) {
      case 'read_case_summary':
      case 'read_documents_shared':
        return true;
      case 'read_internal':
      case 'upload':
      case 'edit':
      case 'review':
      case 'close':
      default:
        return false;
    }
  }

  return false;
}

export function mapStatusToGuardianPlainLanguage(status: string): string {
  switch (status) {
    case 'New':
      return 'Case Initiated — Awaiting Documents';
    case 'Under Analysis':
      return 'Processing Documents & Evidence';
    case 'Evidence Review':
      return 'Evidence Under Lawyer Review';
    case 'Conflict Detected':
      return 'Inconsistencies Being Investigated by Lawyer';
    case 'Missing Evidence':
      return 'Pending Corroborating Records';
    case 'Human Review':
      return 'Under Detailed Legal Assessment';
    case 'Decision/Assessment Generated':
      return 'Case Assessment Ready for Review';
    case 'Closed':
      return 'Case Closed';
    default:
      return status;
  }
}
