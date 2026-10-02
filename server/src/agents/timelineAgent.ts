import crypto from 'crypto';
import { getDb } from '../db/client.js';
import type { DatabaseClient } from '../db/client.js';

export interface TimelineEventInput {
  caseId: string;
  eventType: string;
  description: string;
  source?: string | null;
  actorType: 'system' | 'lawyer' | 'guardian';
  actorId?: string | null;
  guardianVisible?: boolean;
  occurredAt?: string;
  meta?: Record<string, any>;
}

export function insertTimelineEvent(db: DatabaseClient, input: TimelineEventInput): string {
  const id = crypto.randomUUID();
  const occurredAt = input.occurredAt || new Date().toISOString();

  db.prepare(`
    INSERT INTO timeline_events (
      id, case_id, occurred_at, event_type, description, source,
      actor_type, actor_id, guardian_visible, meta_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.caseId,
    occurredAt,
    input.eventType,
    input.description,
    input.source || null,
    input.actorType,
    input.actorId || null,
    input.guardianVisible ? 1 : 0,
    input.meta ? JSON.stringify(input.meta) : null
  );

  return id;
}

export async function recordTimelineEvent(input: TimelineEventInput): Promise<string> {
  return insertTimelineEvent(await getDb(), input);
}

export async function getCaseTimeline(caseId: string, isGuardian = false) {
  const db = await getDb();
  const query = isGuardian
    ? `SELECT * FROM timeline_events WHERE case_id = ? AND guardian_visible = 1 ORDER BY occurred_at DESC`
    : `SELECT * FROM timeline_events WHERE case_id = ? ORDER BY occurred_at DESC`;

  const events = db.prepare<any>(query).all(caseId);

  // Document dated events (from evidence date_value)
  const docEvents = db.prepare<any>(`
    SELECT id, evidence_ref, fact_label, date_value, date_raw, source_quote, document_id, page_no
    FROM evidence
    WHERE case_id = ? AND date_value IS NOT NULL AND status = 'active'
    ORDER BY date_value ASC
  `).all(caseId);

  return {
    activityEvents: events.map(e => ({
      ...e,
      meta: e.meta_json ? JSON.parse(e.meta_json) : null
    })),
    documentDatedEvents: docEvents
  };
}
