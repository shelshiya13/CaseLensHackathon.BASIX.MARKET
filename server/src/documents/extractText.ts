import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { disableGeminiForAuthenticationError, getGeminiClient } from '../agents/geminiClient.js';
import { logPipelineStage } from '../agents/pipelineLog.js';
import { env } from '../config/env.js';

export interface ExtractedPage {
  pageNo: number;
  text: string;
  method: 'text_layer' | 'gemini_ocr' | 'plain_text' | 'docx';
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  totalChars: number;
  warnings?: string[];
}

export interface DocumentExtractionContext {
  documentId?: string;
  caseId?: string;
}

function logExtractionStage(
  stage: string,
  context: ReturnType<typeof createLogContext>,
  parser: string,
  text = '',
  details: Record<string, unknown> = {}
): void {
  context.parser = parser;
  context.extractedCharacters = text.length;
  context.preview = text.slice(0, 300);
  logPipelineStage(stage, context, details);
}

function createLogContext(filename: string, documentId: string, caseId: string) {
  return {
    filename,
    documentId,
    caseId,
    parser: 'detect by MIME type and extension',
    extractedCharacters: 0,
    evidenceCount: 0,
    conflictCount: 0,
    missingEvidenceCount: 0,
    startedAt: Date.now(),
    preview: ''
  };
}

