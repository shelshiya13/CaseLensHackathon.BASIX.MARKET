import crypto from 'crypto';
import { getDb } from '../db/client.js';
import { getGeminiClient, disableGeminiForAuthenticationError } from '../agents/geminiClient.js';
import { env } from '../config/env.js';

export interface OcrHighlight { text: string; confidence: number; }
export interface OcrResultView {
  id: string; documentId: string; pageNo: number;
  rawText: string; confidence: number; method: string;
  highlights: OcrHighlight[]; createdAt: string;
}

const RECEIPT_KEYWORDS = ['receipt','invoice','amount','total','paid','rs','signature','signed','date','bill','payment','balance'];

function ocrConfidence(text: string): number {
  const lower = text.toLowerCase();
  const hits = RECEIPT_KEYWORDS.filter(k => lower.includes(k)).length;
  if (text.trim().length < 20) return 0.25;
  if (hits >= 3) return 0.62;
  if (hits >= 1) return 0.5;
  return 0.4;
}

export async function upsertOcrResult(
  documentId: string, pageNo: number, rawText: string,
  confidence: number, method: string, highlights?: OcrHighlight[],
): Promise<OcrResultView> {
  const db = await getDb();
  const computed: OcrHighlight[] = highlights && highlights.length > 0
    ? highlights.slice(0, 20)
    : rawText
      ? rawText.split(/(?<=[.!?\n])\s+/).filter(s => s.trim().length >= 8).slice(0, 10)
        .map(s => ({ text: s.trim().slice(0, 300), confidence }))
      : [];
  const existing = db.prepare<any>('SELECT id, created_at FROM ocr_results WHERE document_id = ? AND page_no = ?').get(documentId, pageNo);
  const now = new Date().toISOString();
  if (existing) {
    db.prepare('UPDATE ocr_results SET raw_text = ?, confidence = ?, method = ?, highlights_json = ? WHERE id = ?')
      .run(rawText, confidence, method, JSON.stringify(computed), existing.id);
    return { id: existing.id, documentId, pageNo, rawText, confidence, method, highlights: computed, createdAt: existing.created_at };
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO ocr_results (id, document_id, page_no, raw_text, confidence, method, highlights_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, documentId, pageNo, rawText, confidence, method, JSON.stringify(computed), now);
  return { id, documentId, pageNo, rawText, confidence, method, highlights: computed, createdAt: now };
}

export async function runOcrForDocument(documentId: string, pageNo = 1, mimeHint = 'image/png'): Promise<OcrResultView> {
  const db = await getDb();
  const doc = db.prepare<any>('SELECT id FROM documents WHERE id = ?').get(documentId);
  if (!doc) throw new Error('Document not found');
  const page = db.prepare<any>('SELECT text, extraction_method FROM document_pages WHERE document_id = ? AND page_no = ?').get(documentId, pageNo);
  const existingText = ((page?.text as string) || '').trim();
  if (existingText) {
    const confidence = page?.extraction_method === 'gemini_ocr' ? 0.88 : 0.75;
    return upsertOcrResult(documentId, pageNo, existingText, confidence, page?.extraction_method || 'text_layer');
  }
  const ai = getGeminiClient();
  if (!ai) {
    return upsertOcrResult(documentId, pageNo, '', 0, 'deterministic_fallback', []);
  }
  try {
    const stored = db.prepare<any>('SELECT storage_path FROM documents WHERE id = ?').get(documentId) as { storage_path?: string };
    const fs = await import('node:fs');
    const buffer: Buffer = stored?.storage_path && fs.existsSync(stored.storage_path) ? fs.readFileSync(stored.storage_path) : Buffer.alloc(0);
    if (buffer.length === 0) return upsertOcrResult(documentId, pageNo, '', 0, 'deterministic_fallback', []);
    const response = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: mimeHint, data: buffer.toString('base64') } },
        { text: 'Transcribe this phone photo / scan / receipt / invoice / signed document verbatim. Preserve amounts, dates, and names. Return JSON {"text":"...","confidence":0.0,"highlights":[{"text":"exact substring of text","confidence":0.0}]}. Confidence values must be between 0 and 1 and reflect legibility; use lower values for unclear handwriting.' },
      ] }],
      config: {
        systemInstruction: 'You transcribe handwritten and printed legal scans verbatim. Never invent content. Return JSON only.',
        responseMimeType: 'application/json',
      },
    });
    const parsed = JSON.parse(response.text || '{}') as { text?: string; confidence?: number; highlights?: OcrHighlight[] };
    const rawText = typeof parsed.text === 'string' ? parsed.text.slice(0, 12000) : '';
    // Only retain highlights that are exact substrings of the transcript.
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.filter(item => item && typeof item.text === 'string' && rawText.includes(item.text))
        .slice(0, 20)
        .map(item => ({ text: item.text, confidence: Number.isFinite(item.confidence) ? Math.max(0, Math.min(1, item.confidence)) : 0 }))
      : undefined;
    const reportedConfidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
      ? Math.max(0, Math.min(1, parsed.confidence))
      : ocrConfidence(rawText);
    const confidence = rawText ? reportedConfidence : 0;
    return upsertOcrResult(documentId, pageNo, rawText, confidence, rawText ? 'gemini_ocr' : 'deterministic_fallback', highlights);
  } catch (error) {
    disableGeminiForAuthenticationError(error);
    return upsertOcrResult(documentId, pageNo, '', 0, 'deterministic_fallback', []);
  }
}

export async function getOcrResult(documentId: string, pageNo = 1): Promise<OcrResultView | null> {
  const db = await getDb();
  const row = db.prepare<any>('SELECT * FROM ocr_results WHERE document_id = ? AND page_no = ?').get(documentId, pageNo);
  if (!row) return null;
  return {
    id: row.id, documentId: row.document_id, pageNo: row.page_no,
    rawText: row.raw_text, confidence: row.confidence, method: row.method,
    highlights: JSON.parse(row.highlights_json || '[]'), createdAt: row.created_at,
  };
}

