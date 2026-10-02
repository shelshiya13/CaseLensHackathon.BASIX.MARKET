import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetGeminiClient, mockDisableGeminiForAuthenticationError } = vi.hoisted(() => ({
  mockGetGeminiClient: vi.fn(),
  mockDisableGeminiForAuthenticationError: vi.fn()
}));

vi.mock('../src/agents/geminiClient.js', () => ({
  getGeminiClient: mockGetGeminiClient,
  disableGeminiForAuthenticationError: mockDisableGeminiForAuthenticationError,
  isGeminiAuthenticationRejected: () => false
}));

import { runReconciliationAgent } from '../src/agents/reconciliationAgent.js';
import type { CaseState, CaseStateEvidence } from '../src/agents/state/caseState.js';

describe('Gemini reconciliation fallback', () => {
  beforeEach(() => {
    mockDisableGeminiForAuthenticationError.mockReset().mockReturnValue(true);
  });

  it('persists deterministic model attribution after a rejected Gemini response', async () => {
    const evidence: CaseStateEvidence = {
      id: 'evidence-1',
      ref: 'E-001',
      docId: 'document-1',
      page: 1,
      type: 'invoice_total',
      fact: 'Invoice total is ₹12,500.',
      amount: 1_250_000,
      currency: 'INR',
      amountRaw: '₹12,500',
      sourceQuote: 'Invoice Total Amount: ₹12,500',
      status: 'active',
      createdBy: 'evidence_agent'
    };
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 });
    mockGetGeminiClient.mockReturnValue({
      models: { generateContent: vi.fn().mockRejectedValue(unauthorized) }
    });

    const result = await runReconciliationAgent(
      {} as CaseState,
      [evidence],
      [],
      [],
      { trigger: 'release-test' }
    );

    expect(result.model_used).toBe('rule_engine');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].evidence_refs).toContain('E-001');
    expect(result.summary).toContain('Based on uploaded evidence');
    expect(mockDisableGeminiForAuthenticationError).toHaveBeenCalledWith(unauthorized);
  });
});