export async function extractDocumentText(
  filePath: string,
  mimeType: string,
  originalFilename: string,
  context: DocumentExtractionContext = {}
): Promise<ExtractionResult> {
  const ext = path.extname(originalFilename).toLowerCase();
  const pages: ExtractedPage[] = [];
  const warnings: string[] = [];
  const logContext = createLogContext(originalFilename, context.documentId || '', context.caseId || '');
  logExtractionStage('TEXT EXTRACTION:start', logContext, 'detect by MIME type and extension');
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    logExtractionStage('TEXT EXTRACTION:error', logContext, 'file system read', '', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  // 1. Plain text / Markdown / EML
  if (
    mimeType.includes('text/plain') ||
    ext === '.txt' ||
    ext === '.eml' ||
    ext === '.md'
  ) {
    const rawText = buffer.toString('utf-8');
    // If multiple pages demarcated by form-feed \f or large page breaks, split; otherwise 1 page
    const rawPages = rawText.split('\f');
    for (let i = 0; i < rawPages.length; i++) {
      const text = rawPages[i].trim();
      if (text.length > 0) {
        pages.push({
          pageNo: i + 1,
          text,
          method: 'plain_text'
        });
      }
    }
    if (pages.length === 0) {
      pages.push({ pageNo: 1, text: rawText.trim(), method: 'plain_text' });
    }
    logExtractionStage('TEXT EXTRACTION:complete', logContext, 'UTF-8 text decoder', pages.map(page => page.text).join('\n'));
  }

  // 2. DOCX documents
  else if (
    ext === '.docx' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      pages.push({
        pageNo: 1,
        text,
        method: 'docx'
      });
      logExtractionStage('TEXT EXTRACTION:complete', logContext, 'Mammoth DOCX text extractor', text);
    } catch (error) {
      logExtractionStage('TEXT EXTRACTION:error', logContext, 'Mammoth DOCX text extractor', '', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // 3. PDF documents
  else if (mimeType.includes('pdf') || ext === '.pdf') {
    const parserName = 'pdf-parse v2 PDFParse.getText';
    logExtractionStage('TEXT EXTRACTION:PDF start', logContext, parserName);
    let pageTexts: string[];
    let pdfParser: PDFParse | null = null;
    try {
      pdfParser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdfParser.getText();
      pageTexts = result.pages.map(page => page.text || '');
    } catch (parseErr) {
      logExtractionStage('TEXT EXTRACTION:PDF error', logContext, parserName, '', { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
      console.error(`[PDF Extract] ${originalFilename} failed in ${parserName}:`, parseErr);
      if (pdfParser) {
        try {
          await pdfParser.destroy();
        } catch (destroyErr) {
          console.error(`[PDF Extract] Failed to release parser for ${originalFilename}:`, destroyErr);
        }
      }
      throw parseErr;
    }
    if (pdfParser) await pdfParser.destroy();

    const parsedText = pageTexts.join('\n');
    logExtractionStage('TEXT EXTRACTION:PDF complete', logContext, parserName, parsedText, { pageCount: pageTexts.length });

    if (parsedText.trim().length === 0) {
      const ai = getGeminiClient();
      if (!ai) {
        const warning = 'This scanned PDF was stored, but OCR is unavailable. Upload a text-selectable PDF or provide a TXT/DOCX transcription; no evidence was inferred from the image.';
        warnings.push(warning);
        logExtractionStage('OCR:unavailable', logContext, 'manual review required', '', { fallback: 'deterministic_case_analysis' });
        return { pages, totalChars: 0, warnings };
      }

      const ocrParserName = `Gemini OCR (${env.GEMINI_MODEL})`;
      logExtractionStage('OCR:start', logContext, ocrParserName);
      try {
        const base64Pdf = buffer.toString('base64');
        const response = await ai.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: 'application/pdf',
                    data: base64Pdf
                  }
                },
                {
                  text: 'Transcribe all text from this scanned legal document verbatim, preserving line breaks, headings, tables, dates, party names, and amount numbers. Do not add commentary or summarize.'
                }
              ]
            }
          ]
        });

        const ocrText = (response.text || '').trim();
        logExtractionStage('OCR:complete', logContext, ocrParserName, ocrText);
        if (!ocrText) {
          throw new Error(`Gemini OCR returned no text for scanned PDF "${originalFilename}".`);
        }
        pages.push({
          pageNo: 1,
          text: ocrText,
          method: 'gemini_ocr'
        });
      } catch (ocrErr) {
        if (disableGeminiForAuthenticationError(ocrErr)) {
          const warning = 'This scanned PDF was stored, but OCR could not be verified. Upload a text-selectable PDF or provide a TXT/DOCX transcription; no evidence was inferred from the image.';
          warnings.push(warning);
          logExtractionStage('OCR:unavailable', logContext, 'manual review required', '', { fallback: 'deterministic_case_analysis' });
          return { pages, totalChars: 0, warnings };
        }
        logExtractionStage('OCR:error', logContext, ocrParserName, '', { error: ocrErr instanceof Error ? ocrErr.message : String(ocrErr) });
        console.error(`[PDF OCR] ${originalFilename} failed in ${ocrParserName}:`, ocrErr);
        throw ocrErr;
      }
    } else {
      for (let i = 0; i < pageTexts.length; i++) {
        const pt = pageTexts[i].trim();
        if (pt.length > 0 || i === 0) {
          pages.push({
            pageNo: i + 1,
            text: pt,
            method: 'text_layer'
          });
        }
      }
    }
  }

  // 4. Image files (PNG, JPEG, WEBP)
  else if (
    mimeType.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
  ) {
    const ai = getGeminiClient();
    if (!ai) {
      const warning = 'This image was stored, but OCR is unavailable. Upload a text file or provide a TXT/DOCX transcription; no evidence was inferred from the image.';
      warnings.push(warning);
      logExtractionStage('OCR:unavailable', logContext, 'manual review required', '', { fallback: 'deterministic_case_analysis' });
      return { pages, totalChars: 0, warnings };
    } else {
      const mime = mimeType.startsWith('image/') ? mimeType : (ext === '.png' ? 'image/png' : 'image/jpeg');
      const base64Image = buffer.toString('base64');
      const parserName = `Gemini OCR (${env.GEMINI_MODEL})`;
      logExtractionStage('OCR:start', logContext, parserName);
      try {
        const response = await ai.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: mime,
                    data: base64Image
                  }
                },
                {
                  text: 'Transcribe the text of this legal document/scan verbatim. Retain all dates, monetary amounts, invoice details, party names, and clauses exactly as written.'
                }
              ]
            }
          ]
        });
        const text = (response.text || '').trim();
        if (!text) throw new Error(`Gemini OCR returned no text for image "${originalFilename}".`);
        pages.push({ pageNo: 1, text, method: 'gemini_ocr' });
        logExtractionStage('OCR:complete', logContext, parserName, text);
      } catch (error) {
        if (disableGeminiForAuthenticationError(error)) {
          const warning = 'This image was stored, but OCR could not be verified. Upload a text file or provide a TXT/DOCX transcription; no evidence was inferred from the image.';
          warnings.push(warning);
          logExtractionStage('OCR:unavailable', logContext, 'manual review required', '', { fallback: 'deterministic_case_analysis' });
          return { pages, totalChars: 0, warnings };
        }
        logExtractionStage('OCR:error', logContext, parserName, '', {
          error: error instanceof Error ? error.message : String(error)
        });
        console.error(`[Image OCR] ${originalFilename} failed in ${parserName}:`, error);
        throw error;
      }
    }
  } else {
    const error = new Error(`Unsupported document type for "${originalFilename}" (${mimeType}).`);
    logExtractionStage('TEXT EXTRACTION:error', logContext, 'no parser available', '', { error: error.message });
    throw error;
  }

  const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
  logExtractionStage(
    'TEXT EXTRACTION:complete',
    logContext,
    [...new Set(pages.map(page => page.method))].join(', ') || 'none',
    pages.map(page => page.text).join('\n'),
    { totalChars, pageCount: pages.length }
  );
  return { pages, totalChars, warnings: warnings.length ? warnings : undefined };
}
