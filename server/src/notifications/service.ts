import crypto from 'crypto';
import { getDb } from '../db/client.js';

export interface NotificationInput {
  userId: string;
  caseId: string;
  kind: string;
  title: string;
  body: string;
  sourceEventId?: string;
}

export async function createNotification(input: NotificationInput): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO notifications (id, user_id, case_id, kind, title, body, created_at, source_event_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.userId, input.caseId, input.kind, input.title, input.body, now, input.sourceEventId || null);

  return id;
}

export async function checkUpcomingHearingNotifications() {
  const db = await getDb();
  const now = new Date();
  const in72Hours = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  // Find cases with hearing in the next 72 hours
  const upcomingCases = db.prepare<any>(`
    SELECT id, title, case_ref, guardian_friendly_title, next_hearing_at, next_hearing_type, assigned_lawyer_id
    FROM cases
    WHERE next_hearing_at IS NOT NULL
      AND next_hearing_at >= ?
      AND next_hearing_at <= ?
      AND closed_at IS NULL
  `).all(now.toISOString(), in72Hours.toISOString());

  for (const c of upcomingCases) {
    const hearingDateStr = new Date(c.next_hearing_at).toLocaleString();

    // Notify assigned lawyer if not already notified for this hearing date
    const existingLawyerNotif = db.prepare<any>(`
      SELECT id FROM notifications
      WHERE user_id = ? AND case_id = ? AND kind = 'upcoming_hearing'
        AND body LIKE ?
    `).get(c.assigned_lawyer_id, c.id, `%${c.next_hearing_at.slice(0, 10)}%`);

    if (!existingLawyerNotif) {
      await createNotification({
        userId: c.assigned_lawyer_id,
        caseId: c.id,
        kind: 'upcoming_hearing',
        title: `Upcoming Hearing: ${c.case_ref}`,
        body: `Hearing (${c.next_hearing_type || 'General'}) scheduled on ${hearingDateStr} for ${c.title}.`
      });
    }

    // Notify linked guardians
    const guardians = db.prepare<any>(`
      SELECT u.id FROM users u
      JOIN case_access ca ON ca.user_id = u.id
      WHERE ca.case_id = ? AND ca.access_level = 'guardian_view'
    `).all(c.id);

    for (const g of guardians) {
      const existingGNotif = db.prepare<any>(`
        SELECT id FROM notifications
        WHERE user_id = ? AND case_id = ? AND kind = 'upcoming_hearing'
          AND body LIKE ?
      `).get(g.id, c.id, `%${c.next_hearing_at.slice(0, 10)}%`);

      if (!existingGNotif) {
        await createNotification({
          userId: g.id,
          caseId: c.id,
          kind: 'upcoming_hearing',
          title: `Upcoming Court Hearing`,
          body: `A court hearing has been scheduled on ${hearingDateStr} for "${c.guardian_friendly_title || c.title}".`
        });
      }
    }
  }
}
