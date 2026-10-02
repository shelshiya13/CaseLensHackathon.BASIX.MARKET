import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { SUPPORTED_LANGUAGES } from './languages.js';
import { translateToEnglish } from './translateService.js';

export const i18nRouter = Router();

// GET /api/i18n/languages
i18nRouter.get('/i18n/languages', requireAuth, async (_req: Request, res: Response) => {
  return res.json({ languages: SUPPORTED_LANGUAGES });
});

// GET /api/cases/:id/translations?documentId=
i18nRouter.get('/cases/:id/translations', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'read_internal')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const db = await getDb();
  const documentId = req.query.documentId as string | undefined;
  const rows = documentId
    ? db.prepare<any>('SELECT dt.*, d.filename FROM document_translations dt JOIN documents d ON d.id = dt.document_id WHERE dt.document_id = ? AND d.case_id = ? ORDER BY dt.page_no ASC').all(documentId, caseId)
    : db.prepare<any>('SELECT dt.*, d.filename FROM document_translations dt JOIN documents d ON d.id = dt.document_id WHERE d.case_id = ? ORDER BY d.filename ASC, dt.page_no ASC').all(caseId);
  return res.json({ translations: rows, languages: SUPPORTED_LANGUAGES });
});

// POST /api/cases/:id/translate { documentId, pageNo?, languageHint? }
i18nRouter.post('/cases/:id/translate', requireAuth, requireRole('lawyer'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  if (!await canAccessCase(req.user, caseId, 'review')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });
  }
  const { documentId, pageNo, languageHint } = req.body || {};
  if (typeof documentId !== 'string' || !documentId.trim()) {
    return res.status(400).json({ error: { code: 'INVALID_DOCUMENT', message: 'documentId is required.' } });
  }
  const db = await getDb();
  const doc = db.prepare<any>('SELECT id FROM documents WHERE id = ? AND case_id = ?').get(documentId, caseId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  const targetPage = Number(pageNo) || 1;
  const page = db.prepare<any>('SELECT text FROM document_pages WHERE document_id = ? AND page_no = ?').get(documentId, targetPage);
  const originalText = ((page?.text as string) || '').trim();
  if (!originalText) {
    return res.status(400).json({ error: { code: 'NO_TEXT', message: 'No extracted text on that page yet. Run OCR or upload a text transcription first.' } });
  }
  const result = await translateToEnglish(originalText, typeof languageHint === 'string' ? languageHint : undefined);
  const now = new Date().toISOString();
  const existing = db.prepare<any>('SELECT id FROM document_translations WHERE document_id = ? AND page_no = ? AND source_language = ?')
    .get(documentId, targetPage, result.sourceLanguage);
  if (existing) {
    db.prepare('UPDATE document_translations SET original_text = ?, english_text = ?, provider = ?, confidence = ? WHERE id = ?')
      .run(originalText, result.englishText, result.provider, result.confidence, existing.id);
    return res.json({ translation: { id: existing.id, documentId, pageNo: targetPage, originalText, ...result } });
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO document_translations (id, document_id, page_no, source_language, original_text, english_text, provider, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, documentId, targetPage, result.sourceLanguage, originalText, result.englishText, result.provider, result.confidence, now);
  return res.json({ translation: { id, documentId, pageNo: targetPage, originalText, ...result } });
});
