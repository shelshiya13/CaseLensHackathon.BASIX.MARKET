import crypto from 'crypto';
import fs from 'node:fs';
import { getDb } from '../db/client.js';

export interface IntegrityResult {
  documentId: string; filename: string; expectedSha256: string;
  actualSha256: string | null; match: boolean; checkedAt: string;
}

export function sha256OfFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch { return null; }
}

export async function verifyDocumentIntegrity(caseId: string, checkedBy?: string): Promise<{ results: IntegrityResult[]; tampered: IntegrityResult[] }> {
  const db = await getDb();
  const docs = db.prepare<any>('SELECT id, filename, sha256, storage_path FROM documents WHERE case_id = ? ORDER BY uploaded_at ASC').all(caseId);
  const now = new Date().toISOString();
  const results: IntegrityResult[] = docs.map(d => {
    const actual = sha256OfFile(d.storage_path);
    const match = Boolean(actual && actual === d.sha256);
    try {
      db.prepare(`INSERT INTO integrity_checks (id, case_id, document_id, expected_sha256, actual_sha256, match, checked_at, checked_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(crypto.randomUUID(), caseId, d.id, d.sha256, actual || 'MISSING', match ? 1 : 0, now, checkedBy || null);
    } catch { /* table may predate migration in long-lived dev DBs */ }
    return { documentId: d.id, filename: d.filename, expectedSha256: d.sha256, actualSha256: actual, match, checkedAt: now };
  });
  return { results, tampered: results.filter(r => !r.match) };
}
