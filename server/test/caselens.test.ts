import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateDeterministicConflicts } from '../src/agents/rules/conflictRules.js';
import { deriveCaseStatus } from '../src/cases/status.js';
import { hashOtp } from '../src/auth/otp/index.js';
import { CaseStateEvidence } from '../src/agents/state/caseState.js';
import path from 'node:path';
import { extractDocumentText } from '../src/documents/extractText.js';

describe('CaseLens Unit & Security Tests', () => {

  describe('Conflict Detection Rules', () => {
    it('detects amount mismatches with Indian currency and calculates severity', () => {
      const evidenceList: CaseStateEvidence[] = [
        {
          id: 'ev-1',
          ref: 'E-001',
          docId: 'doc-1',
          page: 1,
          type: 'invoice_total',
          fact: 'Tax Invoice INV-2041 total ₹2,40,000',
          amount: 24000000, // ₹2,40,000 in minor units
          currency: 'INR',
          amountRaw: '₹2,40,000',
          sourceQuote: 'Invoice Total Amount: ₹2,40,000',
          status: 'active',
          createdBy: 'evidence_agent'
        },
        {
          id: 'ev-2',
          ref: 'E-002',
          docId: 'doc-2',
          page: 1,
          type: 'payment',
          fact: 'Bank transaction settled sum of ₹1,80,000',
          amount: 18000000, // ₹1,80,000 in minor units
          currency: 'INR',
          amountRaw: '₹1,80,000',
          sourceQuote: 'Amount Transferred: ₹1,80,000',
          status: 'active',
          createdBy: 'evidence_agent'
        }
      ];

      const conflicts = evaluateDeterministicConflicts(evidenceList);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].conflictType).toBe('amount_mismatch');
      expect(conflicts[0].severity).toBe('High');
      expect(conflicts[0].whyItMatters).toContain('inconsistent payment information');
    });

    it('detects date mismatches when delivery occurs after contractual deadline', () => {
      const evidenceList: CaseStateEvidence[] = [
        {
          id: 'ev-c',
          ref: 'E-010',
          docId: 'doc-c',
          page: 1,
          type: 'contract_term',
          fact: 'Contractual delivery on or before 10 August 2026',
          date: '2026-08-10',
          dateRaw: '10 August 2026',
          sourceQuote: 'delivery shall be completed on or before 10 August 2026',
          status: 'active',
          createdBy: 'evidence_agent'
        },
        {
          id: 'ev-d',
          ref: 'E-011',
          docId: 'doc-d',
          page: 1,
          type: 'delivery',
          fact: 'Goods delivered on 17 August 2026',
          date: '2026-08-17',
          dateRaw: '17 August 2026',
          sourceQuote: 'Delivered on 17 August 2026',
          status: 'active',
          createdBy: 'evidence_agent'
        }
      ];

      const conflicts = evaluateDeterministicConflicts(evidenceList);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].conflictType).toBe('date_mismatch');
      expect(conflicts[0].severity).toBe('High');
      expect(conflicts[0].severityBasis).toContain('Actual delivery (2026-08-17) occurred 7 day(s) after agreed contractual deadline');
    });
  });

  describe('deriveCaseStatus Rules', () => {
    it('derives "New" when no documents are uploaded', () => {
      const status = deriveCaseStatus({}, 0, 0, 0, 0, 0, null, false);
      expect(status).toBe('New');
    });

    it('derives "Under Analysis" when active jobs exist', () => {
      const status = deriveCaseStatus({}, 2, 1, 0, 0, 0, null, false);
      expect(status).toBe('Under Analysis');
    });

    it('derives "Conflict Detected" when open conflicts exist', () => {
      const status = deriveCaseStatus({}, 3, 0, 1, 0, 0, 'conflict_detected', true);
      expect(status).toBe('Conflict Detected');
    });

    it('derives "Missing Evidence" when no conflicts but open missing items', () => {
      const status = deriveCaseStatus({}, 2, 0, 0, 1, 0, 'missing_evidence', true);
      expect(status).toBe('Missing Evidence');
    });

    it('derives "Closed" when closed_at is set', () => {
      const status = deriveCaseStatus({ closed_at: '2026-09-01T00:00:00Z' }, 5, 0, 2, 1, 0, 'conflict_detected', true);
      expect(status).toBe('Closed');
    });
  });

  describe('OTP Security & HMAC Hashing', () => {
    it('produces identical HMAC for matching identifier and code, and diff for mismatch', () => {
      const hmac1 = hashOtp('test@client.com', '123456');
      const hmac2 = hashOtp('test@client.com', '123456');
      const hmacWrong = hashOtp('test@client.com', '654321');
      const hmacDiffUser = hashOtp('other@client.com', '123456');

      expect(hmac1).toBe(hmac2);
      expect(hmac1).not.toBe(hmacWrong);
      expect(hmac1).not.toBe(hmacDiffUser);
    });
  });

  describe('PDF Text Extraction', () => {
    it('extracts text from a text-based PDF using pdf-parse v2', async () => {
      const filename = '01_Supply_Contract.pdf';
      const filePath = path.resolve(process.cwd(), 'server/src/seed/demo-docs', filename);
      const result = await extractDocumentText(filePath, 'application/pdf', filename);

      expect(result.totalChars).toBeGreaterThan(0);
      expect(result.pages[0].text).toContain('MASTER SUPPLY AGREEMENT');
    });
  });
});
