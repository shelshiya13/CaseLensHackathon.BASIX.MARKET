import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGeminiClient, mockDisableGeminiForAuthenticationError, mockExtractRawText } = vi.hoisted(() => ({
  mockGetGeminiClient: vi.fn(),
  mockDisableGeminiForAuthenticationError: vi.fn(),
  mockExtractRawText: vi.fn()
}));

vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: mockGetGeminiClient,
  disableGeminiForAuthenticationError: mockDisableGeminiForAuthenticationError
}));
vi.mock('mammoth', () => ({ default: { extractRawText: mockExtractRawText } }));

import { extractDocumentText } from '../src/documents/extractText.js';
import { extractDeterministicEvidence, extractEvidenceFromDocument } from '../src/agents/evidenceAgent.js';

describe('Document evidence extraction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caselens-evidence-'));
    mockGetGeminiClient.mockReturnValue(null);
    mockDisableGeminiForAuthenticationError.mockReset().mockReturnValue(false);
    mockExtractRawText.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('extracts grounded parties, identifiers, amounts, deadlines, payment terms, and claims deterministically', () => {
    const text = [
      'MASTER SUPPLY AGREEMENT (REF: CTR-2026-889)',
      'BUYER: Fictional Traders Pvt Ltd.',
      'Invoice Number: INV-2041',
      'Invoice Total Amount: ₹2,40,000',
      'Delivery shall be completed on or before 10 August 2026.',
      'Payment is due within 30 days of delivery.',
      'The buyer alleges that the supplier failed to deliver the goods.'
    ].join('\n');

    const result = extractDeterministicEvidence(text, 1);
    const quotes = result.evidence.map(item => item.sourceQuote);

    expect(result.evidence.some(item => item.entity === 'Fictional Traders Pvt Ltd')).toBe(true);
    expect(result.evidence.some(item => item.entity === 'CTR-2026-889')).toBe(true);
    expect(result.evidence.some(item => item.entity === 'INV-2041')).toBe(true);
    expect(result.evidence.some(item => item.amountRaw === '₹2,40,000' && item.amountValue === 24000000)).toBe(true);
    expect(result.evidence.some(item => item.dateRaw === '10 August 2026' && item.dateValue === '2026-08-10')).toBe(true);
    expect(result.evidence.some(item => item.factLabel === 'Payment Terms')).toBe(true);
    expect(result.evidence.some(item => item.factLabel === 'Contractual Obligation')).toBe(true);
    expect(result.claims.some(item => item.claimKind === 'delivery_completed')).toBe(true);
    expect(quotes.every(quote => text.includes(quote))).toBe(true);
  });

  it('uses deterministic grounded evidence when Gemini fails or returns hallucinated quotes', async () => {
    mockGetGeminiClient.mockReturnValue({
      models: {
        generateContent: vi.fn().mockRejectedValue(new Error('Gemini unavailable'))
      }
    });
    const text = 'Invoice Total Amount: ₹12,500';

    const result = await extractEvidenceFromDocument([{ pageNo: 1, text, method: 'plain_text' }], {
      filename: 'invoice.txt', documentId: 'doc-1', caseId: 'case-1'
    });

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0].sourceQuote).toBe(text);
    expect(result.evidence[0].amountValue).toBe(1250000);
  });

  it('keeps grounded Gemini facts and rejects hallucinated quotes', async () => {
    mockGetGeminiClient.mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            evidence: [
              { evidenceType: 'invoice_total', factLabel: 'Invoice total', factText: 'Total ₹12,500', amountRaw: '₹12,500', sourceQuote: 'Invoice Total Amount: ₹12,500' },
              { evidenceType: 'payment', factLabel: 'Invented', factText: 'Invented payment', sourceQuote: 'The document says payment was ₹99,999' },
              { evidenceType: 'payment', factLabel: 'Unsupported scalar', factText: 'The invoice is fully paid', amountRaw: '₹99,999', sourceQuote: 'Invoice Total Amount: ₹12,500' }
            ],
            claims: []
          })
        })
      }
    });
    const text = 'Invoice Total Amount: ₹12,500';

    const result = await extractEvidenceFromDocument([{ pageNo: 1, text, method: 'plain_text' }]);

    expect(result.evidence.some(item => item.sourceQuote === text && item.factText === text)).toBe(true);
    expect(result.evidence.some(item => item.factLabel === 'Invented')).toBe(false);
    expect(result.evidence.some(item => item.factLabel === 'Unsupported scalar')).toBe(false);
    expect(result.rejectionCount).toBe(2);
  });

  it('falls back when Gemini succeeds but returns no facts for non-empty text', async () => {
    mockGetGeminiClient.mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: JSON.stringify({ evidence: [], claims: [] }) })
      }
    });
    const text = 'Invoice Total Amount: ₹12,500';

    const result = await extractEvidenceFromDocument([{ pageNo: 1, text, method: 'plain_text' }]);

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.some(item => item.sourceQuote === text && item.amountValue === 1250000)).toBe(true);
  });

  it('extracts PDF text without requiring Gemini OCR', async () => {
    mockGetGeminiClient.mockReturnValue(null);
    const filename = '01_Supply_Contract.pdf';
    const filePath = path.resolve(process.cwd(), 'server/src/seed/demo-docs', filename);

    const result = await extractDocumentText(filePath, 'application/pdf', filename);

    expect(result.totalChars).toBeGreaterThan(300);
    expect(result.pages[0].method).toBe('text_layer');
    expect(result.pages[0].text).toContain('MASTER SUPPLY AGREEMENT');
  });

  it('extracts TXT and DOCX text', async () => {
    const txtPath = path.join(tempDir, 'contract.txt');
    const docxPath = path.join(tempDir, 'contract.docx');
    fs.writeFileSync(txtPath, 'The contract requires delivery within 30 days.');
    fs.writeFileSync(docxPath, 'docx fixture');
    mockExtractRawText.mockResolvedValue({ value: 'The contract requires delivery within 30 days.' });

    const txtResult = await extractDocumentText(txtPath, 'text/plain', 'contract.txt');
    const docxResult = await extractDocumentText(docxPath, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'contract.docx');

    expect(txtResult.pages[0].text).toContain('delivery within 30 days');
    expect(docxResult.pages[0].method).toBe('docx');
    expect(docxResult.totalChars).toBeGreaterThan(0);
  });

  it('uses Gemini OCR for images and returns extracted text', async () => {
    const imagePath = path.join(tempDir, 'scan.png');
    fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));
    mockGetGeminiClient.mockReturnValue({
      models: {
        generateContent: vi.fn().mockResolvedValue({ text: 'Invoice Total Amount: ₹12,500' })
      }
    });

    const result = await extractDocumentText(imagePath, 'image/png', 'scan.png');

    expect(result.pages[0].method).toBe('gemini_ocr');
    expect(result.pages[0].text).toContain('Invoice Total Amount');
  });

  it('returns a manual-review warning instead of failing when image OCR is unavailable', async () => {
    const imagePath = path.join(tempDir, 'scan.png');
    fs.writeFileSync(imagePath, Buffer.from([137, 80, 78, 71]));
    mockGetGeminiClient.mockReturnValue(null);

    const result = await extractDocumentText(imagePath, 'image/png', 'scan.png');

    expect(result.pages).toHaveLength(0);
    expect(result.totalChars).toBe(0);
    expect(result.warnings?.[0]).toContain('no evidence was inferred');
  });
});