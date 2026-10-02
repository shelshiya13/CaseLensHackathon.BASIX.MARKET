import { Router, Request, Response } from 'express';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { getOcrResult, runOcrForDocument } from './ocrService.js';

export const ocrRouter = Router();

// GET /api/documents/:docId/ocr?pageNo=1
ocrRouter.get('/documents/:docId/ocr', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT case_id FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  if (!await canAccessCase(req.user, doc.case_id, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  }
  const pageNo = Number(req.query.pageNo) || 1;
  const existing = await getOcrResult(docId, pageNo);
  if (existing) return res.json({ ocr: existing });
  return res.json({ ocr: null, message: 'No OCR result yet. POST to run OCR for phone photos, scans, receipts, invoices, or signed documents.' });
});

// POST /api/documents/:docId/ocr { pageNo? }
ocrRouter.post('/documents/:docId/ocr', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT case_id, mime FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  if (!await canAccessCase(req.user, doc.case_id, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  }
  const pageNo = Number(req.body?.pageNo) || 1;
  const ocr = await runOcrForDocument(docId, pageNo, doc.mime || 'image/png');
  return res.json({ ocr });
});
