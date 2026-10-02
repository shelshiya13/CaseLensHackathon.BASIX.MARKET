import { describe, expect, it } from 'vitest';
import { buildDeterministicCaseAiResult, type GroundedCaseContext, type GroundedMode } from '../src/ai/groundedGeneration.js';

const context: GroundedCaseContext = {
  case: { title: 'ABC Manufacturing v XYZ Trading', case_ref: 'CASE-2026-290' },
  question: 'What evidence supports the payment date?',
  evidence: [
    { id: 'row-1', evidence_ref: 'E-001', fact_label: 'Payment record', fact_text: 'Payment of INR 50,000 recorded on 12 March 2026.', source_quote: 'Payment of INR 50,000 recorded on 12 March 2026.', document_filename: 'ledger.pdf', page_no: 2, evidence_type: 'payment', confidence: 0.92, date_value: '2026-03-12' },
    { id: 'row-2', evidence_ref: 'E-002', fact_label: 'Invoice due date', fact_text: 'Invoice due date is 20 March 2026.', source_quote: 'Invoice due date is 20 March 2026.', document_filename: 'invoice.pdf', page_no: 1, evidence_type: 'invoice_line', confidence: 0.54, date_value: '2026-03-20' }
  ],
  conflicts: [{ conflict_ref: 'C-001', description: 'The payment dates differ between records.', why_it_matters: 'Confirm the credited date.', evidence_a_ref: 'E-001', evidence_b_ref: 'E-002' }],
  missing: [{ missing_ref: 'M-001', required_item: 'Bank credit advice', rationale: 'Confirm when the payment posted.', basis_evidence_ids: ['row-1'] }],
  timeline: []
};

function allStrings(value: any): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(allStrings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings);
  return [];
}

describe('deterministic grounded case AI generation', () => {
  it.each<GroundedMode>(['ask', 'hearing_brief', 'counter_argument', 'document_request'])(
    'returns useful %s output from active evidence with valid E-ref citations',
    mode => {
      const result = buildDeterministicCaseAiResult(mode, context);
      expect(result).not.toBeNull();
      const strings = allStrings(result);
      expect(strings.length).toBeGreaterThan(0);
      expect(strings.some(value => /E-001|E-002/.test(value))).toBe(true);
      for (const ref of strings.flatMap(value => [...value.matchAll(/\[(E-[A-Za-z0-9-]+)\]/g)].map(match => match[1]))) {
        expect(['E-001', 'E-002']).toContain(ref);
      }
    }
  );

  it('answers a question with the most relevant stored record', () => {
    const result = buildDeterministicCaseAiResult('ask', context);
    expect(result.answer).toContain('Payment record');
    expect(result.answer).toContain('[E-001]');
  });

  it('builds a document request from saved missing-evidence rows and cites its basis', () => {
    const result = buildDeterministicCaseAiResult('document_request', context);
    expect(result.document_request[0].document).toBe('Bank credit advice');
    expect(result.document_request[0].reason).toContain('[E-001]');
    expect(result.approvalRequired).toBe(true);
  });

  it('returns no generated answer when active evidence is empty', () => {
    expect(buildDeterministicCaseAiResult('hearing_brief', { ...context, evidence: [] })).toBeNull();
  });
});
