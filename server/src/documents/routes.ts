import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/client.js';
import { requireAuth } from '../auth/middleware.js';
import { canAccessCase } from '../access/policy.js';
import { enqueueJob, insertQueuedJob, scheduleWorker } from '../jobs/queue.js';
import { insertTimelineEvent, recordTimelineEvent } from '../agents/timelineAgent.js';
import { insertAuditEntry } from '../audit/auditLog.js';
import { updateCaseStatusIfNeeded } from '../cases/status.js';
import { logPipelineStage } from '../agents/pipelineLog.js';
import { updateEvidenceRequestOnDocument } from '../agents/caseAgents.js';

export const documentsRouter = Router();

const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024, files: 5, fields: 10 },
  storage: multer.memoryStorage()
});

function validateUploadedFile(file: Express.Multer.File): string | null {
  const extension = path.extname(file.originalname).toLowerCase();
  const bytes = file.buffer;
  if (extension === '.pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-' ? null : 'File contents are not a valid PDF.';
  if (extension === '.docx') return bytes.subarray(0, 2).toString('ascii') === 'PK' ? null : 'File contents are not a valid DOCX archive.';
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? null : 'File contents are not a valid PNG image.';
  if (extension === '.jpg' || extension === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? null : 'File contents are not a valid JPEG image.';
  if (extension === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP' ? null : 'File contents are not a valid WebP image.';
  if (extension === '.txt' || extension === '.md' || extension === '.eml') return bytes.includes(0) ? 'Text documents cannot contain null bytes.' : null;
  return 'Unsupported file type. Upload PDF, DOCX, TXT, EML, Markdown, PNG, JPEG, or WebP.';
}

// POST /api/cases/:id/documents - Upload document
documentsRouter.post('/:id/documents', requireAuth, upload.array('files'), async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'upload');
  if (!hasAccess) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed for uploads' } });
  }

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: { code: 'NO_FILES', message: 'No files provided for upload' } });
  }

  const db = await getDb();
  const allowDuplicate = req.body.allowDuplicate === 'true' || req.body.allowDuplicate === true;
  const shareWithGuardian = req.body.shareWithGuardian === 'true' || req.body.shareWithGuardian === true ? 1 : 0;
  const docTypeGuess = req.body.docType || null;

  const seenHashes = new Map<string, string>();
  for (const file of files) {
    const validationError = validateUploadedFile(file);
    if (validationError) {
      return res.status(400).json({
        error: { code: 'INVALID_DOCUMENT', message: `${file.originalname}: ${validationError}` }
      });
    }
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existingDoc = db.prepare<any>(`
      SELECT id, filename FROM documents WHERE case_id = ? AND sha256 = ?
    `).get(caseId, sha256);

    const batchDuplicate = seenHashes.get(sha256);
    if (!allowDuplicate && (existingDoc || batchDuplicate)) {
      const duplicateFilename = existingDoc?.filename || batchDuplicate;
      return res.status(409).json({
        error: {
          code: 'DUPLICATE_DOCUMENT',
          message: `Document "${file.originalname}" is identical to "${duplicateFilename}". Confirmation required.`,
          existingDocId: existingDoc?.id || null
        }
      });
    }
    seenHashes.set(sha256, file.originalname);
  }

  const uploadStartedAt = Date.now();
  const staged: Array<{
    docId: string;
    storageDir: string;
    storagePath: string;
    file: Express.Multer.File;
    sha256: string;
  }> = [];
  try {
    for (const file of files) {
      const docId = crypto.randomUUID();
      const storageDir = path.resolve(process.env.DATA_DIR || './data', 'uploads', caseId, docId);
      fs.mkdirSync(storageDir, { recursive: true });

      const safeExt = path.extname(file.originalname).toLowerCase();
      const storagePath = path.join(storageDir, `original${safeExt}`);
      staged.push({
        docId,
        storageDir,
        storagePath,
        file,
        sha256: crypto.createHash('sha256').update(file.buffer).digest('hex')
      });
      fs.writeFileSync(storagePath, file.buffer, { flag: 'wx' });
    }
  } catch (error) {
    for (const item of staged) fs.rmSync(item.storageDir, { recursive: true, force: true });
    throw error;
  }

  const uploadedJobs: Array<{ docId: string; filename: string; jobId: string }> = [];
  try {
    const persistUploadBatch = db.transaction(() => {
      for (const item of staged) {
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO documents (
            id, case_id, filename, mime, size_bytes, sha256, storage_path,
            doc_type_guess, page_count, shared_with_guardian, uploaded_by,
            uploaded_at, processing_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 'uploaded')
        `).run(
          item.docId,
          caseId,
          item.file.originalname,
          item.file.mimetype || 'application/octet-stream',
          item.file.size,
          item.sha256,
          item.storagePath,
          docTypeGuess,
          shareWithGuardian,
          req.user!.userId,
          now
        );

        const jobId = insertQueuedJob(db, { caseId, kind: 'process_document', documentId: item.docId });
        uploadedJobs.push({ docId: item.docId, filename: item.file.originalname, jobId });

        insertTimelineEvent(db, {
          caseId,
          eventType: 'document_uploaded',
          description: `Document "${item.file.originalname}" uploaded by ${req.user!.name}.`,
          source: item.file.originalname,
          actorType: req.user!.role,
          actorId: req.user!.userId,
          guardianVisible: shareWithGuardian === 1
        });

        insertAuditEntry(db, {
          actorId: req.user!.userId,
          action: 'document_upload',
          entityType: 'document',
          entityId: item.docId,
          caseId,
          details: { filename: item.file.originalname, size: item.file.size }
        });

        logPipelineStage('UPLOAD', {
          filename: item.file.originalname,
          documentId: item.docId,
          caseId,
          parser: 'queued for document processor',
          extractedCharacters: 0,
          evidenceCount: 0,
          conflictCount: 0,
          missingEvidenceCount: 0,
          startedAt: uploadStartedAt
        }, { mimeType: item.file.mimetype || 'application/octet-stream', sizeBytes: item.file.size, jobId });
      }
    });
    persistUploadBatch();
  } catch (error) {
    for (const item of staged) fs.rmSync(item.storageDir, { recursive: true, force: true });
    throw error;
  }

  await updateCaseStatusIfNeeded(caseId, req.user!.userId);
  for (const item of uploadedJobs) {
    try { await updateEvidenceRequestOnDocument(caseId, item.docId); }
    catch { console.warn('[CaseAgents] Could not update evidence request receipt state.'); }
  }
  scheduleWorker();

  logPipelineStage('API RESPONSE:upload', {
    filename: uploadedJobs.map(job => job.filename).join(', '),
    documentId: uploadedJobs.map(job => job.docId).join(', '),
    caseId,
    parser: 'POST /api/cases/:id/documents',
    extractedCharacters: 0,
    evidenceCount: 0,
    conflictCount: 0,
    missingEvidenceCount: 0,
    startedAt: Date.now()
  }, { status: 200, uploadedDocumentCount: uploadedJobs.length, jobIds: uploadedJobs.map(job => job.jobId) });

  return res.json({
    success: true,
    documents: uploadedJobs
  });
});

// GET /api/cases/:id/documents - List documents
documentsRouter.get('/:id/documents', requireAuth, async (req: Request, res: Response) => {
  const caseId = req.params.id;
  const hasAccess = await canAccessCase(req.user, caseId, 'read_case_summary');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  const db = await getDb();
  let query = 'SELECT * FROM documents WHERE case_id = ? ORDER BY uploaded_at DESC';
  if (req.user!.role === 'guardian') {
    query = `SELECT id, case_id, filename, mime, size_bytes, uploaded_at
      FROM documents WHERE case_id = ? AND shared_with_guardian = 1 ORDER BY uploaded_at DESC`;
  }

  const docs = db.prepare<any>(query).all(caseId);
  return res.json({ documents: docs });
});

// GET /api/documents/:docId/file - Download file
documentsRouter.get('/file/:docId', requireAuth, async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });

  const cap = req.user!.role === 'guardian' ? 'read_documents_shared' : 'read_internal';
  const hasAccess = await canAccessCase(req.user, doc.case_id, cap);
  if (!hasAccess || (req.user!.role === 'guardian' && !doc.shared_with_guardian)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
  }

  if (!fs.existsSync(doc.storage_path)) {
    return res.status(404).json({ error: { code: 'FILE_MISSING', message: 'Stored file not found on disk' } });
  }

  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
  const stream = fs.createReadStream(doc.storage_path);
  stream.pipe(res);
});

// GET /api/documents/:docId/pages - Extracted text pages
documentsRouter.get('/pages/:docId', requireAuth, async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });

  const hasAccess = await canAccessCase(req.user, doc.case_id, 'read_internal');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });

  const pages = db.prepare<any>('SELECT * FROM document_pages WHERE document_id = ? ORDER BY page_no ASC').all(docId);
  return res.json({ pages, document: doc });
});

// PATCH /api/documents/:docId - Toggle guardian sharing
documentsRouter.patch('/:docId', requireAuth, async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });

  const hasAccess = await canAccessCase(req.user, doc.case_id, 'edit');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found' } });

  if (req.body.shared_with_guardian !== undefined) {
    const val = req.body.shared_with_guardian ? 1 : 0;
    db.prepare('UPDATE documents SET shared_with_guardian = ? WHERE id = ?').run(val, docId);

    await recordTimelineEvent({
      caseId: doc.case_id,
      eventType: 'document_shared_with_guardian',
      description: val === 1
        ? `Document "${doc.filename}" made visible to client/guardian.`
        : `Document "${doc.filename}" hidden from client/guardian.`,
      actorType: 'lawyer',
      actorId: req.user!.userId,
      guardianVisible: val === 1
    });
  }

  return res.json({ success: true });
});

// POST /api/documents/:docId/reprocess - Reprocess document
documentsRouter.post('/:docId/reprocess', requireAuth, async (req: Request, res: Response) => {
  const docId = req.params.docId;
  const db = await getDb();
  const doc = db.prepare<any>('SELECT * FROM documents WHERE id = ?').get(docId);
  if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });

  const hasAccess = await canAccessCase(req.user, doc.case_id, 'upload');
  if (!hasAccess) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Case not found or closed' } });

  db.prepare("UPDATE documents SET processing_status = 'uploaded', failure_reason = NULL, processing_warning = NULL WHERE id = ?").run(docId);
  const jobId = await enqueueJob(doc.case_id, 'process_document', docId);

  return res.json({ success: true, jobId });
});
