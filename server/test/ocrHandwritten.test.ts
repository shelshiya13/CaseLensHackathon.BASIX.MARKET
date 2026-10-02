import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/agents/geminiClient.js', () => ({ getGeminiClient: () => null, disableGeminiForAuthenticationError: () => false }));

import { upsertOcrResult, getOcrResult } from '../src/ocr/ocrService.js';
import { runMigrations } from '../src/db/migrate.js';
import { getDb } from '../src/db/client.js';
import crypto from 'node:crypto';

describe('handwritten/scan OCR', () => {
  it('persists empty low-confidence result without hallucinating when no text layer exists', async () => {
    process.env.DATA_DIR = process.env.DATA_DIR || './data';
    await runMigrations();
    const db = await getDb();
    const caseId = crypto.randomUUID();
    const now = new Date().toISOString();
    const lawyerId = crypto.randomUUID();
    db.prepare(`INSERT OR IGNORE INTO users (id, role, name, created_at) VALUES (?, 'lawyer', 'OCR Test', ?)`).run(lawyerId, now);
    db.prepare(`INSERT OR IGNORE INTO cases (id, case_ref, title, case_type, status, assigned_lawyer_id, created_at, updated_at) VALUES (?, ?, 'OCR Case', 'Civil', 'New', ?, ?, ?)`).run(caseId, `OCR-${Date.now()}`, lawyerId, now, now);
    const docId = crypto.randomUUID();
    db.prepare(`INSERT INTO documents (id, case_id, filename, mime, size_bytes, sha256, storage_path, page_count, uploaded_by, uploaded_at, processing_status) VALUES (?, ?, 'scan.png', 'image/png', 10, ?, '/tmp/scan.png', 1, ?, ?, 'uploaded')`).run(docId, caseId, crypto.randomUUID(), lawyerId, now);
    const created = await upsertOcrResult(docId, 1, '', 0, 'deterministic_fallback', []);
    expect(created.rawText).toBe('');
    expect(created.confidence).toBe(0);
    expect(created.highlights).toEqual([]);
    const fetched = await getOcrResult(docId, 1);
    expect(fetched?.method).toBe('deterministic_fallback');
    const withText = await upsertOcrResult(docId, 1, 'Receipt total Rs. 500 paid on 12 August 2026. Signed.', 0.62, 'gemini_ocr');
    expect(withText.highlights.length).toBeGreaterThan(0);
    expect(withText.rawText).toContain('Rs. 500');
  });
});
