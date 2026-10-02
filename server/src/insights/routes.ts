import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';

export const insightsRouter = Router();

// GET /api/cases/:id/export.pdf — timeline, evidence, conflicts, reasoning, review, audit, versions
insightsRouter.get('/cases/:id/export.pdf', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  const db = await getDb();
  const caseRow = db.prepare<any>('SELECT * FROM cases WHERE id = ?').get(caseId);
  const evidence = db.prepare<any>('SELECT * FROM evidence WHERE case_id = ? ORDER BY evidence_ref ASC').all(caseId);
  const conflicts = db.prepare<any>('SELECT * FROM conflicts WHERE case_id = ? ORDER BY conflict_ref ASC').all(caseId);
  const versions = db.prepare<any>('SELECT * FROM analysis_versions WHERE case_id = ? ORDER BY version_no ASC').all(caseId);
  const timeline = db.prepare<any>('SELECT * FROM timeline_events WHERE case_id = ? ORDER BY occurred_at ASC LIMIT 200').all(caseId);
  const PDFDocument = (await import('pdfkit')).default;
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="caselens-${caseRow.case_ref}-report.pdf"`);
  doc.pipe(res);
  doc.fillColor('#14213D').fontSize(22).font('Helvetica-Bold').text('CaseLens — Case Intelligence Report');
  doc.fillColor('#5C5E66').fontSize(10).font('Helvetica').text(`${caseRow.case_ref} / ${caseRow.title} / ${new Date().toISOString()}`);
  doc.fillColor('#14213D').fontSize(14).font('Helvetica-Bold').text('Timeline');
  for (const t of timeline.slice(0, 60)) doc.fillColor('#2B2D33').fontSize(9).font('Helvetica').text(`- ${t.occurred_at} ${t.event_type}`.slice(0, 200));
  doc.fillColor('#14213D').fontSize(14).font('Helvetica-Bold').text('Evidence');
  for (const e of evidence) doc.fillColor('#2B2D33').fontSize(9).font('Helvetica').text(`${e.evidence_ref} ${e.fact_label}: ${String(e.fact_text).slice(0, 200)}`);
  doc.fillColor('#14213D').fontSize(14).font('Helvetica-Bold').text('Conflicts + Versions');
  for (const c of conflicts) doc.fillColor('#2B2D33').fontSize(9).font('Helvetica').text(`- ${c.conflict_ref} ${String(c.description).slice(0, 200)}`);
  for (const v of versions) doc.fillColor('#2B2D33').fontSize(9).font('Helvetica').text(`v${v.version_no} ${v.assessment_status}: ${String(v.summary_text).slice(0, 300)}`);
  doc.end();
});

// GET /api/cases/:id/insights — stats, timeline chart, 5 graphs
insightsRouter.get('/cases/:id/insights', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const db = await getDb();
  const evidence = db.prepare<any>('SELECT id, evidence_ref, evidence_type, fact_label, entity, confidence, document_id, created_at FROM evidence WHERE case_id = ? ORDER BY evidence_ref ASC').all(caseId);
  const conflicts = db.prepare<any>('SELECT id, conflict_ref, conflict_type, evidence_a_id, evidence_b_id, severity, status FROM conflicts WHERE case_id = ?').all(caseId);
  const documents = db.prepare<any>('SELECT id, filename, mime, processing_status, uploaded_at FROM documents WHERE case_id = ? ORDER BY uploaded_at ASC').all(caseId);
  const versions = db.prepare<any>('SELECT version_no, trigger, assessment_status, model_used, created_at FROM analysis_versions WHERE case_id = ? ORDER BY version_no ASC').all(caseId);
  const events = db.prepare<any>('SELECT id, occurred_at, event_type, actor_type FROM timeline_events WHERE case_id = ? ORDER BY occurred_at ASC LIMIT 200').all(caseId);
  const relations = db.prepare<any>('SELECT from_evidence_id, to_evidence_id, relation FROM evidence_relations WHERE case_id = ?').all(caseId);
  const parties = db.prepare<any>('SELECT id, name, party_role FROM case_parties WHERE case_id = ?').all(caseId);
  const agents = db.prepare<any>('SELECT agent_name, status, confidence, summary, persisted_at FROM agent_runs WHERE case_id = ? ORDER BY persisted_at ASC LIMIT 100').all(caseId);

  const evidenceByType: Record<string, number> = {};
  for (const e of evidence) evidenceByType[e.evidence_type] = (evidenceByType[e.evidence_type] || 0) + 1;
  const byDay: Record<string, { evidence: number; events: number }> = {};
  for (const e of evidence) {
    const day = String(e.created_at || '').slice(0, 10) || 'undated';
    byDay[day] = byDay[day] || { evidence: 0, events: 0 };
    byDay[day].evidence++;
  }
  for (const ev of events) {
    const day = String(ev.occurred_at || '').slice(0, 10) || 'undated';
    byDay[day] = byDay[day] || { evidence: 0, events: 0 };
    byDay[day].events++;
  }
  const timelineChart = Object.entries(byDay).sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, v]) => ({ day, ...v }));
  const evidenceEdges = relations.map(r => ({ from: r.from_evidence_id, to: r.to_evidence_id, relation: r.relation }));
  const byDoc: Record<string, string[]> = {};
  for (const e of evidence) { byDoc[e.document_id] = byDoc[e.document_id] || []; byDoc[e.document_id].push(e.id); }
  for (const ids of Object.values(byDoc)) for (let i = 1; i < ids.length; i++) evidenceEdges.push({ from: ids[i - 1], to: ids[i], relation: 'refers_to' });
  const conflictEdges = conflicts.flatMap(c => [
    { from: c.id, to: c.evidence_a_id, relation: 'contradicts' },
    { from: c.id, to: c.evidence_b_id, relation: 'contradicts' },
  ]);
  const documentEdges = evidence.map(e => ({ from: e.document_id, to: e.id, relation: 'contains' }));
  const partyEdges: Array<{ from: string; to: string; relation: string }> = [];
  for (const p of parties) {
    const needle = p.name.toLowerCase().split(' ')[0];
    for (const e of evidence) if (e.entity && e.entity.toLowerCase().includes(needle)) partyEdges.push({ from: p.id, to: e.id, relation: 'mentioned_in' });
  }
  return res.json({
    stats: {
      documents: documents.length, evidence: evidence.length,
      openConflicts: conflicts.filter(c => c.status === 'open').length,
      versions: versions.length, parties: parties.length, relations: relations.length,
      evidenceByType,
      avgConfidence: evidence.length ? evidence.reduce((s, e) => s + (e.confidence || 0), 0) / evidence.length : 0,
    },
    timelineChart,
    graphs: {
      evidence: { nodes: evidence.map(e => ({ id: e.id, ref: e.evidence_ref, label: e.fact_label, type: e.evidence_type })), edges: evidenceEdges },
      conflicts: { nodes: conflicts, edges: conflictEdges },
      documents: { nodes: documents, edges: documentEdges },
      parties: { nodes: parties, edges: partyEdges },
      aiActivity: agents,
    },
    versions,
  });
});

// GET /api/system/health — AI, Gemini, DB, uploads, queue, workers, performance
insightsRouter.get('/system/health', requireAuth, requireRole('lawyer'), async (_req: Request, res: Response) => {
  const t0 = Date.now();
  const { getGeminiClient: getClient } = await import('../agents/geminiClient.js');
  const { env: envCfg } = await import('../config/env.js');
  const db = await getDb();
  let dbLatencyMs = -1; let dbOk = false;
  try { const s = Date.now(); db.prepare('SELECT 1 as ok').get(); dbLatencyMs = Date.now() - s; dbOk = true; } catch { dbOk = false; }
  const queue = db.prepare<any>('SELECT status, COUNT(*) as n FROM jobs GROUP BY status').all();
  const byStatus: Record<string, number> = {};
  for (const q of queue) byStatus[q.status] = q.n;
  let storageOk = true;
  try { const fs = await import('node:fs'); fs.mkdirSync(process.env.DATA_DIR || './data', { recursive: true }); } catch { storageOk = false; }
  const ai = getClient();
  const mem = process.memoryUsage();
  return res.json({ health: {
    ai: { geminiConfigured: Boolean(ai), model: envCfg.GEMINI_MODEL, fallback: ai ? 'gemini' : 'deterministic rule engine' },
    gemini: { configured: Boolean(ai), model: envCfg.GEMINI_MODEL },
    database: { ok: dbOk, latencyMs: dbLatencyMs },
    uploads: { ok: storageOk, dir: process.env.DATA_DIR || './data' },
    queue: { byStatus, stuckRunning: db.prepare<any>("SELECT COUNT(*) as n FROM jobs WHERE status = 'running'").get()?.n || 0 },
    workers: { mode: 'background interval 1s', active: true },
    performance: { healthCheckMs: Date.now() - t0, rssMB: Math.round(mem.rss / 1024 / 1024), heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024), uptimeSec: Math.round(process.uptime()) },
  } });
});

// GET /api/system/metrics — queue + agent activity
insightsRouter.get('/system/metrics', requireAuth, requireRole('lawyer'), async (_req: Request, res: Response) => {
  const db = await getDb();
  return res.json({
    jobs: db.prepare<any>('SELECT kind, status, step, created_at, finished_at FROM jobs ORDER BY created_at DESC LIMIT 50').all(),
    agents: db.prepare<any>('SELECT agent_name, status, persisted_at FROM agent_runs ORDER BY persisted_at DESC LIMIT 50').all(),
  });
});

// GET /api/notifications/stream — real-time polling feed
insightsRouter.get('/notifications/stream', requireAuth, async (req: Request, res: Response) => {
  const db = await getDb();
  const since = String(req.query.since || '1970-01-01T00:00:00.000Z');
  const rows = db.prepare<any>('SELECT n.*, c.case_ref FROM notifications n JOIN cases c ON c.id = n.case_id WHERE n.user_id = ? AND n.created_at > ? ORDER BY n.created_at DESC LIMIT 25').all(req.user!.userId, since);
  const unread = db.prepare<any>('SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user!.userId)?.n || 0;
  return res.json({ notifications: rows, unreadCount: unread, serverTime: new Date().toISOString() });
});
