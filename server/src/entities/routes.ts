import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { listEntityClusters, persistSuggestedClusters } from './entityService.js';

export const entityRouter = Router();

// GET /api/cases/:id/entities
entityRouter.get('/cases/:id/entities', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  return res.json({ clusters: await listEntityClusters(caseId) });
});

// POST /api/cases/:id/entities/suggest
entityRouter.post('/cases/:id/entities/suggest', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const db = await getDb();
  const overrideNames = Array.isArray(req.body?.names) ? req.body.names.filter((n: unknown) => typeof n === 'string') : null;
  const names: string[] = overrideNames || db.prepare<any>(
    "SELECT entity FROM evidence WHERE case_id = ? AND status = 'active' AND entity IS NOT NULL AND entity != ''"
  ).all(caseId).map(r => r.entity as string);
  if (names.length === 0) return res.json({ clusters: [], message: 'No entity mentions found yet.' });
  return res.json({ clusters: await persistSuggestedClusters(caseId, names) });
});

// POST /api/entities/:clusterId/review { action: accept|reject|split|merge, canonicalName?, mergeWithClusterId?, splitAliases? }
entityRouter.post('/entities/:clusterId/review', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const clusterId = req.params.clusterId;
  const db = await getDb();
  const cluster = db.prepare<any>('SELECT * FROM entity_clusters WHERE id = ?').get(clusterId);
  if (!cluster) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Entity cluster not found' } });
  if (!await canAccessCase(req.user, cluster.case_id, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const action = req.body?.action as string;
  const now = new Date().toISOString();
  if (action === 'accept' || action === 'reject') {
    db.prepare('UPDATE entity_clusters SET status = ?, updated_at = ? WHERE id = ?')
      .run(action === 'accept' ? 'accepted' : 'rejected', now, clusterId);
    return res.json({ success: true, status: action === 'accept' ? 'accepted' : 'rejected' });
  }
  if (action === 'split') {
    const aliases = Array.isArray(req.body?.splitAliases) ? req.body.splitAliases.filter((a: unknown) => typeof a === 'string') : [];
    if (aliases.length === 0) return res.status(400).json({ error: { code: 'INVALID_SPLIT', message: 'splitAliases is required.' } });
    const newClusterId = crypto.randomUUID();
    db.prepare('INSERT INTO entity_clusters (id, case_id, canonical_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newClusterId, cluster.case_id, aliases[0], 'split', now, now);
    for (const alias of aliases) {
      db.prepare('UPDATE entity_aliases SET cluster_id = ? WHERE cluster_id = ? AND alias = ?').run(newClusterId, clusterId, alias);
    }
    db.prepare('UPDATE entity_clusters SET status = ?, updated_at = ? WHERE id = ?').run('split', now, clusterId);
    return res.json({ success: true, status: 'split', newClusterId });
  }
  if (action === 'merge') {
    const otherId = req.body?.mergeWithClusterId as string;
    const canonical = (req.body?.canonicalName as string) || cluster.canonical_name;
    if (!otherId) return res.status(400).json({ error: { code: 'INVALID_MERGE', message: 'mergeWithClusterId is required.' } });
    const other = db.prepare<any>('SELECT * FROM entity_clusters WHERE id = ? AND case_id = ?').get(otherId, cluster.case_id);
    if (!other) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Target cluster not found' } });
    db.prepare('UPDATE entity_aliases SET cluster_id = ? WHERE cluster_id = ?').run(clusterId, otherId);
    db.prepare('UPDATE entity_clusters SET status = ?, canonical_name = ?, updated_at = ? WHERE id = ?').run('merged', canonical, now, clusterId);
    db.prepare('DELETE FROM entity_clusters WHERE id = ?').run(otherId);
    return res.json({ success: true, status: 'merged' });
  }
  return res.status(400).json({ error: { code: 'INVALID_ACTION', message: 'action must be accept, reject, split, or merge.' } });
});
