import crypto from 'crypto';
import { getDb } from '../db/client.js';
import type { DatabaseClient } from '../db/client.js';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  caseId?: string | null;
  details?: Record<string, any>;
}

export interface ChainedAuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  case_id: string | null;
  detail_json: string | null;
  created_at: string;
  prev_hash: string | null;
  record_hash: string | null;
}

export function computeAuditHash(input: {
  prevHash: string; actorId: string | null; action: string; entityType: string;
  entityId: string | null; caseId: string | null; detailJson: string | null; createdAt: string;
}): string {
  return crypto.createHash('sha256')
    .update([input.prevHash, input.actorId || '', input.action, input.entityType, input.entityId || '', input.caseId || '', input.detailJson || '', input.createdAt].join('|'))
    .digest('hex');
}

function tableHasChainColumns(db: DatabaseClient): boolean {
  try {
    db.prepare<any>('SELECT prev_hash, record_hash FROM audit_log LIMIT 1').all();
    return true;
  } catch { return false; }
}

export function insertAuditEntry(db: DatabaseClient, entry: AuditEntry): void {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const detailJson = entry.details ? JSON.stringify(entry.details) : null;
  const chained = tableHasChainColumns(db);
  if (!chained) {
    db.prepare(`
      INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, case_id, detail_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.actorId || null,
      entry.action,
      entry.entityType,
      entry.entityId || null,
      entry.caseId || null,
      detailJson,
      now
    );
    return;
  }
  const last = db.prepare<any>('SELECT record_hash FROM audit_log ORDER BY rowid DESC LIMIT 1').get();
  const prevHash = last?.record_hash || 'GENESIS';
  const recordHash = computeAuditHash({
    prevHash, actorId: entry.actorId || null, action: entry.action, entityType: entry.entityType,
    entityId: entry.entityId || null, caseId: entry.caseId || null, detailJson, createdAt: now,
  });
  db.prepare(`
    INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, case_id, detail_json, created_at, prev_hash, record_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, entry.actorId || null, entry.action, entry.entityType, entry.entityId || null, entry.caseId || null, detailJson, now, prevHash, recordHash);
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    insertAuditEntry(db, entry);
  } catch (err) {
    console.error('Failed to write audit log:', err);
    throw err;
  }
}

export async function verifyAuditChain(caseId?: string): Promise<{ ok: boolean; checked: number; brokenAt: string | null; tip: string | null }> {
  const db = await getDb();
  const rows: ChainedAuditRow[] = caseId
    ? db.prepare<ChainedAuditRow>('SELECT * FROM audit_log WHERE case_id = ? ORDER BY rowid ASC').all(caseId)
    : db.prepare<ChainedAuditRow>('SELECT * FROM audit_log ORDER BY rowid ASC').all();
  let prev = 'GENESIS';
  for (const row of rows) {
    if (!row.record_hash) continue;
    if (row.prev_hash !== prev) return { ok: false, checked: rows.length, brokenAt: row.id, tip: row.record_hash };
    const recomputed = computeAuditHash({
      prevHash: row.prev_hash, actorId: row.actor_id, action: row.action, entityType: row.entity_type,
      entityId: row.entity_id, caseId: row.case_id, detailJson: row.detail_json, createdAt: row.created_at,
    });
    if (recomputed !== row.record_hash) return { ok: false, checked: rows.length, brokenAt: row.id, tip: row.record_hash };
    prev = row.record_hash;
  }
  return { ok: true, checked: rows.length, brokenAt: null, tip: rows.length ? prev : null };
}
