import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { recordTimelineEvent } from '../agents/timelineAgent.js';
import { logAudit } from '../audit/auditLog.js';

export interface VersionSignoffView {
  id: string; caseId: string; versionNo: number; signerName: string;
  signedAt: string; status: string; signatureHash: string;
  invalidatedAt: string | null; invalidateReason: string | null;
}

export function versionSignature(caseId: string, versionNo: number, signerId: string, signedAt: string): string {
  return crypto.createHash('sha256').update([caseId, String(versionNo), signerId, signedAt].join('|')).digest('hex');
}

export async function signVersion(caseId: string, versionNo: number, signerId: string, signerName: string): Promise<VersionSignoffView> {
  const db = await getDb();
  const version = db.prepare<any>('SELECT id, version_no FROM analysis_versions WHERE case_id = ? AND version_no = ?').get(caseId, versionNo);
  if (!version) throw new Error('Analysis version not found.');
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const signatureHash = versionSignature(caseId, versionNo, signerId, now);
  db.prepare(`INSERT INTO version_signoffs (id, case_id, version_no, version_id, signer_id, signer_name, signed_at, status, signature_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'valid', ?)`)
    .run(id, caseId, versionNo, version.id, signerId, signerName, now, signatureHash);
  await recordTimelineEvent({
    caseId, eventType: 'review_requested', description: `Version v${versionNo} signed and locked by ${signerName}.`,
    actorType: 'lawyer', actorId: signerId, guardianVisible: false,
  });
  await logAudit({ actorId: signerId, action: 'version_sign', entityType: 'analysis_version', entityId: version.id, caseId, details: { versionNo } });
  return { id, caseId, versionNo, signerName, signedAt: now, status: 'valid', signatureHash, invalidatedAt: null, invalidateReason: null };
}

export async function listSignoffs(caseId: string): Promise<VersionSignoffView[]> {
  const db = await getDb();
  try {
    return db.prepare<any>('SELECT * FROM version_signoffs WHERE case_id = ? ORDER BY version_no DESC, signed_at DESC').all(caseId)
      .map(r => ({ id: r.id, caseId: r.case_id, versionNo: r.version_no, signerName: r.signer_name, signedAt: r.signed_at, status: r.status, signatureHash: r.signature_hash, invalidatedAt: r.invalidated_at, invalidateReason: r.invalidate_reason }));
  } catch { return []; }
}

// Any later modification (new analysis version, evidence correction/reject,
// re-upload) invalidates earlier sign-offs for that case.
export async function invalidateSignoffs(caseId: string, reason: string): Promise<number> {
  const db = await getDb();
  try {
    const now = new Date().toISOString();
    const open = db.prepare<any>("SELECT id FROM version_signoffs WHERE case_id = ? AND status = 'valid'").all(caseId);
    for (const row of open) {
      db.prepare("UPDATE version_signoffs SET status = 'invalidated', invalidated_at = ?, invalidate_reason = ? WHERE id = ?").run(now, reason, row.id);
    }
    return open.length;
  } catch { return 0; }
}
